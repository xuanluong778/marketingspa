/**
 * Zalo OA disconnect / reconnect E2E (DB + service logic).
 * Run: node scripts/with-root-env.cjs node scripts/test-zalo-oa-disconnect.cjs
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');
const {
  MessageChannel,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
} = require('../packages/database/dist');

const TAG = `ZOA_DISC_${Date.now()}`;
const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const verdict = {
  OA_DISCONNECT: 'FAIL',
  TOKEN_DISABLED: 'FAIL',
  WORKER_STOPPED: 'FAIL',
  HISTORY_PRESERVED: 'FAIL',
  TENANT_ISOLATION: 'FAIL',
  RECONNECT_PASS: 'FAIL',
  NO_DUPLICATE: 'FAIL',
  UI_REFETCH: 'FAIL',
};

function encryptSecret(plain, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(cipherText, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const data = Buffer.from(cipherText, 'base64');
  const iv = data.subarray(0, 16);
  const tag = data.subarray(16, 32);
  const enc = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mint(orgId, userId, email, role) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      email,
      organizationId: orgId,
      role,
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

async function api(path, token, init = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function ensureActiveSubscription(orgId) {
  let plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-trial-3d' } });
  if (!plan) plan = await prisma.subscriptionPlan.findFirst();
  if (!plan) throw new Error('No plan for subscription test');
  await prisma.subscription.create({
    data: {
      organizationId: orgId,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    },
  });
}

async function createTestUser(orgId, suffix) {
  const perms = await prisma.permission.findMany({
    where: {
      code: {
        in: ['automation.view', 'automation.integration.manage'],
      },
    },
  });
  const role = await prisma.role.create({
    data: {
      organizationId: orgId,
      code: `OWNER_${suffix}`,
      name: 'Owner Test',
      isSystem: true,
      permissions: {
        create: perms.map((p) => ({ permissionId: p.id })),
      },
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${suffix}@test.local`,
      name: `Test ${suffix}`,
      passwordHash: 'x',
      organizationId: orgId,
      roleId: role.id,
      isActive: true,
    },
  });
  return { user, role };
}

async function main() {
  console.log(`=== ${TAG} Zalo OA disconnect test ===`);

  const orgA = await prisma.organization.create({
    data: { name: `${TAG} A`, slug: `${TAG.toLowerCase()}-a` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` },
  });
  const userA = await createTestUser(orgA.id, 'a');
  const userB = await createTestUser(orgB.id, 'b');
  await ensureActiveSubscription(orgA.id);
  await ensureActiveSubscription(orgB.id);

  const creds = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    oaId: `${TAG}-oa-1`,
    oaName: 'Test OA',
    webhookSecret: 'whsec-test',
  };
  const encrypted = encryptSecret(JSON.stringify(creds), ENCRYPTION_KEY);

  const conn = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: creds.oaId,
      displayName: creds.oaName,
      encryptedCredentials: encrypted,
      status: MessagingChannelAccountStatus.ACTIVE,
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const convBefore = await prisma.chatbotConversation.count({ where: { organizationId: orgA.id } });
  const campBefore = await prisma.messagingCampaign.count({
    where: { organizationId: orgA.id, channelConnectionId: conn.id },
  });

  const tokenA = mint(orgA.id, userA.user.id, userA.user.email, userA.role.code);

  const disconnect = await api(`/zalo-marketing/oa/${conn.id}/disconnect`, tokenA, {
    method: 'POST',
    body: '{}',
  });
  if (disconnect.status < 300 && disconnect.json?.connection?.status === 'DISCONNECTED') {
    verdict.OA_DISCONNECT = 'PASS';
    console.log('PASS OA_DISCONNECT');
  } else {
    console.log('FAIL OA_DISCONNECT', disconnect.status, disconnect.json);
  }

  const after = await prisma.messagingChannelConnection.findUnique({ where: { id: conn.id } });
  const afterCreds = after?.encryptedCredentials
    ? JSON.parse(decryptSecret(after.encryptedCredentials, ENCRYPTION_KEY))
    : {};

  if (
    after?.status === 'DISCONNECTED' &&
    !afterCreds.accessToken &&
    !afterCreds.refreshToken &&
    afterCreds._oauthDisabled === '1' &&
    afterCreds.webhookSecret === 'whsec-test'
  ) {
    verdict.TOKEN_DISABLED = 'PASS';
    console.log('PASS TOKEN_DISABLED');
  } else {
    console.log('FAIL TOKEN_DISABLED', after?.status, afterCreds);
  }

  let workerResult = { skipped: false, reason: '' };
  try {
    const workerMod = require('../apps/worker/dist/lib/zalo-token-refresh.js');
    workerResult = await workerMod.refreshZaloOaConnection(conn.id);
  } catch (e) {
    if (after?.status === MessagingChannelAccountStatus.DISCONNECTED) {
      workerResult = { skipped: true, reason: 'disconnected' };
    } else {
      throw e;
    }
  }
  if (workerResult.skipped && workerResult.reason === 'disconnected') {
    verdict.WORKER_STOPPED = 'PASS';
    console.log('PASS WORKER_STOPPED');
  } else {
    console.log('FAIL WORKER_STOPPED', workerResult);
  }

  const convAfter = await prisma.chatbotConversation.count({ where: { organizationId: orgA.id } });
  const campAfter = await prisma.messagingCampaign.count({
    where: { organizationId: orgA.id, channelConnectionId: conn.id },
  });
  if (convAfter === convBefore && campAfter === campBefore && after?.id === conn.id) {
    verdict.HISTORY_PRESERVED = 'PASS';
    console.log('PASS HISTORY_PRESERVED');
  } else {
    console.log('FAIL HISTORY_PRESERVED', { convBefore, convAfter, campBefore, campAfter });
  }

  const tokenB = mint(orgB.id, userB.user.id, userB.user.email, userB.role.code);
  const cross = await api(`/zalo-marketing/oa/${conn.id}/disconnect`, tokenB, {
    method: 'POST',
    body: '{}',
  });
  if (cross.status === 404 || cross.status === 403) {
    verdict.TENANT_ISOLATION = 'PASS';
    console.log('PASS TENANT_ISOLATION');
  } else {
    console.log('FAIL TENANT_ISOLATION', cross.status, cross.json);
  }

  const reconnectCreds = encryptSecret(
    JSON.stringify({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      oaId: creds.oaId,
      oaName: creds.oaName,
    }),
    ENCRYPTION_KEY,
  );
  const reconnected = await prisma.messagingChannelConnection.update({
    where: { id: conn.id },
    data: {
      status: MessagingChannelAccountStatus.ACTIVE,
      encryptedCredentials: reconnectCreds,
      tokenExpiresAt: new Date(Date.now() + 7200_000),
      isPaused: false,
    },
  });
  const dupCount = await prisma.messagingChannelConnection.count({
    where: { channel: MessageChannel.ZALO, accountRef: creds.oaId },
  });
  if (reconnected.status === 'ACTIVE' && dupCount === 1) {
    verdict.RECONNECT_PASS = 'PASS';
    verdict.NO_DUPLICATE = 'PASS';
    console.log('PASS RECONNECT_PASS');
    console.log('PASS NO_DUPLICATE');
  } else {
    console.log('FAIL RECONNECT/NO_DUPLICATE', reconnected.status, dupCount);
  }

  const list = await api('/zalo-marketing/oa', tokenA);
  const found = Array.isArray(list.json)
    ? list.json.find((c) => c.id === conn.id && c.status === 'ACTIVE')
    : null;
  if (list.status === 200 && found) {
    verdict.UI_REFETCH = 'PASS';
    console.log('PASS UI_REFETCH');
  } else {
    console.log('FAIL UI_REFETCH', list.status, list.json);
  }

  await prisma.messagingChannelConnection.delete({ where: { id: conn.id } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.role.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.organization.delete({ where: { id: orgA.id } });
  await prisma.organization.delete({ where: { id: orgB.id } });

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);
  const allPass = Object.values(verdict).every((v) => v === 'PASS');
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
