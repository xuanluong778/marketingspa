/**
 * Ads Internal MCP Gateway — unit checks (Zod + limits + no public surface).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADS_MCP_LIMITS,
  ADS_MCP_TOOLS,
  adsAiAnalysisOutputSchema,
  adsMcpDateRangeSchema,
  adsMcpHasPermission,
  adsMcpMetricsSummarySchema,
  adsMcpToolPermissionMap,
  adsMcpWasteReportSchema,
} from '../packages/shared/src/ads-mcp';

const root = path.resolve(__dirname, '..');

function testPermissions() {
  const owner = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    role: 'OWNER',
    permissions: [],
  };
  const sale = { ...owner, role: 'SALE', permissions: ['ads.read'] };
  assert.equal(adsMcpHasPermission(owner, 'ads.analyze'), true);
  assert.equal(adsMcpHasPermission(sale, 'ads.read'), true);
  assert.equal(adsMcpHasPermission(sale, 'ads.analyze'), false);
  assert.equal(adsMcpToolPermissionMap[ADS_MCP_TOOLS.DETECT_BUDGET_WASTE], 'ads.analyze');
  assert.equal(adsMcpToolPermissionMap[ADS_MCP_TOOLS.LIST_ACCOUNTS], 'ads.read');
  console.log('PASS permissions');
}

function testDateLimits() {
  assert.throws(() =>
    adsMcpDateRangeSchema.parse({ dateFrom: '2026-01-01', dateTo: '2025-01-01' }),
  );
  const long = adsMcpDateRangeSchema.safeParse({
    dateFrom: '2026-01-01',
    dateTo: '2026-07-01',
  });
  assert.equal(long.success, false);
  const ok = adsMcpDateRangeSchema.parse({
    dateFrom: '2026-07-01',
    dateTo: '2026-07-20',
  });
  assert.equal(ok.dateFrom, '2026-07-01');
  assert.ok(ADS_MCP_LIMITS.maxRows <= 50);
  assert.ok(ADS_MCP_LIMITS.timeoutMs <= 10_000);
  console.log('PASS date/row/timeout limits');
}

function testStructuredSchemas() {
  const metrics = adsMcpMetricsSummarySchema.parse({
    dateFrom: '2026-07-01',
    dateTo: '2026-07-07',
    organizationId: '11111111-1111-1111-1111-111111111111',
    totalSpend: 1_000_000,
    conversionValue: 2_500_000,
    totalConversions: 10,
    impressions: 10000,
    clicks: 200,
    roas: 2.5,
    cpa: 100_000,
    ctr: 2,
    activeCampaigns: 3,
    poorCampaigns: 1,
    source: 'AdsMcpGateway',
    evidence: [{ metric: 'roas', value: 2.5 }],
  });
  assert.equal(metrics.source, 'AdsMcpGateway');

  const analysis = adsAiAnalysisOutputSchema.parse({
    organizationId: '11111111-1111-1111-1111-111111111111',
    campaignId: '33333333-3333-3333-3333-333333333333',
    summary: 'ROAS 2.5 — giữ ngân sách, tối ưu creative.',
    verdict: 'hold',
    confidence: 0.8,
    efficiencyScore: 72,
    recommendations: ['Giữ ngân sách', 'A/B creative'],
    evidence: [
      { metric: 'roas', value: 2.5 },
      { metric: 'spend', value: 1_000_000, unit: 'money' },
    ],
    wasteSignals: [],
    source: 'AdsMcpGateway',
    generatedAt: new Date().toISOString(),
  });
  assert.ok(analysis.evidence.length >= 1);

  const waste = adsMcpWasteReportSchema.parse({
    dateFrom: '2026-07-01',
    dateTo: '2026-07-07',
    organizationId: '11111111-1111-1111-1111-111111111111',
    signals: [
      {
        code: 'SPEND_NO_CONVERSION',
        severity: 'high',
        campaignId: 'c1',
        campaignName: 'Test',
        platform: 'META',
        message: 'Chi cao không conversion',
        evidence: [
          { metric: 'spend', value: 500000 },
          { metric: 'conversions', value: 0 },
        ],
        estimatedWasteSpend: 500000,
      },
    ],
    totalEstimatedWaste: 500000,
    evidence: [{ metric: 'signalCount', value: 1 }],
    source: 'AdsMcpGateway',
  });
  assert.equal(waste.signals[0].code, 'SPEND_NO_CONVERSION');
  console.log('PASS structured Zod outputs');
}

function testNoPublicController() {
  const mod = fs.readFileSync(
    path.join(root, 'apps/api/src/ads-mcp/ads-mcp.module.ts'),
    'utf8',
  );
  assert.ok(!mod.includes('controllers:'));
  const gw = fs.readFileSync(
    path.join(root, 'apps/api/src/ads-mcp/ads-mcp.gateway.ts'),
    'utf8',
  );
  assert.ok(gw.includes('Không gọi Meta/Google'));
  assert.ok(gw.includes('assertNoCredentialLeak'));
  assert.ok(gw.includes('organizationId'));
  const svc = fs.readFileSync(
    path.join(root, 'apps/api/src/ai-ads-manager/ai-ads-manager.service.ts'),
    'utf8',
  );
  assert.ok(svc.includes('adsMcp.getMetrics'));
  assert.ok(svc.includes('adsMcp.listCampaigns'));
  assert.ok(svc.includes('adsMcp.analyzeCampaign'));
  assert.ok(!svc.includes('facebookAds.getStatus'));
  console.log('PASS internal-only + ai-ads-manager via MCP');
}

testPermissions();
testDateLimits();
testStructuredSchemas();
testNoPublicController();
console.log('\nAll ads MCP gateway checks passed.');
