/**
 * Credit UI API: user read-only vs SUPER_ADMIN adjust + audit.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-credit-ui.ts
 */
import { createHmac, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET!;
const SUPER_EMAIL = process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com';

type Case = { name: string; ok: boolean; detail?: string };

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mint(user: { id: string; email: string; organizationId: string; role: string }) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  );
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function cleanup(orgId: string) {
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function main() {
  const results: Case[] = [];
  const stamp = Date.now();
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  if (!ownerRole) throw new Error('OWNER role missing');
  const superUser = await prisma.user.findUnique({
    where: { email: SUPER_EMAIL },
    include: { role: true },
  });
  if (!superUser) throw new Error(`Missing SUPER_ADMIN ${SUPER_EMAIL}`);

  const org = await prisma.organization.create({
    data: {
      name: `Credit UI ${stamp}`,
      slug: `credit-ui-${stamp}`,
      email: `credit.ui.${stamp}@example.com`,
    },
  });
  await prisma.creditWallet.create({
    data: { organizationId: org.id, balance: 40, lifetimeEarned: 40 },
  });
  const user = await prisma.user.create({
    data: {
      email: `credit.ui.${stamp}@example.com`,
      name: 'Credit UI User',
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: ownerRole.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  const userToken = mint({
    id: user.id,
    email: user.email,
    organizationId: org.id,
    role: 'OWNER',
  });
  const adminToken = mint({
    id: superUser.id,
    email: superUser.email,
    organizationId: superUser.organizationId,
    role: 'SUPER_ADMIN',
  });

  try {
    {
      const r = await api('/credits/balance', userToken);
      const body = r.json as { balance?: number; available?: number };
      results.push({
        name: 'user_can_read_balance',
        ok: r.status === 200 && Number(body.balance) === 40,
        detail: `http=${r.status} bal=${body.balance}`,
      });
    }

    {
      const r = await api('/credits/history?page=1&pageSize=10', userToken);
      results.push({
        name: 'user_can_read_history',
        ok: r.status === 200 && Array.isArray((r.json as { items?: unknown[] }).items),
        detail: `http=${r.status}`,
      });
    }

    {
      const r = await api('/credits/adjust', userToken, {
        method: 'POST',
        body: JSON.stringify({ delta: 10, reason: 'hack', idempotencyKey: randomUUID() }),
      });
      results.push({
        name: 'user_cannot_post_credits_adjust',
        ok: r.status === 404 || r.status === 401 || r.status === 403 || r.status === 405,
        detail: `http=${r.status}`,
      });
    }

    {
      const r = await api(`/admin/credits/${org.id}/adjust`, userToken, {
        method: 'POST',
        body: JSON.stringify({
          delta: 100,
          reason: 'user cố chỉnh credit',
          idempotencyKey: randomUUID(),
        }),
      });
      results.push({
        name: 'regular_user_blocked_from_admin_adjust',
        ok: r.status === 403,
        detail: `http=${r.status}`,
      });
    }

    {
      const r = await api(`/admin/credits/${org.id}/adjust`, adminToken, {
        method: 'POST',
        body: JSON.stringify({ delta: 25, reason: '', idempotencyKey: randomUUID() }),
      });
      results.push({
        name: 'admin_adjust_requires_reason',
        ok: r.status === 400,
        detail: `http=${r.status} msg=${JSON.stringify((r.json as { message?: unknown }).message)}`,
      });
    }

    const grantKey = randomUUID();
    {
      const r = await api(`/admin/credits/${org.id}/adjust`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          delta: 25,
          reason: 'Tặng credit test UI',
          idempotencyKey: grantKey,
        }),
      });
      const body = r.json as { before?: number; after?: number; amount?: number; delta?: number };
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      results.push({
        name: 'admin_grant_updates_balance',
        ok:
          (r.status === 200 || r.status === 201) &&
          Number(body.before) === 40 &&
          Number(body.after) === 65 &&
          Number(wallet?.balance) === 65,
        detail: `http=${r.status} before=${body.before} after=${body.after} db=${wallet?.balance}`,
      });
    }

    {
      const r = await api(`/admin/credits/${org.id}/adjust`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          delta: 25,
          reason: 'Tặng credit test UI',
          idempotencyKey: grantKey,
        }),
      });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      results.push({
        name: 'admin_grant_idempotent',
        ok: (r.json as { idempotent?: boolean }).idempotent === true && Number(wallet?.balance) === 65,
        detail: `idempotent=${(r.json as { idempotent?: boolean }).idempotent} bal=${wallet?.balance}`,
      });
    }

    {
      const r = await api(`/admin/credits/${org.id}/adjust`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          delta: -10,
          reason: 'Thu hồi credit test UI',
          idempotencyKey: randomUUID(),
        }),
      });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      results.push({
        name: 'admin_debit_updates_balance',
        ok: (r.status === 200 || r.status === 201) && Number(wallet?.balance) === 55,
        detail: `http=${r.status} db=${wallet?.balance} after=${(r.json as { after?: number }).after}`,
      });
    }

    {
      const audit = await prisma.auditLog.findFirst({
        where: { organizationId: org.id, action: 'PLATFORM_CREDIT_ADJUST' },
        orderBy: { createdAt: 'desc' },
      });
      const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
      results.push({
        name: 'admin_adjust_writes_audit',
        ok:
          Boolean(audit) &&
          meta.adminId === superUser.id &&
          meta.organizationId === org.id &&
          typeof meta.before === 'number' &&
          typeof meta.amount === 'number' &&
          typeof meta.after === 'number' &&
          typeof meta.reason === 'string' &&
          typeof meta.timestamp === 'string',
        detail: JSON.stringify({
          adminId: meta.adminId,
          org: meta.organizationId,
          before: meta.before,
          amount: meta.amount,
          after: meta.after,
          reason: meta.reason,
          timestamp: meta.timestamp,
        }),
      });
    }

    {
      const r = await api('/admin/credits?q=credit-ui-' + stamp, adminToken);
      const items = (r.json as { items?: Array<{ organizationId: string; balance: number }> }).items ?? [];
      const row = items.find((i) => i.organizationId === org.id);
      results.push({
        name: 'admin_list_includes_org',
        ok: r.status === 200 && Number(row?.balance) === 55,
        detail: `http=${r.status} bal=${row?.balance}`,
      });
    }

    {
      const r = await api(`/admin/credits/${org.id}/history`, adminToken);
      const items = (r.json as { items?: Array<{ amount: number; type: string }> }).items ?? [];
      results.push({
        name: 'admin_history_has_adjustments',
        ok: r.status === 200 && items.some((i) => i.type === 'ADMIN_ADJUST'),
        detail: `http=${r.status} n=${items.length}`,
      });
    }

    {
      const r = await api('/credits/balance', userToken);
      results.push({
        name: 'user_sees_updated_balance',
        ok: Number((r.json as { balance?: number }).balance) === 55,
        detail: `bal=${(r.json as { balance?: number }).balance}`,
      });
    }
  } finally {
    await cleanup(org.id);
    await prisma.$disconnect();
  }

  console.log('\n=== Credit UI API ===');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ?? ''}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
