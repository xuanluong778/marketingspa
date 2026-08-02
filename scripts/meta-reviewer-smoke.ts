/**
 * Smoke test tài khoản Meta App Reviewer (USER/OWNER — không admin).
 *
 * Env: META_REVIEWER_EMAIL, META_REVIEWER_PASSWORD
 * Optional: API_URL (default http://127.0.0.1:4000)
 *
 *   pnpm meta-reviewer:smoke
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);

type Case = { name: string; ok: boolean; detail?: string };

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

async function main() {
  const email = (process.env.META_REVIEWER_EMAIL ?? '').trim().toLowerCase();
  const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    console.error('Cần META_REVIEWER_EMAIL và META_REVIEWER_PASSWORD');
    process.exit(1);
  }

  const results: Case[] = [];

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token =
    (login.json as { accessToken?: string; access_token?: string }).accessToken ||
    (login.json as { accessToken?: string; access_token?: string }).access_token ||
    (login.json as { tokens?: { accessToken?: string } }).tokens?.accessToken;
  const loginUser = (login.json as { user?: { role?: string; organizationId?: string; id?: string } })
    .user;
  results.push({
    name: 'login_ok',
    ok: (login.status === 200 || login.status === 201) && Boolean(token),
    detail: `status=${login.status} hasToken=${Boolean(token)}`,
  });
  if (!token || !loginUser) {
    console.error('Login failed', login.status, JSON.stringify(login.json).slice(0, 300));
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
    process.exit(1);
  }

  const role = loginUser.role || '';
  results.push({
    name: 'role_is_customer_owner_not_admin',
    ok: role === 'OWNER' && role !== 'SUPER_ADMIN',
    detail: `role=${role}`,
  });

  const me = await api('/auth/me', token);
  const meRole =
    (me.json as { role?: string }).role ||
    (me.json as { user?: { role?: string } }).user?.role ||
    '';
  results.push({
    name: 'me_role_owner',
    ok: me.status === 200 && (meRole === 'OWNER' || role === 'OWNER'),
    detail: `status=${me.status} role=${meRole || role}`,
  });

  const adminUsers = await api('/admin/users', token);
  results.push({
    name: 'admin_api_forbidden',
    ok: adminUsers.status === 401 || adminUsers.status === 403,
    detail: `status=${adminUsers.status}`,
  });

  const content = await api('/content-marketing/industries', token);
  results.push({
    name: 'content_studio_allowed',
    ok: content.status === 200,
    detail: `status=${content.status}`,
  });

  const autoPost = await api('/auto-post/status', token);
  results.push({
    name: 'auto_post_status_allowed',
    ok: autoPost.status === 200,
    detail: `status=${autoPost.status}`,
  });

  const oauthStart = await api('/auto-post/facebook/oauth/start', token);
  const oauthJson = oauthStart.json as { url?: string; mode?: string; message?: string; code?: string };
  const oauthOk =
    oauthStart.status === 200 &&
    typeof oauthJson.url === 'string' &&
    /facebook\.com|fb\.com|meta\.com/i.test(oauthJson.url);
  results.push({
    name: 'facebook_oauth_start',
    ok: oauthOk,
    detail: `status=${oauthStart.status} mode=${oauthJson.mode ?? ''} msg=${(oauthJson.message || '').slice(0, 120)}`,
  });

  // Tenant isolation: không đọc được user/org khác qua admin; thử billing chỉ thấy org mình
  const billing = await api('/billing/subscription', token);
  const billOrg =
    (billing.json as { organizationId?: string }).organizationId ||
    loginUser.organizationId;
  results.push({
    name: 'billing_own_org',
    ok: billing.status === 200 && billOrg === loginUser.organizationId,
    detail: `status=${billing.status}`,
  });

  // Privilege: DB assert role + subscription
  const dbUser = await prisma.user.findUnique({
    where: { id: loginUser.id! },
    include: {
      role: true,
      organization: {
        include: {
          subscriptions: { orderBy: { currentPeriodEnd: 'desc' }, take: 1, include: { plan: true } },
        },
      },
    },
  });
  const sub = dbUser?.organization.subscriptions[0];
  const daysLeft = sub
    ? Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86400000)
    : 0;
  results.push({
    name: 'db_role_owner_active_verified',
    ok: Boolean(
      dbUser &&
        dbUser.role.code === 'OWNER' &&
        dbUser.isActive &&
        dbUser.emailVerifiedAt &&
        !dbUser.deletedAt,
    ),
    detail: `role=${dbUser?.role.code} active=${dbUser?.isActive}`,
  });
  results.push({
    name: 'db_subscription_active_90d',
    ok: Boolean(sub && sub.status === 'ACTIVE' && daysLeft >= 90),
    detail: `status=${sub?.status} days=${daysLeft} plan=${sub?.plan.code}`,
  });

  // Không có privilege escalation: không tồn tại SUPER_ADMIN trên user này
  results.push({
    name: 'no_super_admin_escalation',
    ok: dbUser?.role.code !== 'SUPER_ADMIN',
    detail: `role=${dbUser?.role.code}`,
  });

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) failed++;
  }
  console.log(failed === 0 ? 'ALL_PASS' : `FAILED_${failed}`);
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
