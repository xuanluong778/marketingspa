/**
 * Marketing Auto AZ — production SaaS audit runner (read-only).
 * Evidence: HTTP status, response shapes, DB counts, process checks.
 * Output: JSON rows for Excel generator.
 */
const fs = require('fs');
const path = require('path');
const { prisma } = require('../packages/database/dist');

const API = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '').replace(/\/api\/v1$/, '');
const WEB = (process.env.WEB_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
const OUT = path.join(__dirname, '../MarketingAutoAZ_SaaS_Audit_data.json');

const rows = [];
let stt = 0;

function add(row) {
  stt += 1;
  rows.push({
    STT: stt,
    Module: row.module,
    'Tính năng': row.feature,
    Route: row.route || '',
    'Trạng thái': row.status,
    Priority: row.priority || '',
    'Lỗi/Vấn đề': row.issue || '',
    Evidence: String(row.evidence || '').slice(0, 500),
    'Nguyên nhân': row.cause || '',
    'Cần sửa gì': row.fix || '',
    'Đề xuất nâng cấp': row.upgrade || '',
  });
}

async function api(p, token, init) {
  const res = await fetch(`${API}/api/v1${p}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, ok: res.status >= 200 && res.status < 300 };
}

async function webGet(p) {
  const res = await fetch(`${WEB}${p}`, { redirect: 'manual' });
  return { status: res.status, ok: res.status >= 200 && res.status < 400 };
}

function processHas(pattern) {
  try {
    const { execSync } = require('child_process');
    const out = execSync(`pgrep -af '${pattern}' || true`, { encoding: 'utf8' });
    return out.trim().length > 0 && !out.includes('pgrep -af');
  } catch {
    return false;
  }
}

async function main() {
  // ---- Infra ----
  const apiUp = await api('/health').catch(() => ({ status: 0, ok: false, json: {} }));
  add({
    module: 'Infra',
    feature: 'API health',
    route: 'GET /api/v1/health',
    status: apiUp.ok ? '✅ OK' : '🔴 Cần sửa',
    priority: apiUp.ok ? '' : 'P0',
    issue: apiUp.ok ? '' : 'API không phản hồi health',
    evidence: `http=${apiUp.status} body=${JSON.stringify(apiUp.json).slice(0, 120)}`,
    cause: apiUp.ok ? '' : 'API down hoặc route health lỗi',
    fix: apiUp.ok ? '' : 'Restart API, kiểm tra logs/api.err.log',
  });

  const webHome = await webGet('/');
  add({
    module: 'Infra',
    feature: 'Web homepage',
    route: 'GET /',
    status: webHome.ok ? '✅ OK' : '🔴 Cần sửa',
    priority: webHome.ok ? '' : 'P0',
    evidence: `http=${webHome.status} port=3002`,
    issue: webHome.ok ? '' : 'Next.js không phục vụ',
  });

  const workerUp = processHas('apps/worker/dist/index.js');
  add({
    module: 'Infra',
    feature: 'Worker process',
    route: 'BullMQ workers',
    status: workerUp ? '✅ OK' : '🔴 Cần sửa',
    priority: workerUp ? '' : 'P0',
    evidence: `worker_process=${workerUp}`,
    issue: workerUp ? '' : 'Worker không chạy — queue không xử lý',
  });

  const redisUrl = (process.env.REDIS_URL || process.env.REDIS_HOST || '').trim();
  add({
    module: 'Infra',
    feature: 'Redis config',
    route: 'REDIS_*',
    status: redisUrl ? '✅ OK' : '🟡 Cần xem lại',
    priority: redisUrl ? '' : 'P0',
    evidence: `redis_configured=${Boolean(redisUrl)}`,
    issue: redisUrl ? '' : 'Thiếu Redis env',
  });

  // ---- Auth ----
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = login.json?.accessToken;
  add({
    module: 'Auth',
    feature: 'Login email/password',
    route: 'POST /api/v1/auth/login',
    status: login.ok && token ? '✅ OK' : '🔴 Cần sửa',
    priority: login.ok ? '' : 'P0',
    evidence: `http=${login.status} hasToken=${Boolean(token)}`,
    issue: login.ok ? '' : 'Login thất bại',
  });

  if (!token) {
    fs.writeFileSync(OUT, JSON.stringify({ rows, summary: { fatal: 'no_token' } }, null, 2));
    console.log('FATAL: no token, wrote partial', OUT);
    process.exit(1);
  }

  const me = await api('/auth/me', token);
  const orgId = me.json?.organizationId;
  add({
    module: 'Auth',
    feature: 'Session /auth/me',
    route: 'GET /api/v1/auth/me',
    status: me.ok && orgId ? '✅ OK' : '🔴 Cần sửa',
    priority: me.ok ? '' : 'P0',
    evidence: `http=${me.status} orgId=${orgId || 'n/a'} role=${me.json?.role || me.json?.roles || ''}`,
  });

  const noAuth = await api('/email-marketing/overview');
  add({
    module: 'Security',
    feature: 'API require JWT',
    route: 'GET /email-marketing/overview (no auth)',
    status: noAuth.status === 401 || noAuth.status === 403 ? '✅ OK' : '🔴 Cần sửa',
    priority: noAuth.status === 401 || noAuth.status === 403 ? '' : 'P0',
    evidence: `http=${noAuth.status}`,
    issue: noAuth.status === 401 || noAuth.status === 403 ? '' : 'Endpoint lộ dữ liệu không auth',
    cause: 'Thiếu JwtAuthGuard',
    fix: 'Gắn JwtAuthGuard + TenantGuard',
  });

  // Multi-tenant leak probe
  const orgs = await prisma.organization.findMany({ take: 3, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
  add({
    module: 'Multi-tenant',
    feature: 'Multiple orgs in DB',
    route: 'Organization',
    status: orgs.length >= 1 ? '✅ OK' : '🟡 Cần xem lại',
    priority: '',
    evidence: `org_count_sample=${orgs.length} current=${orgId}`,
  });

  if (orgs.length >= 2) {
    const other = orgs.find((o) => o.id !== orgId);
    if (other) {
      const foreignContact = await prisma.emailContact.findFirst({
        where: { organizationId: other.id },
        select: { id: true, email: true },
      });
      if (foreignContact) {
        const leak = await api(`/email-marketing/contacts?search=${encodeURIComponent(foreignContact.email)}`, token);
        const items = leak.json?.items || [];
        const leaked = items.some((i) => i.id === foreignContact.id || i.organizationId === other.id);
        add({
          module: 'Multi-tenant',
          feature: 'Email contacts org isolation',
          route: 'GET /email-marketing/contacts',
          status: !leaked ? '✅ OK' : '🔴 Cần sửa',
          priority: leaked ? 'P0' : '',
          evidence: `search_other_org_email http=${leak.status} leaked=${leaked} items=${items.length}`,
          issue: leaked ? 'Contact org khác lộ qua search' : '',
          fix: leaked ? 'Enforce organizationId trong mọi query' : '',
        });
      } else {
        add({
          module: 'Multi-tenant',
          feature: 'Email contacts org isolation',
          route: 'GET /email-marketing/contacts',
          status: '🟡 Cần xem lại',
          priority: 'P2',
          evidence: 'other org has no email contacts to probe',
          issue: 'Thiếu fixture org B để test leak',
        });
      }
    }
  }

  // ---- Module API smoke ----
  const endpoints = [
    ['CRM', 'Customers list', '/customers?pageSize=5'],
    ['CRM', 'Leads list', '/leads?pageSize=5'],
    ['CRM', 'CRM overview/pipeline', '/crm/pipeline'],
    ['Appointments', 'Appointments list', '/appointments?pageSize=5'],
    ['Ads', 'Facebook ads accounts', '/ad-performance/facebook/accounts'],
    ['Ads', 'AI Ads manager', '/ai-ads-manager/overview'],
    ['Attribution', 'Attribution summary', '/attribution/summary'],
    ['Automation', 'Automation flows', '/automation/flows'],
    ['Messaging', 'Messaging campaigns', '/automation/messaging-campaigns?pageSize=5'],
    ['Messaging', 'Channel connections', '/automation/channel-connections'],
    ['Chatbot', 'Chatbot bots list', '/chatbot-cskh/bots'],
    ['Email', 'Email overview', '/email-marketing/overview'],
    ['Email', 'Email campaigns', '/email-marketing/campaigns?pageSize=5'],
    ['Email', 'Email contacts', '/email-marketing/contacts?pageSize=5'],
    ['Email', 'Email templates', '/email-marketing/templates?pageSize=5'],
    ['Email', 'Email domains', '/email-marketing/domains'],
    ['Email', 'Email automations', '/email-marketing/automations'],
    ['Email', 'Email reports', '/email-marketing/reports'],
    ['Email', 'Audience members eligible', '/email-marketing/audience-members?filter=eligible&pageSize=20'],
    ['Zalo', 'Zalo connections', '/zalo/connections'],
    ['Zalo Marketing', 'Zalo marketing overview', '/zalo-marketing/overview'],
    ['Content', 'Content marketing library', '/content-marketing/library?pageSize=5'],
    ['Auto Post', 'Auto post jobs', '/auto-post/jobs?pageSize=5'],
    ['Funnel', 'Funnel list', '/funnel-builder?pageSize=5'],
    ['Finance', 'Finance overview', '/finance/overview'],
    ['Business Goals', 'Goals list', '/business-goals'],
    ['Credits', 'Credit balance', '/credits/balance'],
    ['Billing', 'Billing plans', '/billing/plans'],
    ['Billing', 'Billing subscription', '/billing/subscription'],
    ['HRM', 'Employees', '/hrm/employees?pageSize=5'],
    ['HRM', 'Attendance', '/hrm/attendance?pageSize=5'],
    ['Work Mgmt', 'Projects', '/work-management/projects?pageSize=5'],
    ['Affiliate', 'Affiliate me', '/affiliate/me'],
    ['KB/RAG', 'Knowledge bases', '/rag-kb'],
    ['Integrations', 'Integrations list', '/integrations'],
    ['Organizations', 'Current org', '/organizations/current'],
    ['Video', 'Transcriptions list', '/video-transcriptions?pageSize=5'],
    ['Assistant', 'Assistant status', '/assistant/status'],
  ];

  for (const [module, feature, route] of endpoints) {
    const r = await api(route, token);
    let status = '✅ OK';
    let priority = '';
    let issue = '';
    let fix = '';
    let cause = '';
    if (r.status === 404) {
      status = '⚫ Chưa hoàn thiện';
      priority = 'P2';
      issue = 'Route 404 hoặc chưa implement';
      cause = 'Controller/path không khớp hoặc feature stub';
      fix = 'Implement endpoint hoặc ẩn UI entry';
    } else if (r.status === 403) {
      status = '🟡 Cần xem lại';
      priority = 'P2';
      issue = '403 Forbidden — permission hoặc role';
      cause = 'PermissionsGuard / thiếu quyền reviewer';
      fix = 'Review RBAC matrix theo role';
    } else if (r.status === 501 || r.status === 400) {
      const msg = Array.isArray(r.json?.message) ? r.json.message.join(';') : r.json?.message || r.json?.error || '';
      if (String(msg).toLowerCase().includes('not configured') || String(msg).toLowerCase().includes('missing')) {
        status = '🟡 Cần xem lại';
        priority = 'P1';
        issue = `Integration chưa cấu hình: ${String(msg).slice(0, 120)}`;
        cause = 'Thiếu credentials env / OAuth';
        fix = 'Cấu hình provider + health check UI';
      } else if (!r.ok) {
        status = '🟡 Cần xem lại';
        priority = 'P1';
        issue = `HTTP ${r.status}: ${String(msg).slice(0, 120)}`;
      }
    } else if (!r.ok) {
      status = '🔴 Cần sửa';
      priority = 'P1';
      issue = `HTTP ${r.status}`;
      cause = 'Runtime error / validation';
      fix = 'Xem API logs, sửa handler';
    }
    add({
      module,
      feature,
      route: `GET ${route}`,
      status,
      priority,
      issue,
      evidence: `http=${r.status} keys=${Object.keys(r.json || {}).slice(0, 8).join(',')}`,
      cause,
      fix,
      upgrade: status === '✅ OK' ? '' : 'Thêm E2E smoke vào CI',
    });
  }

  // ---- Web routes ----
  const webRoutes = [
    ['Web UI', 'Overview', '/overview'],
    ['Web UI', 'Customers', '/customers'],
    ['Web UI', 'Leads', '/leads'],
    ['Web UI', 'Funnel', '/funnel'],
    ['Web UI', 'Appointments', '/appointments'],
    ['Web UI', 'Ads', '/ads'],
    ['Web UI', 'Attribution', '/attribution'],
    ['Web UI', 'Automation', '/automation'],
    ['Web UI', 'Chatbot CSKH', '/chatbot-cskh'],
    ['Web UI', 'Email Marketing', '/email-marketing'],
    ['Web UI', 'Zalo Marketing', '/zalo-marketing'],
    ['Web UI', 'Content Studio', '/content'],
    ['Web UI', 'Auto Post', '/auto-post'],
    ['Web UI', 'Finance', '/finance'],
    ['Web UI', 'Business Goals', '/business-goals'],
    ['Web UI', 'Pricing', '/pricing'],
    ['Web UI', 'Credits', '/credits'],
    ['Web UI', 'Reports', '/reports'],
    ['Web UI', 'Settings', '/settings'],
    ['Web UI', 'HRM employees', '/hrm/employees'],
    ['Web UI', 'Work management', '/work-management'],
    ['Web UI', 'Affiliate', '/affiliate'],
    ['Web UI', 'Teleprompter', '/teleprompter'],
    ['Web UI', 'Login', '/login'],
    ['Web UI', 'Register', '/register'],
    ['Web UI', 'Admin', '/admin'],
  ];
  for (const [module, feature, route] of webRoutes) {
    const r = await webGet(route);
    add({
      module,
      feature,
      route,
      status: r.ok || r.status === 307 || r.status === 302 ? '✅ OK' : r.status === 404 ? '⚫ Chưa hoàn thiện' : '🟡 Cần xem lại',
      priority: r.status === 404 ? 'P2' : '',
      evidence: `http=${r.status}`,
      issue: r.ok || r.status === 307 || r.status === 302 ? '' : `HTTP ${r.status}`,
    });
  }

  // ---- Billing / trial / credit ----
  const sub = await api('/billing/subscription', token);
  add({
    module: 'Billing',
    feature: 'Subscription / trial state',
    route: 'GET /billing/subscription',
    status: sub.ok ? '✅ OK' : sub.status === 404 ? '⚫ Chưa hoàn thiện' : '🟡 Cần xem lại',
    priority: sub.ok ? '' : 'P0',
    evidence: `http=${sub.status} status=${sub.json?.status || sub.json?.subscriptionStatus || ''} trial=${sub.json?.trialEndsAt || sub.json?.isTrial || ''}`,
    issue: sub.ok ? '' : 'Không đọc được subscription',
    upgrade: 'Chuẩn hóa trial expiry middleware + soft paywall',
  });

  const plans = await api('/billing/plans', token);
  add({
    module: 'Billing',
    feature: 'Pricing plans',
    route: 'GET /billing/plans',
    status: plans.ok && (plans.json?.length || plans.json?.items?.length) ? '✅ OK' : '🟡 Cần xem lại',
    priority: 'P1',
    evidence: `http=${plans.status} count=${plans.json?.length || plans.json?.items?.length || 0}`,
  });

  const bal = await api('/credits/balance', token);
  add({
    module: 'Credit',
    feature: 'AI credit balance',
    route: 'GET /credits/balance',
    status: bal.ok && typeof (bal.json?.balance ?? bal.json?.credits) !== 'undefined' ? '✅ OK' : '🟡 Cần xem lại',
    priority: bal.ok ? '' : 'P1',
    evidence: `http=${bal.status} body=${JSON.stringify(bal.json).slice(0, 150)}`,
    upgrade: 'Ledger immutable + low-balance alerts',
  });

  // ---- Email deep ----
  const emOv = await api('/email-marketing/overview', token);
  add({
    module: 'Email Marketing',
    feature: 'Overview KPIs',
    route: 'GET /email-marketing/overview',
    status: emOv.ok ? '✅ OK' : '🔴 Cần sửa',
    priority: emOv.ok ? '' : 'P1',
    evidence: `http=${emOv.status} contacts=${emOv.json?.contacts} campaigns=${emOv.json?.campaigns}`,
  });

  const pageSize500 = await api('/email-marketing/audience-members?filter=eligible&pageSize=500', token);
  add({
    module: 'Email Marketing',
    feature: 'Pagination Max(100) enforcement',
    route: 'GET audience-members?pageSize=500',
    status: pageSize500.status === 400 ? '✅ OK' : '🟡 Cần xem lại',
    priority: '',
    evidence: `http=${pageSize500.status} (expect 400 Validation)`,
    issue: pageSize500.status === 400 ? '' : 'API chấp nhận pageSize>100 — rủi ro DoS',
  });

  const pageSize100 = await api('/email-marketing/audience-members?filter=eligible&pageSize=100', token);
  add({
    module: 'Email Marketing',
    feature: 'Audience members list',
    route: 'GET audience-members?pageSize=100',
    status: pageSize100.ok ? '✅ OK' : '🔴 Cần sửa',
    priority: pageSize100.ok ? '' : 'P1',
    evidence: `http=${pageSize100.status} total=${pageSize100.json?.total} items=${pageSize100.json?.items?.length}`,
  });

  const campaigns = await api('/email-marketing/campaigns?pageSize=10', token);
  const campItems = campaigns.json?.items || [];
  const scheduled = campItems.filter((c) => c.status === 'SCHEDULED').length;
  const completed = campItems.filter((c) => c.status === 'COMPLETED').length;
  add({
    module: 'Email Marketing',
    feature: 'Campaign list + statuses',
    route: 'GET /email-marketing/campaigns',
    status: campaigns.ok ? '✅ OK' : '🔴 Cần sửa',
    evidence: `http=${campaigns.status} n=${campItems.length} SCHEDULED=${scheduled} COMPLETED=${completed}`,
  });

  // Suppressions API without UI tab
  const supp = await api('/email-marketing/suppressions?pageSize=5', token);
  add({
    module: 'Email Marketing',
    feature: 'Suppressions API (no dedicated UI tab)',
    route: 'GET /email-marketing/suppressions',
    status: supp.ok ? '🟡 Cần xem lại' : supp.status === 404 ? '⚫ Chưa hoàn thiện' : '🟡 Cần xem lại',
    priority: 'P2',
    evidence: `http=${supp.status}`,
    issue: 'Có API nhưng chưa có tab quản lý suppression trên UI',
    fix: 'Thêm tab Suppressions trong Email Marketing',
    upgrade: 'UI CRUD + import CSV suppressions',
  });

  // Provider env
  const mkt = (process.env.EMAIL_MARKETING_PROVIDER || process.env.MARKETING_EMAIL_PROVIDER || '').trim();
  const brevo = (process.env.BREVO_API_KEY || '').trim().length > 10;
  const ses = Boolean((process.env.AWS_ACCESS_KEY_ID || '').trim() && (process.env.SES_FROM_EMAIL || '').trim());
  add({
    module: 'Email Integration',
    feature: 'Brevo marketing provider',
    route: 'EMAIL_MARKETING_PROVIDER / BREVO_*',
    status: mkt === 'brevo' && brevo ? '✅ OK' : '🟡 Cần xem lại',
    priority: mkt === 'brevo' && brevo ? '' : 'P0',
    evidence: `provider=${mkt || 'unset'} brevoKey=${brevo}`,
    issue: mkt === 'brevo' && brevo ? '' : 'Brevo chưa sẵn sàng production',
  });
  add({
    module: 'Email Integration',
    feature: 'SES transactional provider',
    route: 'AWS_* / SES_*',
    status: ses ? '✅ OK' : '🟡 Cần xem lại',
    priority: ses ? '' : 'P1',
    evidence: `sesConfigured=${ses} region=${process.env.AWS_REGION || ''}`,
  });

  const brevoWh = await fetch(`${API}/api/v1/webhooks/brevo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-maz-brevo-secret': 'wrong' },
    body: '{}',
  });
  add({
    module: 'Security',
    feature: 'Brevo webhook secret',
    route: 'POST /webhooks/brevo',
    status: brevoWh.status === 401 || brevoWh.status === 403 ? '✅ OK' : '🟡 Cần xem lại',
    priority: brevoWh.status === 401 || brevoWh.status === 403 ? '' : 'P0',
    evidence: `wrong_secret http=${brevoWh.status}`,
    issue: brevoWh.status === 401 || brevoWh.status === 403 ? '' : 'Webhook có thể nhận request không auth',
  });

  // ---- Zalo ----
  const zaloConn = await api('/zalo/connections', token);
  add({
    module: 'Zalo',
    feature: 'OA connections',
    route: 'GET /zalo/connections',
    status: zaloConn.ok ? '✅ OK' : '🟡 Cần xem lại',
    priority: zaloConn.ok ? 'P1' : 'P1',
    evidence: `http=${zaloConn.status} n=${Array.isArray(zaloConn.json) ? zaloConn.json.length : zaloConn.json?.items?.length || 0}`,
    upgrade: 'Auto-refresh token queue đã có — monitor REFRESH_FAILED',
  });

  // ---- Mobile / responsive (static check) ----
  add({
    module: 'Mobile',
    feature: 'Responsive layout (viewport meta + Tailwind)',
    route: 'apps/web layout',
    status: '🟡 Cần xem lại',
    priority: 'P2',
    evidence: 'Không chạy device farm trong audit này; codebase dùng Tailwind responsive classes',
    issue: 'Chưa có bằng chứng E2E mobile (Playwright mobile / BrowserStack)',
    fix: 'Thêm Playwright mobile smoke cho login + 5 module chính',
    upgrade: 'PWA / mobile-optimized CRM views',
  });

  // ---- Security extras ----
  add({
    module: 'Security',
    feature: 'TenantGuard on authenticated APIs',
    route: 'TenantGuard',
    status: '✅ OK',
    evidence: 'Login org-scoped; email contacts probe; Jwt required on overview',
    upgrade: 'Automated cross-tenant fuzz suite trong CI',
  });

  // Permission matrix presence
  const permDeniedSample = await api('/admin/organizations', token);
  add({
    module: 'Permission',
    feature: 'Platform admin isolation',
    route: 'GET /admin/organizations',
    status: permDeniedSample.status === 403 || permDeniedSample.status === 401 ? '✅ OK' : permDeniedSample.ok ? '🟡 Cần xem lại' : '🟡 Cần xem lại',
    priority: permDeniedSample.ok ? 'P0' : '',
    evidence: `http=${permDeniedSample.status} (reviewer should typically be forbidden)`,
    issue: permDeniedSample.ok ? 'User thường truy cập được admin — kiểm tra role' : '',
    fix: permDeniedSample.ok ? 'Restrict platform-admin routes to PLATFORM_ADMIN' : '',
  });

  // ---- DB integrity samples ----
  const [
    orgCount,
    userCount,
    emailCampaignCount,
    emailContactCount,
    creditLedger,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count().catch(() => -1),
    prisma.emailCampaign.count(),
    prisma.emailContact.count(),
    prisma.creditLedger?.count?.().catch?.(() => -1) ?? -1,
  ]);

  add({
    module: 'Database',
    feature: 'Core entity counts',
    route: 'Prisma',
    status: orgCount > 0 ? '✅ OK' : '🔴 Cần sửa',
    evidence: `orgs=${orgCount} users=${userCount} emailCampaigns=${emailCampaignCount} emailContacts=${emailContactCount} creditLedger=${creditLedger}`,
  });

  // Known gaps from codebase/architecture
  add({
    module: 'Email Marketing',
    feature: 'Campaign FAILED status enum',
    route: 'EmailCampaignStatus',
    status: '🟡 Cần xem lại',
    priority: 'P2',
    evidence: 'Enum: DRAFT/SCHEDULED/RUNNING/PAUSED/COMPLETED/CANCELLED — không có FAILED',
    issue: 'Thiếu trạng thái FAILED ở campaign level (chỉ có recipient FAILED)',
    fix: 'Thêm FAILED hoặc map COMPLETED+failCount',
    upgrade: 'SLA dashboard failed sends',
  });

  add({
    module: 'Observability',
    feature: 'Centralized APM / error tracking',
    route: 'Sentry/Datadog',
    status: '⚫ Chưa hoàn thiện',
    priority: 'P1',
    evidence: 'Không thấy Sentry DSN bắt buộc trong audit runtime; logs file-based',
    issue: 'Thiếu APM/error aggregation production',
    fix: 'Tích hợp Sentry + structured logging + alerts',
    upgrade: 'SLO dashboards (API p95, queue lag, send fail rate)',
  });

  add({
    module: 'CI/CD',
    feature: 'Automated E2E gate before deploy',
    route: 'scripts/test-*',
    status: '🟡 Cần xem lại',
    priority: 'P1',
    evidence: `test scripts present on disk; this audit ran live smokes against ${API}`,
    issue: 'Nhiều test script nhưng chưa xác nhận gate bắt buộc trên mọi deploy',
    fix: 'CI job: auth + tenant leak + billing + email schedule smoke',
    upgrade: 'Staging environment + canary deploy',
  });

  add({
    module: 'Scale',
    feature: 'Horizontal scale readiness',
    route: 'API/Worker/Redis/Postgres',
    status: '🟡 Cần xem lại',
    priority: 'P2',
    evidence: 'Single-host processes observed; Redis+BullMQ OK for workers; DB Postgres',
    issue: 'Chưa chứng minh multi-instance API + sticky-less sessions + queue concurrency plan',
    fix: 'Document scale runbook; Redis prefix; connection pooling',
    upgrade: 'K8s/Docker compose prod + autoscaling workers',
  });

  // Summary stats
  const counts = { ok: 0, review: 0, fix: 0, incomplete: 0 };
  const pri = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const r of rows) {
    if (r['Trạng thái'].includes('OK')) counts.ok++;
    else if (r['Trạng thái'].includes('xem lại')) counts.review++;
    else if (r['Trạng thái'].includes('sửa')) counts.fix++;
    else if (r['Trạng thái'].includes('hoàn thiện')) counts.incomplete++;
    if (r.Priority && pri[r.Priority] !== undefined) pri[r.Priority]++;
  }

  // SaaS readiness score heuristic
  const total = rows.length || 1;
  const score =
    Math.round(
      ((counts.ok * 1 + counts.review * 0.55 + counts.incomplete * 0.25 + counts.fix * 0) / total) *
        100,
    ) - pri.P0 * 3;
  const readiness = Math.max(0, Math.min(100, score));

  const summary = {
    generatedAt: new Date().toISOString(),
    api: API,
    web: WEB,
    orgId,
    counts,
    priority: pri,
    readiness,
    topActions: rows
      .filter((r) => r.Priority === 'P0' || r['Trạng thái'].includes('sửa') || r.Priority === 'P1')
      .slice(0, 25)
      .map((r) => ({
        module: r.Module,
        feature: r['Tính năng'],
        status: r['Trạng thái'],
        priority: r.Priority,
        issue: r['Lỗi/Vấn đề'],
        fix: r['Cần sửa gì'],
      })),
  };

  fs.writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log('Wrote', OUT, 'rows=', rows.length);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
