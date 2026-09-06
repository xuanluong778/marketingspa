/**
 * Google Ads SaaS multi-tenant — 2 orgs, OAuth isolation, per-account loginCustomerId.
 * Run: pnpm test:google-ads-saas
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { prisma, AdConnectionProvider, AdConnectionStatus } = require('../packages/database/dist');
const {
  googleAdsLoginHeaders,
  mergeGoogleAdsHierarchy,
  isGoogleAdsInvalidGrant,
  isGoogleAdsTwoFactorMessage,
} = require('../packages/shared/dist');

const root = path.join(__dirname, '..');
const API = (process.env.API_URL || process.env.APP_URL || 'https://marketingautoaz.com').replace(
  /\/$/,
  '',
);
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const TAG = `GADS_SAAS_${Date.now()}`;
const ENV_MCC = String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '1276009537').replace(/\D/g, '');

const verdict = {
  MULTI_USER_OAUTH: 'FAIL',
  ACCOUNT_DISCOVERY: 'FAIL',
  DYNAMIC_LOGIN_CUSTOMER: 'FAIL',
  MULTI_ACCOUNT: 'FAIL',
  TOKEN_SECURITY: 'FAIL',
  MULTI_TENANT: 'FAIL',
  GOOGLE_ADS_SAAS_CONNECTION: 'FAIL',
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
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

async function api(pathname, token, init = {}) {
  const res = await fetch(`${API}/api/v1${pathname}`, {
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
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, text };
}

function encryptSecret(plain, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(ciphertext, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, 16);
  const tag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

async function ensureActiveSubscription(orgId) {
  let plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-trial-3d' } });
  if (!plan) plan = await prisma.subscriptionPlan.findFirst();
  if (!plan) throw new Error('No subscription plan');
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

async function ensureOwner(orgId, suffix) {
  const role = await prisma.role.create({
    data: {
      organizationId: orgId,
      code: 'OWNER',
      name: 'Owner',
      isSystem: true,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${suffix}@test.local`,
      name: `Google Ads SaaS ${suffix}`,
      passwordHash: 'x',
      organizationId: orgId,
      roleId: role.id,
      isActive: true,
    },
  });
  return { user, role };
}

function sourceGates() {
  const svc = read('apps/api/src/ad-performance/google-ads/google-ads.service.ts');
  const apiSvc = read('apps/api/src/ad-performance/google-ads/google-ads-api.service.ts');
  const worker = read('apps/worker/src/processors/ads-sync.ts');
  const workerApi = read('apps/worker/src/lib/google-ads-api.ts');
  const queue = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');
  const schema = read('packages/database/prisma/schema.prisma');
  const envEx = read('.env.example');

  const noDefaultMccFn = !svc.includes('defaultLoginCustomerId');
  const svcDoesNotReadEnvMcc = !/config\.get<string>\(['"]GOOGLE_ADS_LOGIN_CUSTOMER_ID['"]\)/.test(
    svc,
  );
  const workerNoEnvMcc = !worker.includes('GOOGLE_ADS_LOGIN_CUSTOMER_ID');
  const workerApiNoEnvMcc = !workerApi.includes('GOOGLE_ADS_LOGIN_CUSTOMER_ID');
  const csrf =
    svc.includes("oauth:google-ads:state:") &&
    svc.includes('STATE_TTL_SEC') &&
    svc.includes('600') &&
    svc.includes('getdel') &&
    svc.includes('signStateId');
  const encrypt = svc.includes('upsertEncryptedCredentials');
  const discover =
    apiSvc.includes('listAccessibleCustomers') &&
    apiSvc.includes('listCustomerClients') &&
    svc.includes('mergeGoogleAdsHierarchy') &&
    svc.includes('discoverCustomers');
  const multi =
    schema.includes('model AdGoogleAdsAccount') &&
    queue.includes('adGoogleAdsAccount') &&
    svc.includes('selectAccounts');
  const errors =
    apiSvc.includes('GoogleAdsTwoFactorError') &&
    apiSvc.includes('isGoogleAdsInvalidGrant') &&
    worker.includes('GoogleAdsTwoFactorError') &&
    worker.includes('TOKEN_EXPIRED');
  const sharedDevToken = envEx.includes('GOOGLE_ADS_DEVELOPER_TOKEN');
  const deprecatedMcc = envEx.includes('Deprecated') && envEx.includes('GOOGLE_ADS_LOGIN_CUSTOMER_ID');
  const noSecretLog =
    !svc.includes('tokens.refreshToken') || !/logger\.(log|warn|debug).*refreshToken/.test(svc);

  return {
    noDefaultMccFn,
    svcDoesNotReadEnvMcc,
    workerNoEnvMcc,
    workerApiNoEnvMcc,
    csrf,
    encrypt,
    discover,
    multi,
    errors,
    sharedDevToken,
    deprecatedMcc,
    noSecretLog,
  };
}

async function main() {
  console.log(`=== ${TAG} Google Ads SaaS multi-tenant ===`);
  console.log(`API=${API}`);
  if (!JWT_SECRET || !ENCRYPTION_KEY) throw new Error('JWT_SECRET / ENCRYPTION_KEY missing');

  const src = sourceGates();
  console.log('SOURCE', JSON.stringify(src));

  const orgA = await prisma.organization.create({
    data: { name: `${TAG} A`, slug: `${TAG.toLowerCase()}-a` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` },
  });
  await ensureActiveSubscription(orgA.id);
  await ensureActiveSubscription(orgB.id);
  const { user: userA, role: roleA } = await ensureOwner(orgA.id, 'a');
  const { user: userB, role: roleB } = await ensureOwner(orgB.id, 'b');
  const tokenA = mint(orgA.id, userA.id, userA.email, roleA.code);
  const tokenB = mint(orgB.id, userB.id, userB.email, roleB.code);

  const created = {
    orgs: [orgA.id, orgB.id],
    conns: [],
    jobs: [],
  };

  try {
    // --- MULTI_USER_OAUTH ---
    const startA = await api('/ad-performance/google/oauth/start', tokenA);
    const startB = await api('/ai-ads-manager/google/oauth/start', tokenB);
    const urlA = startA.json?.url || '';
    const urlB = startB.json?.url || '';
    const stateA = new URL(urlA).searchParams.get('state') || '';
    const stateB = new URL(urlB).searchParams.get('state') || '';
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const redirect = (process.env.GOOGLE_ADS_REDIRECT_URI || '').replace(/\/+$/, '');
    const oauthOk =
      startA.status === 200 &&
      startB.status === 200 &&
      urlA.includes('accounts.google.com') &&
      urlB.includes('accounts.google.com') &&
      urlA.includes('access_type=offline') &&
      urlA.includes('prompt=consent') &&
      clientId &&
      urlA.includes(clientId) &&
      urlB.includes(clientId) &&
      redirect &&
      urlA.includes(encodeURIComponent(redirect)) &&
      stateA.includes('.') &&
      stateB.includes('.') &&
      stateA !== stateB &&
      src.csrf;

    const reuse = await fetch(
      `${API}/api/v1/ad-performance/google/oauth/callback?code=x&state=not-a-real-state`,
      { redirect: 'manual' },
    );
    const reuseLoc = reuse.headers.get('location') || '';
    const csrfReject = reuse.status >= 300 && reuse.status < 400 && reuseLoc.includes('invalid_state');

    if (oauthOk && csrfReject) {
      verdict.MULTI_USER_OAUTH = 'PASS';
      console.log('PASS MULTI_USER_OAUTH (2 tenants, distinct CSRF state, TTL+HMAC)');
    } else {
      console.log('FAIL MULTI_USER_OAUTH', {
        startA: startA.status,
        startB: startB.status,
        statesDiffer: stateA !== stateB,
        csrfReject,
        oauthOk,
      });
    }

    // --- ACCOUNT_DISCOVERY (unit + source; live if a real connection exists) ---
    const hierarchy = mergeGoogleAdsHierarchy({
      accessibleIds: ['1111111111', '2222222222'],
      direct: [
        {
          customerId: '1111111111',
          name: 'Direct Advertiser',
          currency: 'VND',
          timezone: 'Asia/Ho_Chi_Minh',
          isManager: false,
        },
        {
          customerId: '2222222222',
          name: 'Tenant MCC',
          currency: 'USD',
          timezone: 'UTC',
          isManager: true,
        },
      ],
      childrenByManager: {
        2222222222: [
          {
            customerId: '3333333333',
            name: 'MCC Child',
            currency: 'USD',
            timezone: 'UTC',
            isManager: false,
          },
        ],
        [ENV_MCC]: [
          {
            customerId: '1111111111',
            name: 'Should not override direct',
            isManager: false,
          },
        ],
      },
    });
    const direct = hierarchy.find((x) => x.customerId === '1111111111');
    const child = hierarchy.find((x) => x.customerId === '3333333333');
    const discoveryUnit =
      direct?.accessType === 'direct' &&
      direct.loginCustomerId === null &&
      child?.accessType === 'mcc' &&
      child.loginCustomerId === '2222222222' &&
      src.discover;

    let liveDiscovery = false;
    const liveConn = await prisma.adConnection.findFirst({
      where: {
        provider: AdConnectionProvider.GOOGLE,
        status: AdConnectionStatus.CONNECTED,
        encryptedCredentials: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (liveConn) {
      const liveUser = await prisma.user.findFirst({
        where: { organizationId: liveConn.organizationId, isActive: true, deletedAt: null },
        include: { role: true },
      });
      if (liveUser?.role) {
        const liveToken = mint(
          liveConn.organizationId,
          liveUser.id,
          liveUser.email,
          liveUser.role.code,
        );
        const customers = await api('/ad-performance/google/customers', liveToken);
        const items = customers.json?.items ?? [];
        const allForcedEnvMcc =
          items.length > 0 &&
          ENV_MCC &&
          items.every((i) => String(i.loginCustomerId || '').replace(/\D/g, '') === ENV_MCC);
        liveDiscovery =
          customers.status === 200 &&
          Array.isArray(items) &&
          !allForcedEnvMcc;
        console.log(
          `LIVE discovery status=${customers.status} items=${items.length} forcedEnvMcc=${allForcedEnvMcc}`,
        );
      }
    }

    if (discoveryUnit) {
      verdict.ACCOUNT_DISCOVERY = 'PASS';
      console.log(
        `PASS ACCOUNT_DISCOVERY (hierarchy+ListAccessibleCustomers${liveDiscovery ? ', live Google' : ''})`,
      );
    } else {
      console.log('FAIL ACCOUNT_DISCOVERY', { discoveryUnit, liveDiscovery });
    }

    // --- DYNAMIC_LOGIN_CUSTOMER ---
    const hDirect = googleAdsLoginHeaders('5555555555', null);
    const hSame = googleAdsLoginHeaders('5555555555', '5555555555');
    const hMcc = googleAdsLoginHeaders('5555555555', '2222222222');
    const envNotForced = !Object.values(hDirect).includes(ENV_MCC);
    const dynamicOk =
      Object.keys(hDirect).length === 0 &&
      Object.keys(hSame).length === 0 &&
      hMcc['login-customer-id'] === '2222222222' &&
      envNotForced &&
      src.noDefaultMccFn &&
      src.svcDoesNotReadEnvMcc &&
      src.workerNoEnvMcc &&
      src.workerApiNoEnvMcc;

    if (dynamicOk) {
      verdict.DYNAMIC_LOGIN_CUSTOMER = 'PASS';
      console.log('PASS DYNAMIC_LOGIN_CUSTOMER (direct omits MCC; env MCC unused)');
    } else {
      console.log('FAIL DYNAMIC_LOGIN_CUSTOMER', { hDirect, hSame, hMcc, src });
    }

    // --- TOKEN_SECURITY + seed two tenant connections ---
    const rtA = `rt-tenant-a-${crypto.randomBytes(12).toString('hex')}`;
    const rtB = `rt-tenant-b-${crypto.randomBytes(12).toString('hex')}`;
    const encA = encryptSecret(JSON.stringify({ refreshToken: rtA }), ENCRYPTION_KEY);
    const encB = encryptSecret(JSON.stringify({ refreshToken: rtB }), ENCRYPTION_KEY);
    if (encA.includes(rtA) || encB.includes(rtB) || encA === encB) {
      throw new Error('encryption failed to hide refresh tokens');
    }
    const plainA = JSON.parse(decryptSecret(encA, ENCRYPTION_KEY)).refreshToken;
    const plainB = JSON.parse(decryptSecret(encB, ENCRYPTION_KEY)).refreshToken;
    if (plainA !== rtA || plainB !== rtB) throw new Error('decrypt mismatch');

    const connA = await prisma.adConnection.create({
      data: {
        userId: userA.id,
        organizationId: orgA.id,
        provider: AdConnectionProvider.GOOGLE,
        status: AdConnectionStatus.CONNECTED,
        encryptedCredentials: encA,
        externalAccountId: '8811000001',
        externalAccountName: 'Tenant A primary',
        metadata: { loginCustomerId: null, accessType: 'direct' },
      },
    });
    const connB = await prisma.adConnection.create({
      data: {
        userId: userB.id,
        organizationId: orgB.id,
        provider: AdConnectionProvider.GOOGLE,
        status: AdConnectionStatus.CONNECTED,
        encryptedCredentials: encB,
        externalAccountId: '8822000001',
        externalAccountName: 'Tenant B primary',
        metadata: { loginCustomerId: '8822000099', accessType: 'mcc' },
      },
    });
    created.conns.push(connA.id, connB.id);

    await prisma.adGoogleAdsAccount.createMany({
      data: [
        {
          organizationId: orgA.id,
          connectionId: connA.id,
          customerId: '8811000001',
          loginCustomerId: null,
          name: 'A Direct',
          accessType: 'direct',
          isSelected: true,
        },
        {
          organizationId: orgA.id,
          connectionId: connA.id,
          customerId: '8811000002',
          loginCustomerId: '8811000099',
          name: 'A via MCC',
          accessType: 'mcc',
          isSelected: true,
        },
        {
          organizationId: orgB.id,
          connectionId: connB.id,
          customerId: '8822000001',
          loginCustomerId: '8822000099',
          name: 'B Client',
          accessType: 'mcc',
          isSelected: true,
        },
      ],
    });

    const statusA = await api('/ad-performance/google/status', tokenA);
    const statusB = await api('/ad-performance/google/status', tokenB);
    const leakA = JSON.stringify(statusA.json || {}).includes(rtA) || JSON.stringify(statusA.json || {}).includes(encA);
    const leakB = JSON.stringify(statusB.json || {}).includes(rtB) || JSON.stringify(statusB.json || {}).includes(encB);
    const tokenOk =
      src.encrypt &&
      src.csrf &&
      src.noSecretLog &&
      isGoogleAdsInvalidGrant('invalid_grant', 'Token has been expired or revoked') &&
      isGoogleAdsTwoFactorMessage('TWO_STEP_VERIFICATION required') &&
      statusA.status === 200 &&
      statusB.status === 200 &&
      !leakA &&
      !leakB &&
      !JSON.stringify(statusA.json).includes('encryptedCredentials') &&
      encA !== encB &&
      plainA !== plainB;

    if (tokenOk) {
      verdict.TOKEN_SECURITY = 'PASS';
      console.log('PASS TOKEN_SECURITY (AES-GCM, CSRF TTL, no secret in API)');
    } else {
      console.log('FAIL TOKEN_SECURITY', {
        leakA,
        leakB,
        statusA: statusA.status,
        encrypt: src.encrypt,
      });
    }

    // --- MULTI_ACCOUNT ---
    const accountsA = await api('/ad-performance/google/accounts', tokenA);
    const itemsA = accountsA.json?.items ?? [];
    const syncA = await api('/ad-performance/google/sync', tokenA, {
      method: 'POST',
      body: JSON.stringify({ dateFrom: '2026-08-01', dateTo: '2026-08-07' }),
    });
    const jobIds = syncA.json?.jobIds ?? (syncA.json?.jobId ? [syncA.json.jobId] : []);
    created.jobs.push(...jobIds);
    const jobs = jobIds.length
      ? await prisma.adsSyncJob.findMany({ where: { id: { in: jobIds } } })
      : [];
    const logins = new Set(
      jobs.map((j) => {
        const m = (j.metadata || {});
        return m.loginCustomerId == null || m.loginCustomerId === ''
          ? 'direct'
          : String(m.loginCustomerId);
      }),
    );
    const multiOk =
      accountsA.status === 200 &&
      itemsA.filter((i) => i.isSelected).length >= 2 &&
      src.multi &&
      (syncA.status < 300 || syncA.status === 409) &&
      (jobIds.length >= 2 || syncA.status === 409) &&
      (jobs.length < 2 || logins.size >= 2);

    if (multiOk) {
      verdict.MULTI_ACCOUNT = 'PASS';
      console.log('PASS MULTI_ACCOUNT (1 org, 2 Google Ads accounts, per-account login)');
    } else {
      console.log('FAIL MULTI_ACCOUNT', {
        status: accountsA.status,
        selected: itemsA.filter((i) => i.isSelected).length,
        sync: syncA.status,
        jobIds: jobIds.length,
        logins: [...logins],
        body: syncA.json,
      });
    }

    // --- MULTI_TENANT ---
    const accountsB = await api('/ad-performance/google/accounts', tokenB);
    const itemsB = accountsB.json?.items ?? [];
    const aIds = new Set(itemsA.map((i) => i.customerId));
    const bIds = new Set(itemsB.map((i) => i.customerId));
    const overlap = [...aIds].filter((id) => bIds.has(id));
    const cross = await api(
      `/ad-performance/google/sync-jobs/${jobIds[0] || '00000000-0000-0000-0000-000000000000'}`,
      tokenB,
    );
    const isolated =
      overlap.length === 0 &&
      statusA.json?.customerId === '8811000001' &&
      statusB.json?.customerId === '8822000001' &&
      !JSON.stringify(statusB.json).includes('8811000001') &&
      !JSON.stringify(accountsB.json).includes('8811000001') &&
      cross.status !== 200;

    if (isolated) {
      verdict.MULTI_TENANT = 'PASS';
      console.log('PASS MULTI_TENANT (org A/B isolated)');
    } else {
      console.log('FAIL MULTI_TENANT', {
        overlap,
        statusA: statusA.json?.customerId,
        statusB: statusB.json?.customerId,
        cross: cross.status,
      });
    }

    const allPass = Object.entries(verdict)
      .filter(([k]) => k !== 'GOOGLE_ADS_SAAS_CONNECTION')
      .every(([, v]) => v === 'PASS');
    if (allPass && src.sharedDevToken && src.deprecatedMcc && src.errors) {
      verdict.GOOGLE_ADS_SAAS_CONNECTION = 'PASS';
      console.log('PASS GOOGLE_ADS_SAAS_CONNECTION');
    } else {
      console.log('FAIL GOOGLE_ADS_SAAS_CONNECTION', verdict);
    }
  } finally {
    try {
      await prisma.adsSyncJob.deleteMany({
        where: { organizationId: { in: created.orgs } },
      });
      await prisma.adGoogleAdsAccount.deleteMany({
        where: { organizationId: { in: created.orgs } },
      });
      await prisma.adConnection.deleteMany({
        where: { organizationId: { in: created.orgs } },
      });
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: created.orgs } },
      }).catch(() => {});
      await prisma.user.deleteMany({ where: { organizationId: { in: created.orgs } } });
      await prisma.role.deleteMany({ where: { organizationId: { in: created.orgs } } });
      await prisma.subscription.deleteMany({ where: { organizationId: { in: created.orgs } } });
      await prisma.organization.deleteMany({ where: { id: { in: created.orgs } } });
    } catch (e) {
      console.warn('cleanup warning', e instanceof Error ? e.message : e);
    }
    await prisma.$disconnect();
  }

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) {
    console.log(`${k}=${v}`);
  }
  const failed = Object.values(verdict).filter((v) => v !== 'PASS');
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await prisma.$disconnect().catch(() => {});
});
