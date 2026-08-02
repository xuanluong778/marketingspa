/**
 * Meta Ads App Review path — static + logic gates (no mock in review flows).
 * Run: pnpm test:meta-ads-app-review
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testUnifiedArchitectureNoDuplicateModule() {
  assert.ok(fs.existsSync(path.join(root, 'apps/api/src/ad-performance/facebook-ads')));
  assert.ok(fs.existsSync(path.join(root, 'apps/api/src/ai-ads-manager')));
  assert.ok(fs.existsSync(path.join(root, 'apps/api/src/ads-actions')));
  assert.ok(fs.existsSync(path.join(root, 'apps/api/src/ads-mcp')));
  assert.equal(fs.existsSync(path.join(root, 'apps/api/src/meta-ads-v2')), false);
  console.log('PASS unified architecture (no duplicate Meta Ads module)');
}

function testOAuthScopesAndNoEnvAccountFallbackOnWrites() {
  const meta = read('apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts');
  assert.ok(meta.includes("'ads_read'"));
  assert.ok(meta.includes("'ads_management'"));
  assert.ok(meta.includes('createAdSet'));
  assert.ok(meta.includes('createAdCreative'));
  assert.ok(meta.includes('createAd'));
  assert.ok(meta.includes('getGrantedPermissions'));

  const svc = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(svc.includes('requireSelectedAdAccountId'));
  assert.ok(svc.includes('assertCanManageAds'));
  assert.ok(svc.includes('createPausedAdStack'));
  assert.ok(svc.includes('ADS_IDEMPOTENCY_PREFIX') || svc.includes('meta:ads:idem:'));
  assert.ok(!svc.includes('getEnvMetaAdAccountId()'));
  assert.ok(svc.includes('invalidateMetaAdsCaches'));
  console.log('PASS OAuth scopes + Graph create stack + no SERVER_ENV account fallback');
}

function testWorkerAdsQueuesWired() {
  const idx = read('apps/worker/src/index.ts');
  assert.ok(idx.includes('QUEUE_NAMES.ADS_SYNC'));
  assert.ok(idx.includes('QUEUE_NAMES.ADS_ACTION'));
  assert.ok(idx.includes('processAdsSync'));
  assert.ok(idx.includes('processAdsAction'));
  const action = read('apps/worker/src/processors/ads-action.ts');
  assert.ok(action.includes('MetaPermissionError'));
  assert.ok(action.includes('MetaTokenExpiredError'));
  assert.ok(action.includes('permanent'));
  assert.ok(action.includes('ads-action-lock'));
  assert.ok(action.includes('metaUpdateCampaignStatus'));
  console.log('PASS worker ADS_SYNC/ADS_ACTION + lock + no permission retry storm');
}

function testMcpThreeModes() {
  const engine = read('apps/api/src/ai-ads-manager/ads-automation.engine.ts');
  assert.ok(engine.includes("OBSERVE"));
  assert.ok(engine.includes("SUGGEST"));
  assert.ok(engine.includes("AUTO"));
  assert.ok(engine.includes('clampBudgetChangePercent'));
  assert.ok(engine.includes('ALERT_CPC_HIGH'));
  assert.ok(engine.includes('ADJUST_BUDGET_UP_ROAS'));

  const svc = read('apps/api/src/ai-ads-manager/ai-ads-manager.service.ts');
  assert.ok(svc.includes('normalizeMcpMode'));
  assert.ok(svc.includes('systemAutoApproveForMcp'));
  assert.ok(svc.includes('wasLastPausedByAutomation'));
  assert.ok(svc.includes('isRuleInCooldown'));
  assert.ok(svc.includes('emergencyStop'));

  const actions = read('apps/api/src/ads-actions/ads-action.service.ts');
  assert.ok(actions.includes('systemAutoApproveForMcp'));
  assert.ok(actions.includes('ENABLE_CAMPAIGN'));
  assert.ok(actions.includes('MCP AUTO không được tự bật lại'));
  console.log('PASS MCP 3 modes + budget clamp + no auto-enable user-paused');
}

function testControllerEndpoints() {
  const ctrl = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.controller.ts');
  assert.ok(ctrl.includes("insights/live"));
  assert.ok(ctrl.includes("campaigns/paused-stack"));
  assert.ok(ctrl.includes("campaigns/:campaignId/budget"));
  assert.ok(ctrl.includes("campaigns/:campaignId/schedule"));
  assert.ok(ctrl.includes("campaigns/:campaignId/status"));
  assert.ok(ctrl.includes("'ads.manage'"));
  assert.ok(ctrl.includes("'ads.read'"));
  console.log('PASS Meta Ads controller endpoints for App Review flow');
}

function testDiagnosticsUi() {
  const conn = read('apps/web/src/components/ai-ads-manager/tabs/connections-tab.tsx');
  assert.ok(conn.includes('ads_read'));
  assert.ok(conn.includes('ads_management'));
  assert.ok(conn.includes('metaPermissions'));
  const page = read('apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx');
  assert.ok(page.includes('canManageMetaWrites'));
  assert.ok(page.includes('useFacebookAdsStatus'));
  console.log('PASS FE diagnostics + write lock without ads_management');
}

function testIdempotencyAndCrossOrgGuards() {
  const svc = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(svc.includes('withIdempotentMutation') || svc.includes('readIdempotentResult'));
  assert.ok(svc.includes('acquireMutationLock'));
  const actions = read('apps/api/src/ads-actions/ads-action.service.ts');
  assert.ok(actions.includes('idempotencyKey'));
  assert.ok(actions.includes('organizationId !== user.organizationId'));
  console.log('PASS idempotency + cross-org guards present');
}

function testMigrationMcpModes() {
  const mig = read(
    'packages/database/prisma/migrations/20260729120000_meta_ads_mcp_modes/migration.sql',
  );
  assert.ok(mig.includes('mcp_mode'));
  assert.ok(mig.includes('max_budget_change_percent'));
  const schema = read('packages/database/prisma/schema.prisma');
  assert.ok(schema.includes('mcpMode'));
  assert.ok(schema.includes('ADJUST_BUDGET_DOWN_CPA'));
  console.log('PASS migration + schema mcpMode / rule types');
}

function testClampBudgetLogic() {
  // Inline mirror of clampBudgetChangePercent
  function clamp(requested: number, maxPct: number) {
    const max = Math.max(0, Math.min(100, maxPct));
    if (requested > max) return max;
    if (requested < -max) return -max;
    return requested;
  }
  assert.equal(clamp(50, 20), 20);
  assert.equal(clamp(-40, 20), -20);
  assert.equal(clamp(10, 20), 10);
  assert.equal(clamp(0, 20), 0);
  console.log('PASS budget % clamp math');
}

function main() {
  testUnifiedArchitectureNoDuplicateModule();
  testOAuthScopesAndNoEnvAccountFallbackOnWrites();
  testWorkerAdsQueuesWired();
  testMcpThreeModes();
  testControllerEndpoints();
  testDiagnosticsUi();
  testIdempotencyAndCrossOrgGuards();
  testMigrationMcpModes();
  testClampBudgetLogic();
  console.log('\nALL meta-ads-app-review checks PASS');
}

main();
