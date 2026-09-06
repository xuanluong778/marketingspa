/**
 * Funnel delete — tenant safety, public block, list refresh.
 * Run: pnpm test:funnel-delete
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildFallbackFunnelComplete } from '../packages/shared/src/funnel-complete';

type Case = { name: string; ok: boolean; detail?: string };

const prisma = new PrismaClient();

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);
const JWT_SECRET = process.env.JWT_SECRET;
const TAG = `FUNNEL_DEL_${Date.now()}`;

const verdict = {
  FUNNEL_DELETE: 'FAIL',
  TENANT_SAFETY: 'FAIL',
  UI_REFRESH: 'FAIL',
};

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mint(orgId: string, userId: string, email: string, role: string) {
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
    .createHmac('sha256', JWT_SECRET!)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

function okStatus(s: number) {
  return s === 200 || s === 201 || s === 204;
}

function countByStatus(items: Array<{ status?: string }>) {
  const out: Record<string, number> = { all: 0, ACTIVE: 0, DRAFT: 0, PAUSED: 0, ARCHIVED: 0 };
  for (const row of items) {
    const st = row.status ?? 'DRAFT';
    out.all += 1;
    out[st] = (out[st] ?? 0) + 1;
  }
  return out;
}

async function ensureActiveSubscription(orgId: string) {
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

async function ensureOwner(orgId: string, suffix: string) {
  const role = await prisma.role.create({
    data: { organizationId: orgId, code: 'OWNER', name: 'Owner', isSystem: true },
  });
  const perms = await prisma.permission.findMany({
    where: { code: { in: ['lead.read', 'lead.write'] } },
  });
  if (perms.length) {
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${suffix}@test.local`,
      name: `Funnel Delete ${suffix}`,
      passwordHash: 'x',
      organizationId: orgId,
      roleId: role.id,
      isActive: true,
    },
  });
  return { user, role, token: mint(orgId, user.id, user.email, role.code) };
}

async function createMinimalFunnel(orgId: string, userId: string, label: string) {
  const spec = buildFallbackFunnelComplete({ templateSlug: 'booking' });
  return prisma.funnelRecommendation.create({
    data: {
      organizationId: orgId,
      createdById: userId,
      prompt: label,
      result: { schemaVersion: 'funnel-generator.v1', recommendations: [] },
      source: 'fallback',
      completeSpec: spec,
      completeSource: 'fallback',
      completeGeneratedAt: new Date(),
      status: 'DRAFT',
    },
  });
}

async function main() {
  console.log(`=== ${TAG} funnel delete E2E ===`);
  if (!JWT_SECRET) throw new Error('JWT_SECRET missing');

  const orgA = await prisma.organization.create({
    data: { name: `${TAG} A`, slug: `${TAG.toLowerCase()}-a` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` },
  });
  await ensureActiveSubscription(orgA.id);
  await ensureActiveSubscription(orgB.id);
  const { user: userA, token: tokenA } = await ensureOwner(orgA.id, 'a');
  const { user: userB, token: tokenB } = await ensureOwner(orgB.id, 'b');

  const control = await createMinimalFunnel(orgA.id, userA.id, 'Control funnel');
  const target = await createMinimalFunnel(orgA.id, userA.id, 'Delete me');
  const foreign = await createMinimalFunnel(orgB.id, userB.id, 'Foreign funnel');

  await prisma.funnelRecommendation.update({
    where: { id: target.id },
    data: {
      status: 'ACTIVE',
      publishedSpec: target.completeSpec ?? undefined,
      publishedVersion: 1,
      publishedAt: new Date(),
    },
  });

  const listBefore = await api('/funnel-builder/recommendations', tokenA);
  const itemsBefore = Array.isArray(listBefore.json)
    ? listBefore.json
    : (listBefore.json?.items ?? []);
  const countsBefore = countByStatus(itemsBefore);
  const hasTargetBefore = itemsBefore.some((r: { id: string }) => r.id === target.id);
  const hasControlBefore = itemsBefore.some((r: { id: string }) => r.id === control.id);

  const publicBefore = await api(`/funnel-builder/public/${target.id}/form`);
  const crossDelete = await api(`/funnel-builder/recommendations/${foreign.id}`, tokenA, {
    method: 'DELETE',
  });
  const foreignStill = await prisma.funnelRecommendation.findFirst({
    where: { id: foreign.id, organizationId: orgB.id },
  });
  const tenantOk = crossDelete.status === 404 && foreignStill !== null;

  if (tenantOk) {
    verdict.TENANT_SAFETY = 'PASS';
    console.log('PASS TENANT_SAFETY');
  } else {
    console.log('FAIL TENANT_SAFETY', {
      crossDelete: crossDelete.status,
      foreignStill: Boolean(foreignStill),
    });
  }

  const deleted = await api(`/funnel-builder/recommendations/${target.id}`, tokenA, {
    method: 'DELETE',
  });
  const listAfter = await api('/funnel-builder/recommendations', tokenA);
  const itemsAfter = Array.isArray(listAfter.json)
    ? listAfter.json
    : (listAfter.json?.items ?? []);
  const countsAfter = countByStatus(itemsAfter);
  const hasTargetAfter = itemsAfter.some((r: { id: string }) => r.id === target.id);
  const hasControlAfter = itemsAfter.some((r: { id: string }) => r.id === control.id);
  const getDeleted = await api(`/funnel-builder/recommendations/${target.id}`, tokenA);
  const publicAfter = await api(`/funnel-builder/public/${target.id}/form`);

  const deleteOk =
    okStatus(deleted.status) &&
    deleted.json?.deleted === true &&
    !hasTargetAfter &&
    getDeleted.status === 404 &&
    publicAfter.status >= 400 &&
    publicBefore.status === 200 &&
    hasControlAfter;

  if (deleteOk) {
    verdict.FUNNEL_DELETE = 'PASS';
    console.log('PASS FUNNEL_DELETE');
  } else {
    console.log('FAIL FUNNEL_DELETE', {
      deleted: deleted.status,
      hasTargetAfter,
      getDeleted: getDeleted.status,
      publicAfter: publicAfter.status,
      publicBefore: publicBefore.status,
      hasControlAfter,
    });
  }

  const refreshOk =
    hasTargetBefore &&
    hasControlBefore &&
    countsBefore.all >= 2 &&
    countsAfter.all === countsBefore.all - 1 &&
    countsBefore.ACTIVE >= 1 &&
    countsAfter.ACTIVE === countsBefore.ACTIVE - 1 &&
    countsAfter.DRAFT === countsBefore.DRAFT;

  if (refreshOk) {
    verdict.UI_REFRESH = 'PASS';
    console.log('PASS UI_REFRESH');
  } else {
    console.log('FAIL UI_REFRESH', { countsBefore, countsAfter, hasTargetBefore });
  }

  try {
    await prisma.funnelRecommendation.deleteMany({
      where: { id: { in: [control.id, foreign.id] } },
    });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.role.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
  } catch (e) {
    console.warn('cleanup', e instanceof Error ? e.message : e);
  }

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) {
    console.log(`${k}=${v}`);
  }
  await prisma.$disconnect();
  if (Object.values(verdict).some((v) => v !== 'PASS')) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
