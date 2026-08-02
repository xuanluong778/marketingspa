/**
 * Smoke-test Platform SUPER_ADMIN RBAC for /api/v1/admin/*
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-platform-admin-rbac.ts
 */
import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET;
const SUPER_EMAIL = process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com';

type Case = { name: string; ok: boolean; detail?: string };

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mintAccessToken(user: {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET missing');
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
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

function hasSecretLeak(payload: unknown): boolean {
  const s = JSON.stringify(payload ?? {});
  return /passwordHash|"password"|refreshToken|JWT_SECRET|SEPAY_|apiKey|accessToken/i.test(s);
}

async function main() {
  const results: Case[] = [];

  const superUser = await prisma.user.findUnique({
    where: { email: SUPER_EMAIL },
    include: { role: true },
  });
  if (!superUser) throw new Error(`Missing SUPER_ADMIN user ${SUPER_EMAIL}`);
  results.push({
    name: 'db_super_admin_role',
    ok: superUser.role.code === 'SUPER_ADMIN',
    detail: superUser.role.code,
  });

  const other = await prisma.user.findFirst({
    where: { email: { not: SUPER_EMAIL }, isActive: true },
    include: { role: true },
  });
  if (!other) throw new Error('Need another active user for negative tests');

  const superToken = mintAccessToken({
    id: superUser.id,
    email: superUser.email,
    organizationId: superUser.organizationId,
    role: superUser.role.code,
  });
  const otherToken = mintAccessToken({
    id: other.id,
    email: other.email,
    organizationId: other.organizationId,
    role: other.role.code,
  });

  {
    const r = await api('/admin/overview');
    results.push({
      name: 'unauth_admin_overview',
      ok: r.status === 401,
      detail: String(r.status),
    });
  }

  {
    const r = await api('/admin/overview', otherToken);
    results.push({
      name: 'non_admin_403',
      ok: r.status === 403,
      detail: String(r.status),
    });
  }

  {
    const r = await api('/admin/overview', superToken);
    const body = r.json as Record<string, unknown> | null;
    results.push({
      name: 'super_admin_overview_200',
      ok: r.status === 200 && typeof body?.organizations === 'number' && !hasSecretLeak(body),
      detail: `${r.status} orgs=${body?.organizations}`,
    });
  }

  {
    const r = await api('/admin/users?pageSize=5', superToken);
    const body = r.json as { items?: Array<Record<string, unknown>> } | null;
    const item = body?.items?.[0];
    results.push({
      name: 'users_list_no_secrets',
      ok:
        r.status === 200 &&
        Array.isArray(body?.items) &&
        !hasSecretLeak(body) &&
        (!item || !('passwordHash' in item)),
      detail: `status=${r.status} n=${body?.items?.length ?? 0}`,
    });
  }

  {
    const r = await api(`/admin/users/${other.id}/force-logout`, superToken, {
      method: 'POST',
      body: JSON.stringify({ reason: 'rb' }),
    });
    results.push({
      name: 'mutation_requires_reason_min3',
      ok: r.status === 400 || r.status === 422,
      detail: String(r.status),
    });
  }

  {
    const beforeSessions = await prisma.authSession.count({
      where: { userId: other.id, revokedAt: null },
    });
    // Ensure at least one session row for meaningful revoke (optional)
    const r = await api(`/admin/users/${other.id}/force-logout`, superToken, {
      method: 'POST',
      body: JSON.stringify({ reason: 'smoke-test force logout' }),
    });
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PLATFORM_USER_FORCE_LOGOUT', entityId: other.id },
      orderBy: { createdAt: 'desc' },
    });
    const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
    results.push({
      name: 'force_logout_audit',
      ok:
        (r.status === 200 || r.status === 201) &&
        !!audit &&
        typeof meta.reason === 'string' &&
        !!meta.before &&
        !!meta.after,
      detail: `status=${r.status} beforeSessions=${beforeSessions} audit=${!!audit}`,
    });
  }

  {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const guardSrc = readFileSync(
      resolve(__dirname, '../apps/api/src/common/guards/platform-admin.guard.ts'),
      'utf8',
    );
    results.push({
      name: 'guard_no_email_check',
      ok: !/xuanluong778|PLATFORM_SUPER_ADMIN_EMAIL/.test(guardSrc),
      detail: 'platform-admin.guard.ts',
    });
  }

  console.log('\n=== Platform admin RBAC tests ===');
  let failed = 0;
  for (const c of results) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  ${c.detail}` : ''}`);
    if (!c.ok) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
