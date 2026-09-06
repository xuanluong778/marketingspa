/**
 * Cross-org Zalo OA ownership: A disconnect → B connect → webhook routes to B.
 * Run: node scripts/with-root-env.cjs node scripts/test-zalo-oa-cross-org-reconnect.cjs
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');
const {
  MessageChannel,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
} = require('../packages/database/dist');

const TAG = `ZOA_XORG_${Date.now()}`;
const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const verdict = {
  A_DISCONNECT: 'FAIL',
  CACHE_INVALIDATED: 'FAIL',
  B_CONNECT: 'FAIL',
  NO_TWO_ACTIVE: 'FAIL',
  WEBHOOK_ROUTE_B: 'FAIL',
};

function encryptSecret(plain, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
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

/** Mirrors webhook routing query — ACTIVE only, not paused. */
async function resolveActiveRoute(accountRef) {
  return prisma.messagingChannelConnection.findFirst({
    where: {
      channel: MessageChannel.ZALO,
      accountRef,
      status: MessagingChannelAccountStatus.ACTIVE,
      isPaused: false,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

async function main() {
  console.log(`=== ${TAG} Zalo OA cross-org reconnect ===`);

  const orgA = await prisma.organization.create({
    data: { name: `${TAG} A`, slug: `${TAG.toLowerCase()}-a` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` },
  });
  const userA = await createTestUser(orgA.id, 'a');
  await createTestUser(orgB.id, 'b');
  await ensureActiveSubscription(orgA.id);
  await ensureActiveSubscription(orgB.id);

  const oaId = `${TAG}-oa-shared`;
  const creds = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    oaId,
    oaName: 'Shared OA',
    webhookSecret: 'whsec-test',
  };
  const encrypted = encryptSecret(JSON.stringify(creds), ENCRYPTION_KEY);

  const connA = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: oaId,
      displayName: creds.oaName,
      encryptedCredentials: encrypted,
      status: MessagingChannelAccountStatus.ACTIVE,
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const routeBefore = await resolveActiveRoute(oaId);
  if (!routeBefore || routeBefore.organizationId !== orgA.id) {
    throw new Error('Setup failed: org A should own ACTIVE route');
  }

  const tokenA = mint(orgA.id, userA.user.id, userA.user.email, userA.role.code);
  const disconnect = await api(`/zalo-marketing/oa/${connA.id}/disconnect`, tokenA, {
    method: 'POST',
    body: '{}',
  });
  if (disconnect.status < 300 && disconnect.json?.connection?.status === 'DISCONNECTED') {
    verdict.A_DISCONNECT = 'PASS';
    console.log('PASS A_DISCONNECT');
  } else {
    console.log('FAIL A_DISCONNECT', disconnect.status, disconnect.json);
  }

  const afterA = await prisma.messagingChannelConnection.findUnique({ where: { id: connA.id } });
  const activeAfterDisconnect = await resolveActiveRoute(oaId);
  if (
    afterA?.status === MessagingChannelAccountStatus.DISCONNECTED &&
    activeAfterDisconnect === null
  ) {
    verdict.CACHE_INVALIDATED = 'PASS';
    console.log('PASS CACHE_INVALIDATED');
  } else {
    console.log('FAIL CACHE_INVALIDATED', afterA?.status, activeAfterDisconnect?.id);
  }

  const credsB = encryptSecret(
    JSON.stringify({
      accessToken: 'org-b-access',
      refreshToken: 'org-b-refresh',
      oaId,
      oaName: creds.oaName,
    }),
    ENCRYPTION_KEY,
  );

  let connB;
  try {
    connB = await prisma.messagingChannelConnection.create({
      data: {
        organizationId: orgB.id,
        channel: MessageChannel.ZALO,
        providerKind: MessagingProviderKind.ZALO_OA,
        accountRef: oaId,
        displayName: creds.oaName,
        encryptedCredentials: credsB,
        status: MessagingChannelAccountStatus.ACTIVE,
        tokenExpiresAt: new Date(Date.now() + 7200_000),
      },
    });
    verdict.B_CONNECT = 'PASS';
    console.log('PASS B_CONNECT');
  } catch (err) {
    console.log('FAIL B_CONNECT', err.message);
  }

  const activeRows = await prisma.messagingChannelConnection.findMany({
    where: {
      channel: MessageChannel.ZALO,
      accountRef: oaId,
      status: MessagingChannelAccountStatus.ACTIVE,
    },
  });
  if (activeRows.length === 1 && activeRows[0].organizationId === orgB.id) {
    verdict.NO_TWO_ACTIVE = 'PASS';
    console.log('PASS NO_TWO_ACTIVE');
  } else {
    console.log('FAIL NO_TWO_ACTIVE', activeRows.map((r) => r.organizationId));
  }

  const routeB = await resolveActiveRoute(oaId);
  if (routeB && connB && routeB.id === connB.id && routeB.organizationId === orgB.id) {
    verdict.WEBHOOK_ROUTE_B = 'PASS';
    console.log('PASS WEBHOOK_ROUTE_B');
  } else {
    console.log('FAIL WEBHOOK_ROUTE_B', routeB?.organizationId, connB?.id);
  }

  const historyA = await prisma.messagingChannelConnection.findUnique({ where: { id: connA.id } });
  if (historyA?.organizationId !== orgA.id || historyA?.status !== 'DISCONNECTED') {
    console.log('WARN org A history row missing or wrong', historyA?.status);
  }

  if (connB) await prisma.messagingChannelConnection.delete({ where: { id: connB.id } });
  await prisma.messagingChannelConnection.delete({ where: { id: connA.id } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.role.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.organization.delete({ where: { id: orgA.id } });
  await prisma.organization.delete({ where: { id: orgB.id } });

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);
  if (!Object.values(verdict).every((v) => v === 'PASS')) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
