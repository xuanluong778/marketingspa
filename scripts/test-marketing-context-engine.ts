import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { MarketingContextEngineService } from '../apps/api/src/marketing-autopilot/context/marketing-context-engine.service';
import { MarketingContextDatasourcesService } from '../apps/api/src/marketing-autopilot/context/marketing-context-datasources.service';
import { MarketingContextCacheService } from '../apps/api/src/marketing-autopilot/context/marketing-context-cache.service';
import { redactMarketingContextSnapshot } from '../apps/api/src/marketing-autopilot/context/marketing-context-redaction.util';
import type { MarketingContextSnapshotPayload } from '../apps/api/src/marketing-autopilot/context/marketing-context.types';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function mockCache(): MarketingContextCacheService {
  const store = new Map<string, MarketingContextSnapshotPayload>();
  return {
    get: async (orgId: string) => store.get(orgId) ?? null,
    set: async (orgId: string, payload: MarketingContextSnapshotPayload) => {
      store.set(orgId, payload);
    },
    invalidate: async (orgId: string) => {
      store.delete(orgId);
    },
    getTtlSeconds: () => 120,
  } as unknown as MarketingContextCacheService;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const audit = new AuditService(prisma);
  const cache = mockCache();
  const datasources = new MarketingContextDatasourcesService(prisma);
  const engine = new MarketingContextEngineService(prisma, datasources, cache, audit);

  const org1 = await prisma.organization.create({
    data: { name: 'Context Engine Org 1', slug: `ctx-org1-${randomUUID().slice(0, 8)}` },
  });
  const org2 = await prisma.organization.create({
    data: { name: 'Context Engine Org 2', slug: `ctx-org2-${randomUUID().slice(0, 8)}` },
  });

  const role1 = await prisma.role.create({
    data: { organizationId: org1.id, code: 'OWNER', name: 'Owner', description: 'test' },
  });
  const user1 = await prisma.user.create({
    data: {
      email: `ctx.${randomUUID().slice(0, 8)}@example.com`,
      name: 'Context User 1',
      organizationId: org1.id,
      roleId: role1.id,
      authProvider: 'LOCAL',
      isActive: true,
    },
  });

  const authUser1: AuthUser = {
    id: user1.id,
    email: user1.email,
    name: user1.name,
    role: 'OWNER',
    organizationId: org1.id,
  };

  const refreshed = await engine.refreshContext(org1.id, authUser1 as any);
  const snapshot = refreshed.snapshot;

  const contextEnginePass =
    Boolean(snapshot.organizationId === org1.id) &&
    Boolean(snapshot.generatedAt) &&
    Boolean(snapshot.timeRange?.from && snapshot.timeRange?.to) &&
    Boolean(snapshot.metrics) &&
    Array.isArray(snapshot.insights) &&
    snapshot.insights.length <= 5 &&
    Array.isArray(snapshot.sources) &&
    snapshot.sources.length >= 8;

  const tenantIsolationPass = (async () => {
    const org2Ctx = await engine.refreshContext(org2.id);
    assert(org2Ctx.snapshot.organizationId === org2.id, 'Org2 snapshot must belong to org2');
    assert(refreshed.snapshot.organizationId !== org2Ctx.snapshot.organizationId, 'Snapshots must differ by org');
    const org1Row = await prisma.marketingContextSnapshot.findFirst({
      where: { organizationId: org1.id },
      orderBy: { createdAt: 'desc' },
    });
    const org2Row = await prisma.marketingContextSnapshot.findFirst({
      where: { organizationId: org2.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(org1Row && org2Row, 'Both orgs must have persisted snapshots');
    assert(org1Row.organizationId !== org2Row.organizationId, 'DB rows must be tenant-scoped');
    return true;
  })();

  const evidencePass = (() => {
    for (const insight of snapshot.insights) {
      if (!insight.evidence || !insight.source || !insight.timeRange || !insight.confidence) {
        return false;
      }
    }
    const insufficient = snapshot.insights.filter((i) => i.confidence === 'INSUFFICIENT_DATA');
    for (const i of insufficient) {
      if (!i.evidence.includes('=') && !i.evidence.includes('count')) return false;
    }
    return true;
  })();

  const failSoftPass = (async () => {
    const broken = new MarketingContextDatasourcesService({
      lead: { count: async () => { throw new Error('simulated crm failure'); } },
    } as any);
    const brokenEngine = new MarketingContextEngineService(
      prisma,
      {
        collectAll: async (orgId: string, timeRange: any) => {
          const base = await datasources.collectAll(orgId, timeRange);
          return base.map((r) =>
            r.domain === 'crm.leads'
              ? { domain: 'crm.leads', status: 'ERROR' as const, error: 'simulated crm failure' }
              : r,
          );
        },
      } as any,
      cache,
      audit,
    );
    const result = await brokenEngine.refreshContext(org1.id);
    const crmSource = result.snapshot.sources.find((s) => s.domain === 'crm.leads');
    return crmSource?.status === 'ERROR' && result.snapshot.organizationId === org1.id;
  })();

  const secretRedactionPass = (() => {
    const dirty = {
      organizationId: org1.id,
      accessToken: 'sk-live-secret-12345',
      password: 'hunter2',
      metrics: { leads: { total: 5 } },
      nested: { api_key: 'abc', safe: 'ok' },
    };
    const redacted = redactMarketingContextSnapshot(dirty) as Record<string, unknown>;
    const serialized = JSON.stringify(redacted);
    return (
      redacted.accessToken === '[redacted]' &&
      redacted.password === '[redacted]' &&
      (redacted.nested as Record<string, unknown>).api_key === '[redacted]' &&
      (redacted.nested as Record<string, unknown>).safe === 'ok' &&
      !serialized.includes('sk-live-secret') &&
      !serialized.includes('hunter2')
    );
  })();

  const existingSystemPass = (async () => {
    const cached = await engine.getContext(org1.id);
    assert(cached.snapshot.organizationId === org1.id, 'getContext must return org-scoped snapshot');
    const rowCount = await prisma.marketingContextSnapshot.count({ where: { organizationId: org1.id } });
    assert(rowCount >= 1, 'Snapshot must be persisted');
    return true;
  })();

  const facebookSafetyPass = (() => {
    const domains = snapshot.sources.map((s) => s.domain);
    return domains.includes('ads.adDailyStat') && !domains.some((d) => d.includes('facebook.graph'));
  })();

  const changedFiles = execSync('git diff --name-only').toString().trim().split('\n').filter(Boolean);
  const forbiddenPatterns = [
    'apps/api/src/auto-post/',
    'apps/api/src/facebook/',
  ];
  const facebookFilesModifiedNone = !changedFiles.some((f) =>
    forbiddenPatterns.some((p) => f.includes(p)),
  );

  const results = await Promise.all([
    tenantIsolationPass,
    failSoftPass,
    existingSystemPass,
  ]);

  console.log(`CONTEXT ENGINE: ${contextEnginePass ? 'PASS' : 'FAIL'}`);
  console.log(`TENANT ISOLATION: ${results[0] ? 'PASS' : 'FAIL'}`);
  console.log(`EVIDENCE: ${evidencePass ? 'PASS' : 'FAIL'}`);
  console.log(`FAIL-SOFT: ${results[1] ? 'PASS' : 'FAIL'}`);
  console.log(`SECRET REDACTION: ${secretRedactionPass ? 'PASS' : 'FAIL'}`);
  console.log(`EXISTING SYSTEM: ${results[2] ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK SAFETY: ${facebookSafetyPass ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK FILES MODIFIED: ${facebookFilesModifiedNone ? 'NONE' : 'CHANGED'}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
