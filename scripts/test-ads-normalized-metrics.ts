/**
 * Ads normalized metrics schema + safe math.
 * Run: pnpm test:ads-normalized-metrics
 */
import assert from 'node:assert/strict';
import {
  adsMetricsQuerySchema,
  adsNormalizedMetricsSchema,
  normalizeAdsMetrics,
  safeDivide,
} from '../packages/shared/src/ads-metrics';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function testSafeDivide() {
  assert.equal(safeDivide(10, 0), null);
  assert.equal(safeDivide(10, 2), 5);
  assert.equal(safeDivide(NaN, 2), null);
  console.log('PASS safeDivide');
}

function testNormalizeNoEarlyRound() {
  const m = normalizeAdsMetrics({
    impressions: 3,
    reach: 2,
    clicks: 1,
    spend: 10 / 3,
    conversions: 0,
    conversionValue: 0,
    currency: 'USD',
    date: '2026-07-01',
    conversionActions: [{ type: 'purchase', count: 0 }],
  });
  assert.equal(m.cpa, null);
  assert.ok(m.cpc !== null);
  assert.ok(Math.abs((m.cpc as number) - 10 / 3) < 1e-9);
  assert.ok(m.ctr !== null);
  adsNormalizedMetricsSchema.parse(m);
  console.log('PASS normalize no div0 / no early round');
}

function testQueryValidation() {
  const ok = adsMetricsQuerySchema.parse({
    organizationId: '11111111-1111-1111-1111-111111111111',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-07',
    page: 1,
    pageSize: 20,
  });
  assert.equal(ok.page, 1);
  assert.throws(() =>
    adsMetricsQuerySchema.parse({
      organizationId: '11111111-1111-1111-1111-111111111111',
      dateFrom: '2026-07-10',
      dateTo: '2026-07-01',
    }),
  );
  console.log('PASS date-range validation');
}

function testSchemaFiles() {
  const schema = fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
  assert.ok(schema.includes('conversionValue'));
  assert.ok(schema.includes('conversionActions'));
  assert.ok(schema.includes('timezone'));
  const shared = fs.readFileSync(path.join(root, 'packages/shared/src/ads-metrics.ts'), 'utf8');
  assert.ok(shared.includes('adsNormalizedMetricsSchema'));
  assert.ok(shared.includes('safeDivide'));
  const svc = fs.readFileSync(
    path.join(root, 'apps/api/src/ad-performance/ads-normalized.service.ts'),
    'utf8',
  );
  assert.ok(svc.includes('organizationId'));
  assert.ok(svc.includes('pageSize'));
  console.log('PASS schema + API pagination fields');
}

function main() {
  testSafeDivide();
  testNormalizeNoEarlyRound();
  testQueryValidation();
  testSchemaFiles();
  console.log('\nAll ads normalized metrics checks passed.');
}

main();
