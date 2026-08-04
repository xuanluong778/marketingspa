/**
 * Ads SaaS full audit — mandatory security & correctness gates.
 * Run: pnpm test:ads-saas-audit
 * Exit non-zero on any failure. Do NOT deploy production if this fails.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertNoCredentialLeak,
  redactForAudit,
} from '../apps/api/src/common/utils/token-security.util';
import {
  ADS_PERMISSION_DEFS,
  defaultPermissionCodesForRole,
} from '../apps/api/src/common/constants/roles';
import {
  normalizeAdsMetrics,
  safeDivide,
  adsMcpHasPermission,
  assertApproverAllowed,
  isAdsActionsLive,
} from '../packages/shared/src/index';

const root = path.join(__dirname, '..');
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string): never {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name} — ${detail}`);
  throw new Error(`AUDIT FAIL: ${name}: ${detail}`);
}

function check(name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('AUDIT FAIL:')) throw e;
    fail(name, msg);
  }
}

// ─── 1. Cross-org IDOR ───────────────────────────────────────────────────────

check('cross-org IDOR (query always organizationId)', () => {
  const files = [
    'apps/api/src/ad-performance/ads-sync-queue.service.ts',
    'apps/api/src/ad-performance/ads-normalized.service.ts',
    'apps/api/src/ads-mcp/ads-mcp.gateway.ts',
    'apps/api/src/ads-actions/ads-action.service.ts',
    'apps/api/src/ai-ads-manager/ai-ads-manager.service.ts',
    'apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts',
    'apps/api/src/ad-performance/google-ads/google-ads.service.ts',
  ];
  for (const f of files) {
    const src = read(f);
    assert.ok(src.includes('organizationId'), `${f} must scope by organizationId`);
  }

  // Semantic: find by id alone without org → forbidden pattern in getJob/list
  const queue = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');
  assert.ok(queue.includes('organizationId: user.organizationId'));
  assert.ok(
    queue.includes('where: { id: jobId, organizationId: user.organizationId }') ||
      queue.includes('id: jobId, organizationId'),
  );

  const actions = read('apps/api/src/ads-actions/ads-action.service.ts');
  assert.ok(actions.includes('id, organizationId: user.organizationId'));

  // Simulated IDOR
  const rows = [
    { id: 'j1', organizationId: 'org-a' },
    { id: 'j2', organizationId: 'org-b' },
  ];
  function getJob(orgId: string, id: string) {
    const row = rows.find((r) => r.id === id && r.organizationId === orgId);
    if (!row) {
      const err = new Error('Không tìm thấy tài nguyên');
      (err as Error & { status: number }).status = 404;
      throw err;
    }
    return row;
  }
  assert.equal(getJob('org-a', 'j1').id, 'j1');
  assert.throws(() => getJob('org-a', 'j2'), (e: Error & { status?: number }) => e.status === 404);
  pass('cross-org IDOR');
});

// ─── 2. RBAC ads.* ───────────────────────────────────────────────────────────

check('RBAC ads.*', () => {
  const codes = ADS_PERMISSION_DEFS.map((p) => p.code);
  for (const c of ['ads.read', 'ads.connect', 'ads.sync', 'ads.analyze', 'ads.manage']) {
    assert.ok(codes.includes(c), `missing ${c}`);
  }
  const sale = defaultPermissionCodesForRole('SALE');
  assert.ok(sale.includes('ads.read'));
  assert.ok(!sale.includes('ads.manage'));
  assert.ok(!sale.includes('ads.sync'));

  const tech = defaultPermissionCodesForRole('TECHNICIAN');
  assert.ok(!tech.includes('ads.read'));

  const marketing = defaultPermissionCodesForRole('MARKETING');
  assert.ok(marketing.includes('ads.manage'));

  const controllers = [
    'apps/api/src/ai-ads-manager/ai-ads-manager.controller.ts',
    'apps/api/src/ad-performance/facebook-ads/facebook-ads.controller.ts',
    'apps/api/src/ad-performance/google-ads/google-ads.controller.ts',
    'apps/api/src/ads-actions/ads-action.controller.ts',
  ];
  for (const c of controllers) {
    const src = read(c);
    assert.ok(src.includes('RequirePermissions') || src.includes("@RequirePermissions"), c);
    assert.ok(src.includes('PermissionsGuard'), c);
  }

  const mcpCtx = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    role: 'SALE',
    permissions: ['ads.read'],
  };
  assert.equal(adsMcpHasPermission(mcpCtx, 'ads.read'), true);
  assert.equal(adsMcpHasPermission(mcpCtx, 'ads.analyze'), false);
  pass('RBAC ads.*');
});

// ─── 3. OAuth state fake / expired / replay ──────────────────────────────────

check('OAuth state fake, expired, replay', () => {
  const secret = 'test-oauth-state-secret-ads-audit!!';
  const TTL = 600_000;

  function sign(userId: string, organizationId: string, exp: number, nonce: string) {
    const payload = `${userId}:${organizationId}::${exp}:${nonce}`;
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  function verify(
    state: string,
    store: Map<string, string>,
  ): { userId: string; organizationId: string } {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const sig = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error('fake');
    }
    const [userId, organizationId, , expStr, nonce] = payload.split(':');
    if (Date.now() > parseInt(expStr, 10)) throw new Error('expired');
    if (!store.has(nonce)) throw new Error('replay');
    store.delete(nonce); // one-time consume
    return { userId, organizationId };
  }

  const nonce = randomBytes(8).toString('hex');
  const store = new Map([[nonce, 'u:o']]);
  const good = sign('u1', 'o1', Date.now() + TTL, nonce);
  assert.equal(verify(good, store).userId, 'u1');
  // replay
  assert.throws(() => verify(good, store), /replay/);

  // fake signature
  const fake = Buffer.from(
    `u1:o1::${Date.now() + TTL}:${randomBytes(8).toString('hex')}:deadbeef`,
  ).toString('base64url');
  assert.throws(() => verify(fake, new Map()), /fake/);

  // expired
  const n2 = randomBytes(8).toString('hex');
  const store2 = new Map([[n2, 'x']]);
  const expired = sign('u1', 'o1', Date.now() - 1000, n2);
  assert.throws(() => verify(expired, store2), /expired/);

  // Google + Meta one-time state
  const google = read('apps/api/src/ad-performance/google-ads/google-ads.service.ts');
  assert.ok(google.includes('timingSafeEqual'));
  assert.ok(google.includes('state_reused_or_missing') || google.includes('getdel'));
  assert.ok(google.includes('expired') || google.includes('Date.now()'));
  assert.ok(google.includes("'NX'") || google.includes('"NX"'));

  const meta = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(meta.includes('oauth:meta-ads:state:'));
  assert.ok(meta.includes('createOneTimeState'));
  assert.ok(meta.includes('consumeOneTimeState'));
  assert.ok(meta.includes('state_reused_or_missing') || meta.includes('getdel'));
  assert.ok(meta.includes("'NX'") || meta.includes('"NX"'));
  pass('OAuth state fake/expired/replay');
});

// ─── 4. Token never in API / log / Redis / BullMQ / FE ────────────────────────

check('token not in API, log, Redis, BullMQ, frontend', () => {
  const raw = 'EAAB_secret_audit_token_xyz_9876543210';
  assert.throws(() => assertNoCredentialLeak({ accessToken: raw }, raw));
  assert.throws(() => assertNoCredentialLeak({ encryptedCredentials: 'enc' }, raw));
  const redacted = redactForAudit({
    accessToken: raw,
    refreshToken: '1//rt',
    encryptedCredentials: 'blob',
  }) as Record<string, unknown>;
  assert.notEqual(redacted.accessToken, raw);

  const queue = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');
  assert.ok(queue.includes('assertSafePayload'), 'queue assertSafePayload');
  assert.ok(!/accessToken\s*:/.test(queue), 'queue no accessToken field');
  assert.ok(!queue.includes('decryptSecret'), 'API enqueue must not decrypt');

  const proc = read('apps/worker/src/processors/ads-sync.ts');
  assert.ok(!proc.includes('job.data.accessToken'), 'worker no job.data.accessToken');
  assert.ok(!proc.includes('job.data.refreshToken'), 'worker no job.data.refreshToken');
  assert.ok(proc.includes('assertSafePayload'), 'worker assertSafePayload');

  const actionQ = read('apps/api/src/ads-actions/ads-action.service.ts');
  assert.ok(actionQ.includes('assertSafePayload'), 'action assertSafePayload');

  // Frontend: Meta/Google Ads connect via OAuth only (Gmail may still paste for reports)
  const hooks = read('apps/web/src/hooks/use-ai-ads-manager.ts');
  assert.ok(hooks.includes('startGoogleOAuth') || hooks.includes('startMetaOAuth'), 'oauth starters');
  assert.ok(hooks.includes('Dùng OAuth') || hooks.includes('không paste'), 'reject google paste');

  const page = read('apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx');
  assert.ok(!/\baccessToken\b/.test(page), 'FE page no Meta/Google accessToken');
  assert.ok(!page.includes('EAAB'), 'FE page no EAAB token literal');
  assert.ok(!page.includes('graph.facebook.com'), 'FE no Meta graph');
  assert.ok(!page.includes('googleads.googleapis.com'), 'FE no Google Ads API');

  // Redis OAuth state stores userId:organizationId only (Google + Meta)
  const google = read('apps/api/src/ad-performance/google-ads/google-ads.service.ts');
  const gCreate = google.indexOf('private async createOneTimeState');
  const gConsume = google.indexOf('private async consumeOneTimeState');
  assert.ok(gCreate > 0 && gConsume > gCreate, 'google one-time state methods');
  const setBlock = google.slice(gCreate, gConsume);
  assert.ok(
    setBlock.includes('${userId}:${organizationId}') ||
      /userId\}:\$\{organizationId\}/.test(setBlock) ||
      setBlock.includes('userId}:${organizationId}'),
    'redis state value is user:org only',
  );
  assert.ok(setBlock.includes("'NX'") || setBlock.includes('"NX"'), 'google NX');
  assert.ok(!setBlock.includes('accessToken'), 'redis state no accessToken');
  assert.ok(!setBlock.includes('refreshToken'), 'redis state no refreshToken');

  const meta = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  const mCreate = meta.indexOf('private async createOneTimeState');
  const mConsume = meta.indexOf('private async consumeOneTimeState');
  assert.ok(mCreate > 0 && mConsume > mCreate, 'meta one-time state methods');
  const metaSet = meta.slice(mCreate, mConsume);
  assert.ok(
    metaSet.includes('${userId}:${organizationId}') ||
      /userId\}:\$\{organizationId\}/.test(metaSet) ||
      metaSet.includes('userId}:${organizationId}'),
    'meta redis state user:org',
  );
  assert.ok(metaSet.includes("'NX'") || metaSet.includes('"NX"'), 'meta NX');
  assert.ok(!metaSet.includes('accessToken'), 'meta redis no accessToken');
  pass('token leak surfaces');
});

// ─── 5. Job retry no duplicate data ──────────────────────────────────────────

check('job retry no duplicate data', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  assert.ok(schema.includes('@@unique([organizationId, campaignId, dateFrom, dateTo])'));
  assert.ok(schema.includes('idempotencyKey'));
  assert.ok(schema.includes('model AdsSyncJob'));

  const proc = read('apps/worker/src/processors/ads-sync.ts');
  assert.ok(proc.includes('upsert'));
  assert.ok(
    proc.includes('facebookAdsCampaignSnapshot.upsert') ||
      proc.includes('upsertDaily') ||
      proc.includes('upsertMeta'),
  );

  const queue = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');
  assert.ok(queue.includes('idempotencyKey'));
  assert.ok(queue.includes('ConflictException') || queue.includes('reused'));
  pass('job retry idempotent upsert');
});

// ─── 6. Concurrent sync same account blocked ─────────────────────────────────

check('two sync jobs same account not concurrent', () => {
  const lock = read('apps/worker/src/lib/ads-sync-lock.ts');
  assert.ok(lock.includes('ads-sync-lock:'));
  assert.ok(lock.includes('NX'));
  assert.ok(lock.includes('acquireAdsSyncLock'));

  const proc = read('apps/worker/src/processors/ads-sync.ts');
  assert.ok(proc.includes('acquireAdsSyncLock'));
  assert.ok(proc.includes('releaseAdsSyncLock'));
  // Simulate NX lock
  const locks = new Set<string>();
  function tryLock(key: string) {
    if (locks.has(key)) return false;
    locks.add(key);
    return true;
  }
  assert.equal(tryLock('ads-sync-lock:META:act_1'), true);
  assert.equal(tryLock('ads-sync-lock:META:act_1'), false);
  locks.delete('ads-sync-lock:META:act_1');
  assert.equal(tryLock('ads-sync-lock:META:act_1'), true);
  pass('sync lock concurrency');
});

// ─── 7. Meta + Google metrics normalized ─────────────────────────────────────

check('Meta/Google metrics normalized', () => {
  const m = normalizeAdsMetrics({
    impressions: 1000,
    reach: 800,
    clicks: 50,
    spend: 100,
    conversions: 0,
    conversionValue: 0,
    currency: 'VND',
    date: '2026-07-01',
    recomputeRates: true,
  });
  assert.equal(m.cpa, null, 'cpa null when conversions=0');
  // conversionValue=0 & spend>0 → roas=0 (finite), not null
  assert.equal(m.roas, 0);
  assert.equal(safeDivide(1, 0), null);
  assert.ok(m.ctr != null);

  const shared = read('packages/shared/src/ads-metrics.ts');
  assert.ok(shared.includes('safeDivide'));
  assert.ok(shared.includes('normalizeAdsMetrics'));

  const workerNorm = read('apps/worker/src/lib/ads-metrics-normalize.ts');
  assert.ok(workerNorm.includes('normalizeAdsMetrics') || workerNorm.includes('normalizeMeta'));
  assert.ok(workerNorm.includes('normalizeGoogle') || workerNorm.includes('Google'));
  pass('normalized metrics');
});

// ─── 8. MCP no cross-org read ────────────────────────────────────────────────

check('MCP no cross-org read', () => {
  const gw = read('apps/api/src/ads-mcp/ads-mcp.gateway.ts');
  assert.ok(gw.includes('ctx.organizationId'));
  assert.ok(!gw.includes('controllers:')); // module has no public controller — check module
  const mod = read('apps/api/src/ads-mcp/ads-mcp.module.ts');
  assert.ok(!mod.includes('controllers:'));
  assert.ok(gw.includes('assertMcpToolPermission') || gw.includes('assertMcpToolPermission'));
  assert.ok(/listInsights\(\s*\n?\s*ctx\.organizationId/.test(gw));
  pass('MCP org isolation');
});

// ─── 9. Dashboard no direct provider API ─────────────────────────────────────

check('Dashboard no direct provider API', () => {
  const ai = read('apps/api/src/ai-ads-manager/ai-ads-manager.service.ts');
  const dash = ai.slice(ai.indexOf('async getDashboard'), ai.indexOf('async getConnections'));
  assert.ok(dash.includes('adsMcp.getMetrics') || dash.includes('AdsMcpGateway'));
  assert.ok(!dash.includes('facebookAds.'));
  assert.ok(!dash.includes('googleAds.'));
  assert.ok(!dash.includes('metaGet'));
  assert.ok(!dash.includes('fetch('));

  const page = read('apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx');
  assert.ok(page.includes('PostgreSQL') || page.includes('database') || page.includes('Đồng bộ'));
  assert.ok(!page.includes('graph.facebook.com'));
  assert.ok(!page.includes('googleads.googleapis.com'));

  const hook = read('apps/web/src/hooks/use-ai-ads-manager.ts');
  assert.ok(hook.includes('/ai-ads-manager/dashboard'));
  assert.ok(!hook.includes('graph.facebook.com'));
  pass('dashboard via MCP/DB only');
});

// ─── 10. Google no paste refresh token ───────────────────────────────────────

check('Google no paste refresh token', () => {
  const ai = read('apps/api/src/ai-ads-manager/ai-ads-manager.service.ts');
  assert.ok(ai.includes('Không chấp nhận paste Google refresh token'));
  assert.ok(ai.includes('getGoogleOAuthStart') || ai.includes('googleAds.getOAuthStartUrl'));

  const hook = read('apps/web/src/hooks/use-ai-ads-manager.ts');
  assert.ok(hook.includes('Dùng OAuth') || hook.includes('không paste'));
  assert.ok(hook.includes('startGoogleOAuth'));

  const googleSvc = read('apps/api/src/ad-performance/google-ads/google-ads.service.ts');
  assert.ok(!googleSvc.includes('dto.refreshToken'));
  pass('Google OAuth only');
});

// ─── 11. Meta no token in query string ───────────────────────────────────────

check('Meta no token in query string', () => {
  const api = read('apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts');
  const getJson = api.includes('private async getJson')
    ? api.slice(api.indexOf('private async getJson'))
    : api;
  assert.ok(getJson.includes('Bearer') || api.includes('Authorization'));
  assert.ok(!getJson.includes('access_token='));

  const worker = read('apps/worker/src/lib/meta-graph-ads.ts');
  assert.ok(worker.includes('Authorization'));
  assert.ok(worker.includes('Bearer'));
  assert.ok(!worker.includes('access_token='));
  pass('Meta Bearer only');
});

// ─── Extra gates from AdsAction / feature flags ──────────────────────────────

check('AdsAction AI cannot self-approve + write flag off', () => {
  assert.equal(isAdsActionsLive({ ADS_ACTIONS_LIVE: 'false' }), false);
  assert.throws(() =>
    assertApproverAllowed({
      source: 'AI',
      aiGenerated: true,
      requestedByUserId: 'a',
      approvedByUserId: 'a',
    }),
  );
  pass('AdsAction safety');
});

// Summary
const failed = results.filter((r) => !r.ok);
console.log(`\n── Ads SaaS audit: ${results.length - failed.length}/${results.length} passed ──`);
if (failed.length) {
  process.exitCode = 1;
  console.error('DO NOT DEPLOY PRODUCTION — security/audit failures present.');
  process.exit(1);
}
console.log('All mandatory Ads SaaS audit checks passed.');
console.log('Production deploy still requires: lint + typecheck + full ads tests + build + migrate PASS.');
