const { prisma } = require('../packages/database/dist');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');
const { sendZaloOaHttp, fetchZaloUserProfile, fetchZaloOaInfo } = require('../packages/shared/dist');

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';

(async () => {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials, key));
  const token = creds.accessToken || creds.access_token;
  const expires = creds.accessTokenExpiresAt || conn.tokenExpiresAt;

  const conv = await prisma.chatbotConversation.findFirst({
    where: { organizationId: ORG, channel: 'zalo', channelRef: OA, NOT: { externalUserId: { startsWith: 'e2e_' } } },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });

  let oaInfo = null;
  let oaErr = null;
  try {
    oaInfo = await fetchZaloOaInfo(token);
  } catch (e) {
    oaErr = String(e.message || e).slice(0, 160);
  }

  const uid = conv?.externalUserId || '';
  let profile = null;
  if (uid) {
    profile = await fetchZaloUserProfile({ accessToken: token, userId: uid });
  }

  // Probe official endpoints without sending if no real uid — but we have real uid
  const probes = [];
  const endpoints = [
    'https://openapi.zalo.me/v2.0/oa/message/cs',
    'https://openapi.zalo.me/v3.0/oa/message/cs',
  ];

  for (const url of endpoints) {
    if (!uid) break;
    const res = await fetch(url, {
      method: 'POST',
      headers: { access_token: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { user_id: uid },
        message: { text: `Probe endpoint ${url.includes('v3') ? 'v3' : 'v2'} ${new Date().toISOString().slice(11, 19)}` },
      }),
    });
    const body = await res.json();
    probes.push({
      url: url.replace('https://openapi.zalo.me', ''),
      http: res.status,
      error: body.error ?? null,
      message: body.message || null,
      messageId: body.data?.message_id ? String(body.data.message_id).slice(0, 16) : null,
    });
    // Only send one successful message to phone
    if (!body.error || Number(body.error) === 0) break;
  }

  const ids = await prisma.messagingContactIdentity.findMany({
    where: { organizationId: ORG, channel: 'ZALO' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      externalUserId: true,
      displayName: true,
      chatbotConversationId: true,
      lastInboundAt: true,
    },
  });

  const events = await prisma.messagingWebhookEvent.findMany({
    where: { organizationId: ORG, channel: 'ZALO' },
    orderBy: { receivedAt: 'desc' },
    take: 10,
    select: { eventKey: true, receivedAt: true, processedAt: true },
  });

  console.log(
    JSON.stringify(
      {
        tokenExpiresAt: expires,
        tokenExpired: expires ? new Date(expires).getTime() < Date.now() : null,
        oaInfo: oaInfo
          ? { oa_id: oaInfo.oa_id, name: oaInfo.name, matchDigi: oaInfo.oa_id === OA }
          : null,
        oaErr,
        conv: conv
          ? {
              id: conv.id.slice(0, 8),
              uidTail: uid.slice(-6),
              uidLen: uid.length,
              name: conv.visitorName,
              msgs: conv.messages.map((m) => ({
                d: m.direction,
                s: m.status,
                t: (m.message || '').slice(0, 40),
              })),
            }
          : null,
        profile: profile
          ? {
              errorCode: profile.errorCode,
              errorMessage: profile.errorMessage,
              hasName: Boolean(profile.displayName),
              hasAvatar: Boolean(profile.avatarUrl),
            }
          : null,
        sendProbes: probes,
        identities: ids.map((i) => ({
          uidTail: i.externalUserId.slice(-6),
          uidLen: i.externalUserId.length,
          name: i.displayName,
          conv: i.chatbotConversationId?.slice(0, 8) || null,
          inbound: i.lastInboundAt,
        })),
        events: events.map((e) => ({
          key: e.eventKey.slice(0, 110),
          at: e.receivedAt,
          processed: Boolean(e.processedAt),
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e.stack || e).slice(0, 600));
  process.exit(1);
});
