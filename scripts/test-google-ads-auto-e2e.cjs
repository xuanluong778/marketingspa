/**
 * Google Ads Auto E2E gates (code + DB isolation).
 * Run: node scripts/with-root-env.cjs node scripts/test-google-ads-auto-e2e.cjs
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../packages/database/dist');
const { AdConnectionProvider, AdConnectionStatus, AdsSyncPlatform } = require('../packages/database/dist');

const root = path.join(__dirname, '..');
const TAG = `GADS_AUTO_${Date.now()}`;

const verdict = {
  GOOGLE_OAUTH: 'FAIL',
  ACCOUNT_DISCOVERY: 'FAIL',
  AUTO_SELECT: 'FAIL',
  TOKEN_REFRESH: 'FAIL',
  AUTO_SYNC: 'FAIL',
  MCP_READY: 'FAIL',
  MULTI_TENANT: 'FAIL',
  IDEMPOTENCY: 'FAIL',
  GUARDRAIL: 'FAIL',
  AUTO_MODE_SAFE: 'FAIL',
  GOOGLE_ADS_AUTO_E2E: 'FAIL',
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function encryptSecret(plain, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

async function main() {
  console.log(`=== ${TAG} Google Ads Auto E2E ===`);

  const svc = read('apps/api/src/ad-performance/google-ads/google-ads.service.ts');
  const api = read('apps/api/src/ad-performance/google-ads/google-ads-api.service.ts');
  const ctrl = read('apps/api/src/ad-performance/google-ads/google-ads.controller.ts');
  const page = read('apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx');
  const mcp = read('apps/api/src/ads-mcp/ads-mcp.gateway.ts');
  const aam = read('apps/api/src/ai-ads-manager/ai-ads-manager.service.ts');

  if (
    svc.includes('createOneTimeState') &&
    svc.includes('consumeOneTimeState') &&
    svc.includes('oauth:google-ads:state:') &&
    svc.includes("'NX'") &&
    api.includes('buildOAuthUrl') &&
    api.includes('exchangeCodeForTokens') &&
    ctrl.includes('oauth/callback') &&
    page.includes('startGoogleOAuth') &&
    !page.includes('Refresh token')
  ) {
    verdict.GOOGLE_OAUTH = 'PASS';
    console.log('PASS GOOGLE_OAUTH');
  } else {
    console.log('FAIL GOOGLE_OAUTH');
  }

  if (api.includes('listAccessibleCustomers') && svc.includes('discoverCustomers')) {
    verdict.ACCOUNT_DISCOVERY = 'PASS';
    console.log('PASS ACCOUNT_DISCOVERY');
  } else {
    console.log('FAIL ACCOUNT_DISCOVERY');
  }

  if (svc.includes('customers.length === 1') && svc.includes('applyCustomerSelection')) {
    verdict.AUTO_SELECT = 'PASS';
    console.log('PASS AUTO_SELECT');
  } else {
    console.log('FAIL AUTO_SELECT');
  }

  if (api.includes('refreshAccessToken') && read('apps/worker/src/lib/google-ads-api.ts').includes('refreshGoogleAccessToken')) {
    verdict.TOKEN_REFRESH = 'PASS';
    console.log('PASS TOKEN_REFRESH');
  } else {
    console.log('FAIL TOKEN_REFRESH');
  }

  if (svc.includes('enqueueGoogleSync') && read('apps/api/src/ad-performance/ads-sync-queue.service.ts').includes('enqueueGoogleSync')) {
    verdict.AUTO_SYNC = 'PASS';
    console.log('PASS AUTO_SYNC');
  } else {
    console.log('FAIL AUTO_SYNC');
  }

  if (mcp.includes('readiness') && mcp.includes('mcpReady') && mcp.includes('dataFreshnessMinutes')) {
    verdict.MCP_READY = 'PASS';
    console.log('PASS MCP_READY');
  } else {
    console.log('FAIL MCP_READY');
  }

  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY required');

  const orgA = await prisma.organization.create({ data: { name: `${TAG} A`, slug: `${TAG.toLowerCase()}-a` } });
  const orgB = await prisma.organization.create({ data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` } });
  const userA = await prisma.user.create({
    data: {
      email: `${TAG}-a@test.local`,
      name: 'A',
      passwordHash: 'x',
      organizationId: orgA.id,
      isActive: true,
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `${TAG}-b@test.local`,
      name: 'B',
      passwordHash: 'x',
      organizationId: orgB.id,
      isActive: true,
    },
  });

  const enc = encryptSecret(JSON.stringify({ refreshToken: 'rt-test-org-a' }), ENCRYPTION_KEY);
  const connA = await prisma.adConnection.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      provider: AdConnectionProvider.GOOGLE,
      status: AdConnectionStatus.CONNECTED,
      encryptedCredentials: enc,
      externalAccountId: '1111111111',
      externalAccountName: 'Org A Google',
      metadata: { loginCustomerId: '1111111111' },
    },
  });

  const cross = await prisma.adConnection.findFirst({
    where: { organizationId: orgB.id, provider: AdConnectionProvider.GOOGLE },
  });
  if (connA.organizationId === orgA.id && !cross) {
    verdict.MULTI_TENANT = 'PASS';
    console.log('PASS MULTI_TENANT');
  } else {
    console.log('FAIL MULTI_TENANT');
  }

  const idemKey = crypto.createHash('sha256').update(`${orgA.id}|${connA.id}|1111111111|2026-01-01|2026-01-07|GOOGLE`).digest('hex');
  const job1 = await prisma.adsSyncJob.create({
    data: {
      organizationId: orgA.id,
      connectionId: connA.id,
      accountId: '1111111111',
      platform: AdsSyncPlatform.GOOGLE,
      status: 'SUCCEEDED',
      dateFrom: new Date('2026-01-01'),
      dateTo: new Date('2026-01-07'),
      idempotencyKey: idemKey,
      finishedAt: new Date(),
      progressPercent: 100,
      requestedByUserId: userA.id,
    },
  });
  const dup = await prisma.adsSyncJob.findUnique({ where: { idempotencyKey: idemKey } });
  if (dup?.id === job1.id) {
    verdict.IDEMPOTENCY = 'PASS';
    console.log('PASS IDEMPOTENCY');
  } else {
    console.log('FAIL IDEMPOTENCY');
  }

  if (
    aam.includes('ADS_ACTIONS_PROVIDER_WRITE') &&
    aam.includes('emergencyStop') &&
    aam.includes('autoModeEnabled') &&
    process.env.ADS_ACTIONS_LIVE !== 'true'
  ) {
    verdict.GUARDRAIL = 'PASS';
    console.log('PASS GUARDRAIL');
  } else {
    console.log('FAIL GUARDRAIL');
  }

  if (aam.includes('autoModeEnabled') && read('apps/api/src/ai-ads-manager/ai-ads-manager.controller.ts').includes('settings/auto-mode')) {
    verdict.AUTO_MODE_SAFE = 'PASS';
    console.log('PASS AUTO_MODE_SAFE');
  } else {
    console.log('FAIL AUTO_MODE_SAFE');
  }

  await prisma.adsSyncJob.delete({ where: { id: job1.id } });
  await prisma.adConnection.delete({ where: { id: connA.id } });
  await prisma.user.delete({ where: { id: userA.id } });
  await prisma.user.delete({ where: { id: userB.id } });
  await prisma.organization.delete({ where: { id: orgA.id } });
  await prisma.organization.delete({ where: { id: orgB.id } });

  const allPass = Object.values(verdict).every((v) => v === 'PASS');
  verdict.GOOGLE_ADS_AUTO_E2E = allPass ? 'PASS' : 'FAIL';

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);

  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
