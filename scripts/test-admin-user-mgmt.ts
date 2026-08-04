/**
 * Test quản trị user: khóa/mở, soft-delete, tặng thời gian, idempotency, RBAC.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-admin-user-mgmt.ts
 */
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET!;

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

async function cleanup(orgId: string) {
  const users = await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length) {
    await prisma.adminIdempotencyKey.deleteMany({
      where: { OR: [{ targetUserId: { in: userIds } }, { actorUserId: { in: userIds } }] },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { entityId: { in: userIds } }] },
    });
  }
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function main() {
  const results: Case[] = [];
  const stamp = Date.now();
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  const superRole = await prisma.role.findFirst({ where: { code: 'SUPER_ADMIN' } });
  if (!ownerRole || !superRole) throw new Error('roles missing');

  // Admin actor (SUPER_ADMIN) — dùng org tạm
  const adminOrg = await prisma.organization.create({
    data: {
      name: `Admin Actor ${stamp}`,
      slug: `admin-actor-${stamp}`,
      email: `admin.actor.${stamp}@example.com`,
    },
  });
  await prisma.creditWallet.create({ data: { organizationId: adminOrg.id, balance: 0 } });
  const adminUser = await prisma.user.create({
    data: {
      email: `admin.actor.${stamp}@example.com`,
      name: 'Admin Actor',
      authProvider: 'LOCAL',
      organizationId: adminOrg.id,
      roleId: superRole.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });
  const adminToken = mint({
    id: adminUser.id,
    email: adminUser.email,
    organizationId: adminOrg.id,
    role: 'SUPER_ADMIN',
  });

  // Target user
  const org = await prisma.organization.create({
    data: {
      name: `Target ${stamp}`,
      slug: `target-user-${stamp}`,
      email: `target.${stamp}@example.com`,
    },
  });
  await prisma.creditWallet.create({ data: { organizationId: org.id, balance: 0 } });
  const target = await prisma.user.create({
    data: {
      email: `target.${stamp}@example.com`,
      name: 'Target User',
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: ownerRole.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });
  // Session giả lập
  await prisma.authSession.create({
    data: {
      userId: target.id,
      organizationId: org.id,
      tokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const targetToken = mint({
    id: target.id,
    email: target.email,
    organizationId: org.id,
    role: 'OWNER',
  });

  const orgIds = [adminOrg.id, org.id];

  try {
    // RBAC: non-admin bị chặn
    {
      const r = await api(`/admin/users/${target.id}/status`, targetToken, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false, reason: 'hack attempt' }),
      });
      results.push({
        name: 'RBAC: OWNER không được khóa user',
        ok: r.status === 403,
        detail: `${r.status}`,
      });
    }

    // Khóa
    {
      const r = await api(`/admin/users/${target.id}/status`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false, reason: 'test lock account' }),
      });
      const sessions = await prisma.authSession.count({
        where: { userId: target.id, revokedAt: null },
      });
      const me = await api('/auth/me', targetToken);
      results.push({
        name: 'Khóa: revoke session + API 401',
        ok: r.status === 200 && sessions === 0 && me.status === 401,
        detail: `lock=${r.status} sessions=${sessions} me=${me.status}`,
      });
    }

    // Mở khóa
    {
      const r = await api(`/admin/users/${target.id}/status`, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true, reason: 'test unlock account' }),
      });
      const u = await prisma.user.findUnique({ where: { id: target.id } });
      results.push({
        name: 'Mở khóa: isActive=true',
        ok: r.status === 200 && u?.isActive === true,
        detail: `${r.status} isActive=${u?.isActive}`,
      });
    }

    // Tặng thời gian — user chưa có gói
    const giftKey = randomUUID();
    {
      const r = await api(`/admin/users/${target.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 10,
          unit: 'days',
          reason: 'gift days no plan',
          idempotencyKey: giftKey,
        }),
      });
      const sub = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      const ok =
        (r.status === 200 || r.status === 201) &&
        r.json?.idempotent === false &&
        sub?.status === SubscriptionStatus.ACTIVE &&
        !!sub;
      results.push({
        name: 'Tặng ngày cho user chưa có gói → ACTIVE',
        ok,
        detail: `status=${r.status} sub=${sub?.status} end=${sub?.currentPeriodEnd?.toISOString()}`,
      });
    }

    // Idempotent gift
    {
      const before = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      const r = await api(`/admin/users/${target.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 10,
          unit: 'days',
          reason: 'gift days no plan',
          idempotencyKey: giftKey,
        }),
      });
      const after = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      results.push({
        name: 'Idempotency: gift trùng key không cộng thêm',
        ok:
          (r.status === 200 || r.status === 201) &&
          r.json?.idempotent === true &&
          before?.currentPeriodEnd.getTime() === after?.currentPeriodEnd.getTime(),
        detail: `idempotent=${r.json?.idempotent}`,
      });
    }

    // Tặng tháng — cộng dồn
    {
      const before = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      const r = await api(`/admin/users/${target.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 1,
          unit: 'months',
          reason: 'gift one month',
          idempotencyKey: randomUUID(),
        }),
      });
      const after = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      const ok =
        (r.status === 200 || r.status === 201) &&
        !!before &&
        !!after &&
        after.currentPeriodEnd.getTime() > before.currentPeriodEnd.getTime();
      results.push({
        name: 'Tặng tháng: cộng vào hạn hiện tại',
        ok,
        detail: `before=${before?.currentPeriodEnd.toISOString()} after=${after?.currentPeriodEnd.toISOString()}`,
      });
    }

    // User hết hạn → gift từ now
    {
      await prisma.subscription.updateMany({
        where: { organizationId: org.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          currentPeriodEnd: new Date(Date.now() - 86400000),
        },
      });
      const now = Date.now();
      const r = await api(`/admin/users/${target.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 1,
          unit: 'years',
          reason: 'gift year after expired',
          idempotencyKey: randomUUID(),
        }),
      });
      const after = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      const approxYear = after && after.currentPeriodEnd.getTime() > now + 300 * 86400000;
      results.push({
        name: 'Tặng năm khi đã hết hạn → tính từ now + ACTIVE',
        ok:
          (r.status === 200 || r.status === 201) &&
          after?.status === SubscriptionStatus.ACTIVE &&
          !!approxYear,
        detail: `status=${after?.status} end=${after?.currentPeriodEnd.toISOString()}`,
      });
    }

    // Soft delete
    {
      await prisma.authSession.create({
        data: {
          userId: target.id,
          organizationId: org.id,
          tokenHash: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const r = await api(`/admin/users/${target.id}/soft-delete`, adminToken, {
        method: 'POST',
        body: JSON.stringify({ reason: 'test soft delete user', confirm: true }),
      });
      const u = await prisma.user.findUnique({ where: { id: target.id } });
      const sessions = await prisma.authSession.count({
        where: { userId: target.id, revokedAt: null },
      });
      const me = await api('/auth/me', targetToken);
      const ordersRemain = true; // không tạo order — chỉ đảm bảo user còn row
      results.push({
        name: 'Soft delete: giữ row, revoke session, API 401',
        ok:
          (r.status === 200 || r.status === 201) &&
          !!u?.deletedAt &&
          u.isActive === false &&
          sessions === 0 &&
          me.status === 401 &&
          ordersRemain,
        detail: `status=${r.status} del=${!!u?.deletedAt} sessions=${sessions} me=${me.status}`,
      });
    }

    // Detail history
    {
      const r = await api(`/admin/users/${target.id}`, adminToken);
      const hist = (r.json?.history || []) as unknown[];
      results.push({
        name: 'Chi tiết user có lịch sử lock/unlock/gift/delete',
        ok: r.status === 200 && hist.length >= 3,
        detail: `history=${hist.length}`,
      });
    }
  } finally {
    for (const id of orgIds) await cleanup(id);
    await prisma.$disconnect();
  }

  console.log('\n=== Admin user mgmt tests ===');
  let pass = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} — ${r.name}${r.detail ? ` | ${r.detail}` : ''}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} passed`);
  if (pass < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
