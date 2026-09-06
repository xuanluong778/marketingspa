/**
 * E2E: signed Zalo webhook → CSKH inbox → staff reply via real Zalo API.
 * Uses Digi OA secrets to MAC payloads (same as Zalo Official Account).
 * Does not print tokens/secrets.
 */
const { prisma } = require('../packages/database/dist');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');
const {
  buildZaloWebhookMacHex,
} = require('../packages/shared/dist/zalo-webhook-signature');

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';
const BOT = '622aba28-4702-4f95-b367-9c1f5c282ed3';
const APP_ID = process.env.ZALO_APP_ID || '';
const API = process.env.API_BASE_URL || 'http://127.0.0.1:4000';

async function postSigned(payload, secret) {
  const raw = JSON.stringify(payload);
  const mac = buildZaloWebhookMacHex({
    appId: APP_ID,
    rawBody: raw,
    timestamp: payload.timestamp,
    oaSecretKey: secret,
  });
  const res = await fetch(`${API}/api/v1/webhooks/zalo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zevent-signature': `mac=${mac}`,
    },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 200) };
}

(async () => {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  if (!conn?.encryptedCredentials) throw new Error('missing connection');
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials, key));
  const secrets = [creds.oaSecretKey, creds.webhookSecret].filter(Boolean);
  if (!secrets.length) throw new Error('missing oa secret');
  if (!APP_ID) throw new Error('missing ZALO_APP_ID');

  // Prefer a stable test user id for reply window — use existing identity if any
  let userId = '';
  const existing = await prisma.messagingContactIdentity.findFirst({
    where: { organizationId: ORG, channel: 'ZALO' },
    orderBy: { lastInboundAt: 'desc' },
  });
  userId = existing?.externalUserId || `e2e_${Date.now().toString(36)}`;

  const ts = Date.now();
  const texts = ['Hello', 'Tôi cần tư vấn'];
  const postResults = [];
  for (let i = 0; i < texts.length; i++) {
    const payload = {
      app_id: APP_ID,
      oa_id: OA,
      event_name: 'user_send_text',
      timestamp: String(ts + i),
      sender: { id: userId },
      recipient: { id: OA },
      message: { text: texts[i], msg_id: `e2e_mid_${ts}_${i}` },
    };
    let last;
    for (const secret of secrets) {
      last = await postSigned(payload, secret);
      if (last.status === 200) break;
    }
    postResults.push({ text: texts[i], ...last });
  }

  // Wait for worker
  await new Promise((r) => setTimeout(r, 2500));

  const sessionId = `zalo:${OA}:${userId}`.slice(0, 64);
  const conv = await prisma.chatbotConversation.findFirst({
    where: { organizationId: ORG, sessionId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      bot: { select: { id: true, botName: true } },
    },
  });

  const identity = await prisma.messagingContactIdentity.findFirst({
    where: { organizationId: ORG, externalUserId: userId, channel: 'ZALO' },
  });

  const inboundOk = Boolean(
    conv &&
      conv.channel === 'zalo' &&
      conv.channelRef === OA &&
      conv.botId === BOT &&
      texts.every((t) => conv.messages.some((m) => m.direction === 'INBOUND' && m.message === t)),
  );

  let replyOk = false;
  let replyStatus = null;
  let replyError = null;
  if (conv && inboundOk) {
    // Direct reply path via service logic equivalent: call Zalo API + persist like inbox reply
    const { sendZaloOaHttp } = require('../packages/shared/dist/messaging-send-http');
    const accessToken = creds.accessToken || creds.access_token;
    const replyText = `CSKH trả lời E2E ${new Date().toISOString().slice(11, 19)}`;
    const send = await sendZaloOaHttp({
      accessToken,
      recipientId: userId,
      text: replyText,
    });
    replyStatus = {
      success: send.success,
      messageId: send.messageId ? String(send.messageId).slice(0, 12) : null,
      message: send.message,
      reasonCode: send.reasonCode || null,
    };
    if (send.success) {
      await prisma.chatbotMessage.create({
        data: {
          conversationId: conv.id,
          role: 'assistant',
          message: replyText,
          status: 'SENT',
          direction: 'OUTBOUND',
          senderType: 'STAFF',
          externalMessageId: send.messageId?.slice(0, 128) || null,
        },
      });
      await prisma.chatbotConversation.update({
        where: { id: conv.id },
        data: { humanTakeover: true, status: 'NEEDS_STAFF', updatedAt: new Date() },
      });
      replyOk = true;
    } else {
      replyError = send.message || send.reasonCode || 'send_failed';
    }
  }

  // Multi-tenant: conversation must stay on Digi org only
  const leak = conv
    ? await prisma.chatbotConversation.count({
        where: { sessionId, NOT: { organizationId: ORG } },
      })
    : -1;

  console.log(
    JSON.stringify(
      {
        userIdTail: userId.slice(-6),
        userIdSynthetic: !existing,
        postResults,
        inboundOk,
        conversationId: conv?.id?.slice(0, 8) || null,
        botName: conv?.bot?.botName || null,
        botIdMatch: conv?.botId === BOT,
        identityLinked: Boolean(identity?.chatbotConversationId),
        messageCount: conv?.messages?.length || 0,
        inboundTexts: (conv?.messages || [])
          .filter((m) => m.direction === 'INBOUND')
          .map((m) => m.message),
        replyOk,
        replyStatus,
        replyError,
        multiTenantOk: leak === 0,
        note:
          'Signed webhook replay — Zalo OA never POSTed Hello to this server historically (0 ZALO webhook events).',
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e.stack || e).slice(0, 500));
  process.exit(1);
});
