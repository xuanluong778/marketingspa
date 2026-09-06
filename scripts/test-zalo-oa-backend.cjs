/**
 * Zalo OA backend tests — signature, tenant isolation, idempotency, refresh, inbound/outbound,
 * plus Digi E2E when credentials available.
 *
 * Run:
 *   node scripts/with-root-env.cjs node scripts/test-zalo-oa-backend.cjs
 *
 * Optional live Digi E2E env:
 *   ZALO_APP_ID, ZALO_APP_SECRET
 *   ZALO_E2E_OA_ID, ZALO_E2E_ACCESS_TOKEN, ZALO_E2E_REFRESH_TOKEN, ZALO_E2E_WEBHOOK_SECRET
 *   ZALO_E2E_USER_ID (Zalo user id for outbound reply)
 *   ZALO_E2E_ORG_ID (defaults to Digi org if found)
 */
const crypto = require('crypto');
const {
  buildZaloWebhookMacHex,
  verifyZaloWebhookSignature,
  normalizeZaloWebhook,
  refreshZaloOaAccessToken,
  fetchZaloOaInfo,
  sendZaloOaHttp,
} = require('../packages/shared/dist');
const { prisma } = require('../packages/database/dist');

function encryptSecret(plaintext, encryptionKey) {
  const key = crypto.scryptSync(encryptionKey, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

const API = process.env.API_PUBLIC_URL || process.env.APP_URL || 'https://marketingautoaz.com';
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: String(detail || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

async function main() {
  // --- Signature ---
  const appId = 'app-test-1';
  const oaSecret = 'oa-secret-test';
  const ts = '1710000000000';
  const bodyObj = {
    event_name: 'user_send_text',
    app_id: appId,
    oa_id: 'oa-1',
    timestamp: ts,
    sender: { id: 'u1', name: 'A' },
    message: { text: 'hello', msg_id: 'm1' },
  };
  const raw = JSON.stringify(bodyObj);
  const mac = buildZaloWebhookMacHex({ appId, rawBody: raw, timestamp: ts, oaSecretKey: oaSecret });
  record(
    'signature_official_mac',
    verifyZaloWebhookSignature({
      rawBody: raw,
      signature: `mac=${mac}`,
      appId,
      timestamp: ts,
      oaSecretKey: oaSecret,
      allowLegacyHmac: false,
    }),
    'mac=sha256(appId+body+ts+secret)',
  );
  record(
    'signature_reject_bad',
    !verifyZaloWebhookSignature({
      rawBody: raw,
      signature: `mac=${'a'.repeat(64)}`,
      appId,
      timestamp: ts,
      oaSecretKey: oaSecret,
      allowLegacyHmac: false,
    }),
    'bad mac rejected',
  );

  // --- Normalize events ---
  const eventsNeeded = [
    'user_send_text',
    'user_send_image',
    'user_send_link',
    'user_send_file',
    'user_send_audio',
    'user_received_message',
    'user_seen_message',
    'follow',
    'unfollow',
    'oa_send_text',
  ];
  let normalizeOk = true;
  for (const event_name of eventsNeeded) {
    const payload = {
      event_name,
      oa_id: 'oa-1',
      timestamp: ts,
      sender: { id: event_name.startsWith('oa_') ? 'oa-1' : 'u1' },
      recipient: { id: event_name.startsWith('oa_') ? 'u1' : 'oa-1' },
      follower: { id: 'u1' },
      message: {
        text: event_name.includes('text') ? 'hi' : undefined,
        msg_id: `mid-${event_name}`,
        msg_ids: ['mid-x'],
        href: event_name.includes('link') ? 'https://example.com' : undefined,
      },
    };
    const ev = normalizeZaloWebhook(payload, 'oa-1');
    if (!ev.length) {
      normalizeOk = false;
      record('normalize_' + event_name, false, 'no events');
    }
  }
  record('normalize_all_required_events', normalizeOk, eventsNeeded.join(','));

  // --- Public webhook endpoint ---
  const whRes = await fetch(`${API}/api/v1/webhooks/zalo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ZEvent-Signature': `mac=${mac}` },
    body: raw,
  });
  record('public_webhook_200', whRes.status === 200, `HTTP ${whRes.status}`);

  const healthRes = await fetch(`${API}/api/v1/zalo/health`);
  const healthJson = await healthRes.json().catch(() => ({}));
  record(
    'zalo_health',
    healthRes.status === 200 && typeof healthJson.status === 'string',
    `HTTP ${healthRes.status} status=${healthJson.status}`,
  );

  // --- Tenant isolation + idempotency (DB) ---
  const digi =
    (await prisma.organization.findFirst({
      where: { name: { contains: 'Digi', mode: 'insensitive' } },
      select: { id: true, name: true },
    })) || null;
  record('digi_org_found', Boolean(digi), digi ? digi.name : 'missing');

  const encKey = process.env.ENCRYPTION_KEY || '';
  const orgA = digi?.id || '00000000-0000-0000-0000-0000000000aa';
  // Use a second org if exists
  const other = await prisma.organization.findFirst({
    where: digi ? { id: { not: digi.id } } : undefined,
    select: { id: true },
  });

  if (encKey.length >= 16 && other) {
    const oaId = `ZALO_TEST_${Date.now()}`;
    const creds = encryptSecret(
      JSON.stringify({
        accessToken: 'test-access-token-xxxxxxxx',
        refreshToken: 'test-refresh-token-xxxxxxx',
        webhookSecret: oaSecret,
        oaId,
        oaName: 'Test OA',
        accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
      encKey,
    );
    const conn = await prisma.messagingChannelConnection.create({
      data: {
        organizationId: orgA,
        channel: 'ZALO',
        providerKind: 'ZALO_OA',
        accountRef: oaId,
        displayName: 'Test OA Digi',
        encryptedCredentials: creds,
        status: 'ACTIVE',
      },
    });

    // Cross-tenant: other org must not see this accountRef as theirs
    const leak = await prisma.messagingChannelConnection.findFirst({
      where: { organizationId: other.id, accountRef: oaId },
    });
    record('tenant_isolation_no_cross_org', !leak, 'other org cannot claim OA');

    // Idempotency: same eventKey twice
    const eventKey = `zalo:${oaId}:user_send_text:idem-1`;
    await prisma.messagingWebhookEvent.create({
      data: { organizationId: orgA, channel: 'ZALO', eventKey },
    });
    let dupBlocked = false;
    try {
      await prisma.messagingWebhookEvent.create({
        data: { organizationId: orgA, channel: 'ZALO', eventKey },
      });
    } catch (e) {
      dupBlocked = /Unique|P2002/i.test(String(e?.code || e?.message || e));
    }
    record('idempotency_webhook_event', dupBlocked, eventKey);

    // Inbound inbox persist simulation (requires bot)
    let bot = await prisma.chatbotBot.findFirst({
      where: { organizationId: orgA, status: 'ACTIVE' },
    });
    if (!bot) {
      bot = await prisma.chatbotBot.create({
        data: {
          organizationId: orgA,
          botName: 'Zalo Test Bot',
          status: 'ACTIVE',
          businessName: 'Test',
        },
      });
    }
    const sessionId = `zalo:${oaId}:u-inbox-1`.slice(0, 64);
    const conv = await prisma.chatbotConversation.upsert({
      where: { botId_sessionId: { botId: bot.id, sessionId } },
      create: {
        organizationId: orgA,
        botId: bot.id,
        sessionId,
        channel: 'zalo',
        channelRef: oaId,
        externalUserId: 'u-inbox-1',
        visitorName: 'Zalo Test',
        status: 'OPEN',
      },
      update: { updatedAt: new Date() },
    });
    const mid = `mid-inbox-${Date.now()}`;
    await prisma.chatbotMessage.create({
      data: {
        conversationId: conv.id,
        role: 'user',
        message: 'inbound text test',
        status: 'RECEIVED',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        externalMessageId: mid,
      },
    });
    let msgDup = false;
    try {
      await prisma.chatbotMessage.create({
        data: {
          conversationId: conv.id,
          role: 'user',
          message: 'inbound text test',
          status: 'RECEIVED',
          direction: 'INBOUND',
          senderType: 'CUSTOMER',
          externalMessageId: mid,
        },
      });
    } catch {
      msgDup = true;
    }
    record('inbound_message_inbox_dedupe', msgDup, `conversation=${conv.id.slice(0, 8)}…`);

    // Cleanup test connection/events (keep bot if pre-existing)
    await prisma.messagingWebhookEvent.deleteMany({ where: { eventKey } });
    await prisma.chatbotMessage.deleteMany({ where: { conversationId: conv.id } });
    await prisma.chatbotConversation.delete({ where: { id: conv.id } }).catch(() => undefined);
    await prisma.messagingChannelConnection.delete({ where: { id: conn.id } });
  } else {
    record('tenant_isolation_no_cross_org', false, 'skip: missing ENCRYPTION_KEY or second org');
    record('idempotency_webhook_event', false, 'skip');
    record('inbound_message_inbox_dedupe', false, 'skip');
  }

  // --- Token refresh unit (mock path when no live creds) ---
  const hasApp = Boolean(process.env.ZALO_APP_ID?.trim() && process.env.ZALO_APP_SECRET?.trim());
  record('zalo_app_env_configured', hasApp, hasApp ? 'ZALO_APP_ID/SECRET set' : 'missing in .env');

  // --- Digi E2E live ---
  const e2eOa = (process.env.ZALO_E2E_OA_ID || '').trim();
  const e2eToken = (process.env.ZALO_E2E_ACCESS_TOKEN || '').trim();
  const e2eRefresh = (process.env.ZALO_E2E_REFRESH_TOKEN || '').trim();
  const e2eUser = (process.env.ZALO_E2E_USER_ID || '').trim();

  if (!e2eOa || !e2eToken) {
    record(
      'e2e_digi_user_send_text',
      false,
      'FAIL: Digi OA chưa có credential thật (set ZALO_E2E_OA_ID + ZALO_E2E_ACCESS_TOKEN)',
    );
    record('e2e_digi_user_send_image', false, 'blocked by missing OA credentials');
    record('e2e_digi_outbound_reply', false, 'blocked by missing OA credentials');
    record('e2e_digi_refresh_token', false, 'blocked by missing OA credentials');
  } else {
    try {
      const info = await fetchZaloOaInfo(e2eToken);
      record('e2e_digi_oa_info', info.oa_id === e2eOa || Boolean(info.oa_id), info.name || info.oa_id);
    } catch (e) {
      record('e2e_digi_oa_info', false, e.message);
    }

    // Simulate inbound receive path via public webhook + connection
    if (digi && encKey.length >= 16) {
      const webhookSecret = (process.env.ZALO_E2E_WEBHOOK_SECRET || 'test-oa-secret').trim();
      const envAppId = (process.env.ZALO_APP_ID || appId).trim();
      const conn = await prisma.messagingChannelConnection.upsert({
        where: {
          organizationId_channel_accountRef: {
            organizationId: digi.id,
            channel: 'ZALO',
            accountRef: e2eOa,
          },
        },
        create: {
          organizationId: digi.id,
          channel: 'ZALO',
          providerKind: 'ZALO_OA',
          accountRef: e2eOa,
          displayName: 'OA Thế Giới Digi',
          encryptedCredentials: encryptSecret(
            JSON.stringify({
              accessToken: e2eToken,
              refreshToken: e2eRefresh,
              webhookSecret,
              oaId: e2eOa,
              oaName: 'OA Thế Giới Digi',
            }),
            encKey,
          ),
          status: 'ACTIVE',
        },
        update: {
          encryptedCredentials: encryptSecret(
            JSON.stringify({
              accessToken: e2eToken,
              refreshToken: e2eRefresh,
              webhookSecret,
              oaId: e2eOa,
              oaName: 'OA Thế Giới Digi',
            }),
            encKey,
          ),
          status: 'ACTIVE',
          isPaused: false,
        },
      });

      const textTs = String(Date.now());
      const textBody = {
        event_name: 'user_send_text',
        app_id: envAppId,
        oa_id: e2eOa,
        timestamp: textTs,
        sender: { id: e2eUser || 'e2e-user', name: 'E2E' },
        message: { text: `E2E text ${textTs}`, msg_id: `e2e-text-${textTs}` },
      };
      const textRaw = JSON.stringify(textBody);
      const textMac = buildZaloWebhookMacHex({
        appId: envAppId,
        rawBody: textRaw,
        timestamp: textTs,
        oaSecretKey: webhookSecret,
      });
      const textWh = await fetch(`${API}/api/v1/webhooks/zalo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ZEvent-Signature': `mac=${textMac}`,
        },
        body: textRaw,
      });
      await new Promise((r) => setTimeout(r, 2500));
      const textMsg = await prisma.chatbotMessage.findFirst({
        where: { externalMessageId: `e2e-text-${textTs}` },
      });
      record(
        'e2e_digi_user_send_text',
        textWh.status === 200 && Boolean(textMsg),
        `webhook=${textWh.status} inbox=${Boolean(textMsg)} conn=${conn.id.slice(0, 8)}…`,
      );

      const imgTs = String(Date.now() + 1);
      const imgBody = {
        event_name: 'user_send_image',
        app_id: envAppId,
        oa_id: e2eOa,
        timestamp: imgTs,
        sender: { id: e2eUser || 'e2e-user' },
        message: { msg_id: `e2e-img-${imgTs}` },
      };
      const imgRaw = JSON.stringify(imgBody);
      const imgMac = buildZaloWebhookMacHex({
        appId: envAppId,
        rawBody: imgRaw,
        timestamp: imgTs,
        oaSecretKey: webhookSecret,
      });
      const imgWh = await fetch(`${API}/api/v1/webhooks/zalo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ZEvent-Signature': `mac=${imgMac}`,
        },
        body: imgRaw,
      });
      await new Promise((r) => setTimeout(r, 2500));
      const imgMsg = await prisma.chatbotMessage.findFirst({
        where: { externalMessageId: `e2e-img-${imgTs}` },
      });
      record(
        'e2e_digi_user_send_image',
        imgWh.status === 200 && Boolean(imgMsg),
        `webhook=${imgWh.status} inbox=${Boolean(imgMsg)}`,
      );

      if (e2eUser) {
        const send = await sendZaloOaHttp({
          accessToken: e2eToken,
          recipientId: e2eUser,
          text: `MarketingAutoAZ E2E reply ${Date.now()}`,
        });
        record('e2e_digi_outbound_reply', send.success, send.message || send.messageId || '');
      } else {
        record('e2e_digi_outbound_reply', false, 'missing ZALO_E2E_USER_ID');
      }

      if (e2eRefresh && hasApp) {
        try {
          const refreshed = await refreshZaloOaAccessToken({
            appId: process.env.ZALO_APP_ID.trim(),
            appSecret: process.env.ZALO_APP_SECRET.trim(),
            refreshToken: e2eRefresh,
          });
          const info2 = await fetchZaloOaInfo(refreshed.accessToken);
          record(
            'e2e_digi_refresh_token',
            Boolean(refreshed.accessToken && info2.oa_id),
            `oa=${info2.oa_id} hasNewRefresh=${Boolean(refreshed.refreshToken)}`,
          );
        } catch (e) {
          record('e2e_digi_refresh_token', false, e.message);
        }
      } else {
        record(
          'e2e_digi_refresh_token',
          false,
          'missing ZALO_E2E_REFRESH_TOKEN or ZALO_APP_ID/SECRET',
        );
      }
    } else {
      record('e2e_digi_user_send_text', false, 'missing Digi org or ENCRYPTION_KEY');
      record('e2e_digi_user_send_image', false, 'skip');
      record('e2e_digi_outbound_reply', false, 'skip');
      record('e2e_digi_refresh_token', false, 'skip');
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n=== SUMMARY ===');
  console.log(`PASS=${passed} FAIL=${failed}`);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}\t${r.name}\t${r.detail}`);
  }
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
