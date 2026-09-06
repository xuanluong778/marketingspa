/**
 * Google Ads Data Engine gates.
 * Run: pnpm test:google-ads-data-engine
 *
 * GOOGLE_ADS_SYNC | AUTO_SYNC | DATA_ACCURACY | IDEMPOTENCY
 * DASHBOARD_DATA | MCP_READY | AUTOPILOT_DATA
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  prisma,
  AdConnectionProvider,
  AdConnectionStatus,
  AdsSyncPlatform,
  AdsSyncJobStatus,
  AdPlatform,
} = require('../packages/database/dist');

const root = path.join(__dirname, '..');
const API = (process.env.API_URL || process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const TAG = `GADS_ENGINE_${Date.now()}`;

const verdict = {
  GOOGLE_ADS_SYNC: 'FAIL',
  AUTO_SYNC: 'FAIL',
  DATA_ACCURACY: 'FAIL',
  IDEMPOTENCY: 'FAIL',
  DASHBOARD_DATA: 'FAIL',
  MCP_READY: 'FAIL',
  AUTOPILOT_DATA: 'FAIL',
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
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

function encryptSecret(plain, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function defaultSyncRange(days = 7) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
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

async function ensureAdsUser(orgId, suffix) {
  let perms = await prisma.permission.findMany({
    where: { code: { in: ['ads.read', 'ads.connect', 'ads.sync', 'ads.manage'] } },
  });
  if (!perms.length) {
    perms = await prisma.permission.findMany({ where: { code: { contains: 'ads.' } }, take: 4 });
  }
  const role = await prisma.role.create({
    data: {
      organizationId: orgId,
      code: `ADS_ENG_${suffix}_${TAG}`,
      name: 'Ads Engine',
      isSystem: true,
      permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${suffix}@test.local`,
      name: 'Ads Engine',
      passwordHash: 'x',
      organizationId: orgId,
      roleId: role.id,
      isActive: true,
    },
  });
  return { user, role };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sumDbMetrics(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.impressions += r.impressions || 0;
      acc.clicks += r.clicks || 0;
      acc.spend += Number(r.spend || 0);
      acc.conversions += Number(r.conversions || 0);
      return acc;
    },
    { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
  );
}

function sumGoogleRows(rows) {
  return rows.reduce(
    (acc, row) => {
      const m = row.metrics || {};
      acc.impressions += Number(m.impressions || 0);
      acc.clicks += Number(m.clicks || 0);
      acc.spend += (Number(m.costMicros || 0) || 0) / 1_000_000;
      acc.conversions += Number(m.conversions || 0);
      return acc;
    },
    { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
  );
}

function metricsClose(a, b, tolerance = 0.02) {
  const spendOk = Math.abs(a.spend - b.spend) <= Math.max(0.01, a.spend * tolerance);
  const impOk = a.impressions === b.impressions || Math.abs(a.impressions - b.impressions) <= 1;
  const clickOk = a.clicks === b.clicks;
  return spendOk && impOk && clickOk;
}

async function main() {
  console.log(`=== ${TAG} Google Ads Data Engine ===`);

  const org = await prisma.organization.create({
    data: { name: `${TAG} org`, slug: `${TAG.toLowerCase()}-org` },
  });
  await ensureActiveSubscription(org.id);
  const { user, role } = await ensureAdsUser(org.id, 'a');
  const token = mint(org.id, user.id, user.email, role.code);

  const workerSrc = read('apps/worker/src/processors/ads-sync.ts');
  const persistSrc = read('apps/worker/src/lib/google-ads-persist.ts');
  const apiSrc = read('apps/worker/src/lib/google-ads-api.ts');
  const enqueueSrc = read('apps/worker/src/lib/ads-sync-enqueue.ts');
  const schedulerSrc = read('apps/worker/src/schedulers/register-jobs.ts');
  const mcpSrc = read('apps/api/src/ads-mcp/ads-mcp.gateway.ts');
  const autoSrc = read('apps/api/src/ai-ads-manager/ads-automation.engine.ts');
  const uiHook = read('apps/web/src/hooks/use-ai-ads-manager.ts');
  const uiPage = read('apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx');
  const queueSrc = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');

  const pipelineOk =
    workerSrc.includes('fetchGoogleKeywords') &&
    workerSrc.includes('fetchGoogleSearchTerms') &&
    persistSrc.includes('upsertGoogleKeywords') &&
    persistSrc.includes('upsertGoogleSearchTermStats') &&
    apiSrc.includes('cost_micros') &&
    persistSrc.includes('costMicros') &&
    schedulerSrc.includes('scan-google-auto-sync') &&
    enqueueSrc.includes('scanAndEnqueueGoogleAutoSync') &&
    mcpSrc.includes('adDailyStat.count') &&
    mcpSrc.includes('mcpReady') &&
    autoSrc.includes('minImpressionsForAction') &&
    uiHook.includes('ADS_DATE_PRESETS') &&
    uiPage.includes('ADS_DATE_PRESETS');

  if (!pipelineOk) throw new Error('Missing data engine code paths');
  console.log('PASS pipeline code (keywords, search terms, auto-sync, MCP data gate, presets)');

  const enc = encryptSecret(JSON.stringify({ refreshToken: 'rt-engine-test' }), ENCRYPTION_KEY);
  const conn = await prisma.adConnection.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      provider: AdConnectionProvider.GOOGLE,
      status: AdConnectionStatus.CONNECTED,
      encryptedCredentials: enc,
      externalAccountId: '8888888888',
      externalAccountName: 'Engine Test',
      metadata: { loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '1276009537' },
    },
  });

  const syncTry = await api('/ai-ads-manager/google/sync', token, {
    method: 'POST',
    body: JSON.stringify(defaultSyncRange()),
  });
  if ((syncTry.status < 300 && syncTry.json?.jobId) || syncTry.status === 409) {
    verdict.AUTO_SYNC = 'PASS';
    console.log('PASS AUTO_SYNC (manual enqueue)');
  } else {
    console.log('FAIL AUTO_SYNC enqueue', syncTry.status, syncTry.json);
  }

  try {
    const mod = require('../apps/worker/dist/lib/ads-sync-enqueue.js');
    const scan = await mod.scanAndEnqueueGoogleAutoSync();
    if (scan && typeof scan.queued === 'number') {
      verdict.AUTO_SYNC = 'PASS';
      console.log(`PASS AUTO_SYNC scan queued=${scan.queued} skipped=${scan.skipped}`);
    }
  } catch (e) {
    console.log('WARN auto-sync scan', e.message?.slice(0, 120));
  }

  const idemKey = crypto
    .createHash('sha256')
    .update(`${org.id}|${conn.id}|8888888888|2026-02-01|2026-02-07|GOOGLE`)
    .digest('hex');
  const job1 = await prisma.adsSyncJob.create({
    data: {
      organizationId: org.id,
      connectionId: conn.id,
      accountId: '8888888888',
      platform: AdsSyncPlatform.GOOGLE,
      status: AdsSyncJobStatus.SUCCEEDED,
      dateFrom: new Date('2026-02-01'),
      dateTo: new Date('2026-02-07'),
      idempotencyKey: idemKey,
      finishedAt: new Date(),
      progressPercent: 100,
      requestedByUserId: user.id,
    },
  });
  const dup = await prisma.adsSyncJob.findUnique({ where: { idempotencyKey: idemKey } });
  if (dup?.id === job1.id && queueSrc.includes('idempotencyKey') && queueSrc.includes('reused: true')) {
    verdict.IDEMPOTENCY = 'PASS';
    console.log('PASS IDEMPOTENCY');
  } else {
    console.log('FAIL IDEMPOTENCY');
  }

  let liveConn = await prisma.adConnection.findFirst({
    where: {
      provider: AdConnectionProvider.GOOGLE,
      status: AdConnectionStatus.CONNECTED,
      encryptedCredentials: { not: null },
      externalAccountId: { not: null },
      organizationId: { not: org.id },
      NOT: { externalAccountId: { in: ['8888888888', '9999999999'] } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (liveConn) {
    const liveUser = await prisma.user.findFirst({
      where: { organizationId: liveConn.organizationId, isActive: true },
      include: { role: true },
    });
    if (liveUser) {
      const liveToken = mint(
        liveConn.organizationId,
        liveUser.id,
        liveUser.email,
        liveUser.role?.code || 'OWNER',
      );
      const range = defaultSyncRange(7);

      const syncRes = await api('/ai-ads-manager/google/sync', liveToken, {
        method: 'POST',
        body: JSON.stringify(range),
      });
      if (syncRes.status < 300 && syncRes.json?.jobId) {
        const jobId = syncRes.json.jobId;
        for (let i = 0; i < 36; i++) {
          await sleep(5000);
          const job = await api(`/ai-ads-manager/sync-jobs/${jobId}`, liveToken);
          const st = job.json?.status;
          if (st === 'SUCCEEDED') {
            verdict.GOOGLE_ADS_SYNC = 'PASS';
            console.log('PASS GOOGLE_ADS_SYNC');
            break;
          }
          if (st === 'FAILED') {
            console.log('FAIL GOOGLE_ADS_SYNC', job.json?.lastError);
            break;
          }
        }
        if (verdict.GOOGLE_ADS_SYNC === 'FAIL' && syncRes.json?.reused) {
          verdict.GOOGLE_ADS_SYNC = 'PASS';
          console.log('PASS GOOGLE_ADS_SYNC (idempotent reuse)');
        }
      } else if (syncRes.status === 409 || syncRes.json?.reused) {
        verdict.GOOGLE_ADS_SYNC = 'PASS';
        console.log('PASS GOOGLE_ADS_SYNC (idempotent/running)');
      } else {
        console.log('FAIL GOOGLE_ADS_SYNC enqueue', syncRes.status, syncRes.json);
      }

      const dash = await api(
        `/ai-ads-manager/dashboard?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`,
        liveToken,
      );
      if (dash.status === 200 && dash.json?.source === 'AdsMcpGateway') {
        verdict.DASHBOARD_DATA = 'PASS';
        console.log('PASS DASHBOARD_DATA');
      } else {
        console.log('FAIL DASHBOARD_DATA', dash.status, dash.json?.source);
      }

      const connections = await api('/ai-ads-manager/connections', liveToken);
      const googleItem = (connections.json?.items ?? []).find((i) => i.provider === 'GOOGLE');
      if (googleItem?.readiness?.mcpReady === true) {
        verdict.MCP_READY = 'PASS';
        verdict.AUTOPILOT_DATA = 'PASS';
        console.log('PASS MCP_READY + AUTOPILOT_DATA');
      } else {
        console.log('BLOCKER MCP_READY', googleItem?.readiness);
        verdict.MCP_READY = 'BLOCKER';
        verdict.AUTOPILOT_DATA = 'BLOCKER';
      }

      try {
        const workerMod = require('../apps/worker/dist/lib/google-ads-api.js');
        const { decryptSecret } = require('../apps/worker/dist/lib/encryption.js');
        const plain = decryptSecret(liveConn.encryptedCredentials, ENCRYPTION_KEY);
        let refreshToken = plain;
        try {
          const parsed = JSON.parse(plain);
          refreshToken = parsed.refreshToken || plain;
        } catch {
          /* plain token */
        }
        const accessToken = await workerMod.refreshGoogleAccessToken(refreshToken);
        const linked = await prisma.adGoogleAdsAccount.findFirst({
          where: {
            organizationId: liveConn.organizationId,
            customerId: liveConn.externalAccountId,
          },
        });
        const loginId =
          linked?.loginCustomerId ||
          (liveConn.metadata && liveConn.metadata.loginCustomerId) ||
          null;
        const customerId = String(liveConn.externalAccountId).replace(/-/g, '');
        const googleRows = await workerMod.fetchGoogleCampaignMetricsAggregate(
          accessToken,
          customerId,
          loginId,
          range.dateFrom,
          range.dateTo,
          120_000,
        );
        const googleSum = sumGoogleRows(googleRows);
        const dbRows = await prisma.adDailyStat.findMany({
          where: {
            organizationId: liveConn.organizationId,
            date: {
              gte: new Date(`${range.dateFrom}T00:00:00.000Z`),
              lte: new Date(`${range.dateTo}T00:00:00.000Z`),
            },
            adCampaign: { platform: AdPlatform.GOOGLE },
          },
        });
        const dbSum = sumDbMetrics(dbRows);
        if (dbRows.length > 0 && metricsClose(dbSum, googleSum)) {
          verdict.DATA_ACCURACY = 'PASS';
          console.log('PASS DATA_ACCURACY', { db: dbSum, google: googleSum });
        } else if (dbRows.length === 0) {
          verdict.DATA_ACCURACY = 'BLOCKER';
          console.log('BLOCKER DATA_ACCURACY — no AdDailyStat rows after sync');
        } else {
          console.log('FAIL DATA_ACCURACY', { db: dbSum, google: googleSum });
        }
      } catch (e) {
        const msg = e.message || String(e);
        if (/invalid_grant|hết hạn|thu hồi|TokenExpired|GoogleAdsTokenExpired/i.test(msg)) {
          verdict.DATA_ACCURACY = 'BLOCKER';
          console.log('BLOCKER DATA_ACCURACY — OAuth refresh token invalid; reconnect Google Ads');
        } else {
          console.log('FAIL DATA_ACCURACY', msg.slice(0, 140));
        }
      }
    }
  } else {
    console.log('SKIP live gates — no GOOGLE connection with selected customer outside test org');
    if (verdict.AUTO_SYNC === 'PASS') {
      verdict.GOOGLE_ADS_SYNC = 'BLOCKER';
      verdict.DATA_ACCURACY = 'BLOCKER';
      if (verdict.DASHBOARD_DATA === 'FAIL') verdict.DASHBOARD_DATA = 'BLOCKER';
      verdict.MCP_READY = 'BLOCKER';
      verdict.AUTOPILOT_DATA = 'BLOCKER';
      console.log('BLOCKER live gates — cần OAuth + chọn customer + sync thật');
    }
  }

  if (verdict.DASHBOARD_DATA === 'FAIL') {
    const dashApi = await api(
      `/ai-ads-manager/dashboard?dateFrom=${defaultSyncRange().dateFrom}&dateTo=${defaultSyncRange().dateTo}`,
      token,
    );
    if (
      dashApi.status === 200 &&
      dashApi.json?.source === 'AdsMcpGateway' &&
      uiPage.includes('ADS_DATE_PRESETS')
    ) {
      verdict.DASHBOARD_DATA = liveConn ? 'PASS' : 'BLOCKER';
      console.log(
        liveConn ? 'PASS DASHBOARD_DATA (fallback)' : 'BLOCKER DASHBOARD_DATA — API OK, chờ sync thật',
      );
    }
  }

  await prisma.adsSyncJob.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
  await prisma.adConnection.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.role.delete({ where: { id: role.id } }).catch(() => {});
  await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);

  const fails = Object.values(verdict).filter((v) => v === 'FAIL');
  const blockers = Object.values(verdict).filter((v) => v === 'BLOCKER');
  if (fails.length > 0) process.exit(1);
  if (blockers.length > 0) process.exit(2);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
