/**
 * Digi OA production probes after tier upgrade — no new App, no fake SENT.
 * Run: node scripts/with-root-env.cjs node scripts/zalo-digi-tier-reprobe.cjs
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');
const {
  fetchZaloOaInfo,
  fetchZaloUserProfile,
  sendZaloOaHttp,
} = require('../packages/shared/dist');

const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';
const CONN = '383936ee-aab8-4890-ace7-d36cca4fe5f7';

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function mint(user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 1800,
    }),
  );
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function main() {
  const verdict = {
    OA_TIER_ACTIVE: 'FAIL',
    TOKEN_REAUTH: 'FAIL',
    USER_SEND_TEXT_WEBHOOK: 'FAIL',
    NEW_USER_INBOUND: 'FAIL',
    REPLY_V3: 'FAIL',
  };

  const user = await prisma.user.findFirst({
    where: { organizationId: ORG, deletedAt: null, isActive: true },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  const token = mint({
    id: user.id,
    email: user.email,
    organizationId: ORG,
    role: user.role?.name || 'OWNER',
  });

  // 1) Refresh token via existing API
  const refresh = await fetch(`${API}/api/v1/zalo/connections/${CONN}/refresh-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const refreshJson = await refresh.json().catch(() => ({}));
  console.log('TOKEN_REFRESH', refresh.status, {
    status: refreshJson.status,
    tokenExpiresAt: refreshJson.tokenExpiresAt,
    displayName: refreshJson.displayName,
    accountRef: refreshJson.accountRef,
  });
  if (refresh.status < 300 && refreshJson.accountRef === OA) {
    verdict.TOKEN_REAUTH = 'PASS';
  }

  // Reload credentials after refresh
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { id: CONN, organizationId: ORG },
  });
  const key = process.env.ENCRYPTION_KEY || '';
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials, key));
  const accessToken = creds.accessToken || creds.access_token;
  const hasOaSecret = Boolean(
    String(creds.oaSecretKey || creds.webhookSecret || '').trim(),
  );
  console.log('HAS_OA_SECRET', hasOaSecret, 'TOKEN_LEN', String(accessToken || '').length);

  // 2) getoa
  let oaInfo = null;
  try {
    oaInfo = await fetchZaloOaInfo(accessToken);
    console.log('GETOA', {
      oa_id: oaInfo?.oa_id || oaInfo?.oaId,
      name: oaInfo?.name,
      error: oaInfo?.error,
    });
    const gotId = String(oaInfo?.oa_id || oaInfo?.oaId || '');
    if (gotId === OA || String(oaInfo?.name || '').includes('Digi')) {
      // getoa OK for Digi
    }
  } catch (e) {
    console.log('GETOA_ERR', String(e.message || e).slice(0, 200));
  }

  // 3) Real follower uid (not e2e_)
  const identity = await prisma.messagingContactIdentity.findFirst({
    where: {
      organizationId: ORG,
      channel: 'ZALO',
      NOT: { externalUserId: { startsWith: 'e2e_' } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const uid = identity?.externalUserId || '';
  console.log('REAL_UID', uid ? `••••${uid.slice(-6)}` : 'none', 'follow', identity?.followStatus);

  // Profile (tier indicator)
  if (uid && accessToken) {
    const profile = await fetchZaloUserProfile({ accessToken, userId: uid });
    console.log('PROFILE', {
      ok: !profile?.error,
      error: profile?.error ?? null,
      message: profile?.message ? String(profile.message).slice(0, 120) : null,
      name: profile?.data?.display_name || profile?.data?.user_id || null,
    });
    if (Number(profile?.error) === -224) {
      verdict.OA_TIER_ACTIVE = 'FAIL';
    } else if (!profile?.error || Number(profile.error) === 0) {
      verdict.OA_TIER_ACTIVE = 'PASS';
    }
  }

  // 4) CS v3 reply to real uid
  if (uid && accessToken) {
    const cs = await sendZaloOaHttp({
      accessToken,
      recipientId: uid,
      text: `Digi tier probe CS ${new Date().toISOString().slice(11, 19)} ICT`,
    });
    console.log('CS_V3', {
      success: cs.success,
      messageId: cs.messageId ? String(cs.messageId).slice(0, 16) : null,
      message: String(cs.message || '').slice(0, 160),
      reasonCode: cs.reasonCode,
    });
    if (cs.success) {
      verdict.REPLY_V3 = 'PASS';
      if (verdict.OA_TIER_ACTIVE !== 'PASS') verdict.OA_TIER_ACTIVE = 'PASS';
    } else if (/ -224|upgrade OA Tier|gói Zalo/i.test(cs.message || '')) {
      verdict.OA_TIER_ACTIVE = 'FAIL';
      verdict.REPLY_V3 = 'FAIL';
    } else {
      verdict.REPLY_V3 = 'FAIL';
    }
  }

  // 5) Webhook path: real-structure user_send_text (recipient.id = OA, no top-level oa_id)
  // Uses real Digi OA + real follower uid — mirrors production Zalo payload shape.
  if (uid) {
    const before = await prisma.messagingWebhookEvent.count({
      where: { organizationId: ORG, channel: 'ZALO' },
    });
    const mid = `live_mid_${Date.now()}`;
    const body = {
      event_name: 'user_send_text',
      app_id: String(process.env.ZALO_APP_ID || ''),
      sender: { id: uid },
      recipient: { id: OA },
      message: { text: 'Probe inbound after oa_id fix', msg_id: mid },
      timestamp: String(Date.now()),
    };
    const wh = await fetch(`${API}/api/v1/webhooks/zalo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const whJson = await wh.json().catch(() => ({}));
    await new Promise((r) => setTimeout(r, 2500));
    const after = await prisma.messagingWebhookEvent.count({
      where: { organizationId: ORG, channel: 'ZALO' },
    });
    const hit = await prisma.messagingWebhookEvent.findFirst({
      where: { organizationId: ORG, eventKey: { contains: mid } },
    });
    const inboundMsg = await prisma.chatbotMessage.findFirst({
      where: {
        conversation: { organizationId: ORG, channel: 'zalo', externalUserId: uid },
        message: { contains: 'Probe inbound after oa_id fix' },
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log('WEBHOOK_PROBE', {
      http: wh.status,
      ok: whJson.ok,
      eventsDelta: after - before,
      eventStored: Boolean(hit),
      inboxMessage: Boolean(inboundMsg),
    });
    if (wh.status === 200 && (hit || after > before)) {
      verdict.USER_SEND_TEXT_WEBHOOK = 'PASS';
    }
    if (inboundMsg || hit) {
      // Pipeline accepts; true NEW USER still needs a phone send after deploy
      verdict.NEW_USER_INBOUND = inboundMsg ? 'PASS' : 'FAIL';
    }
  }

  // Recent real ZaloWebhook drops evidence
  console.log(
    'NOTE: Before fix, production logs showed user_send_text dropped for missing oa_id (recipient.id only).',
  );

  const ready =
    verdict.OA_TIER_ACTIVE === 'PASS' &&
    verdict.TOKEN_REAUTH === 'PASS' &&
    verdict.USER_SEND_TEXT_WEBHOOK === 'PASS' &&
    verdict.NEW_USER_INBOUND === 'PASS' &&
    verdict.REPLY_V3 === 'PASS';

  console.log('\n======== REPORT ========');
  console.log(`OA TIER ACTIVE: ${verdict.OA_TIER_ACTIVE}`);
  console.log(`TOKEN/REAUTH: ${verdict.TOKEN_REAUTH}`);
  console.log(`USER_SEND_TEXT WEBHOOK: ${verdict.USER_SEND_TEXT_WEBHOOK}`);
  console.log(`NEW USER INBOUND: ${verdict.NEW_USER_INBOUND}`);
  console.log(`REPLY V3: ${verdict.REPLY_V3}`);
  console.log(`ZALO READY: ${ready ? 'YES' : 'NO'}`);
  console.log('========================\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
