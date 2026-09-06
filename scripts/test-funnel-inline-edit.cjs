/**
 * Funnel inline edit gates.
 * Run: node scripts/with-root-env.cjs node scripts/test-funnel-inline-edit.cjs
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../packages/database/dist');
const {
  applyFunnelInlineContentPatch,
  buildFallbackFunnelComplete,
  sanitizeFunnelInlineContentPatch,
  sanitizeFunnelInlineText,
  parseFunnelCompleteSpec,
} = require('../packages/shared/dist');

const root = path.join(__dirname, '..');
const API = (process.env.API_URL || process.env.APP_URL || 'https://marketingautoaz.com').replace(
  /\/$/,
  '',
);
const JWT_SECRET = process.env.JWT_SECRET;
const TAG = `FUNNEL_INLINE_${Date.now()}`;

const verdict = {
  INLINE_EDIT: 'FAIL',
  SAVE_PERSIST: 'FAIL',
  LIVE_PREVIEW: 'FAIL',
  PERMISSION: 'FAIL',
  XSS_SAFE: 'FAIL',
  LIVE_FUNNEL_SAFE: 'FAIL',
  MOBILE: 'FAIL',
  FUNNEL_INLINE_E2E: 'FAIL',
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mint(orgId, userId, email, role) {
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
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function api(path, token, init = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function ensureActiveSubscription(orgId) {
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

async function ensureAdsUser(orgId, suffix) {
  const perms = await prisma.permission.findMany({
    where: { code: { in: ['lead.read', 'lead.write'] } },
  });
  const role = await prisma.role.create({
    data: {
      organizationId: orgId,
      code: `LEAD_${suffix}`,
      name: 'Lead Test',
      isSystem: true,
      permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${suffix}@test.local`,
      name: 'Funnel Inline',
      passwordHash: 'x',
      organizationId: orgId,
      roleId: role.id,
      isActive: true,
    },
  });
  return { user, role };
}

async function main() {
  console.log(`=== ${TAG} funnel inline edit ===`);

  const inlineEditable = read('apps/web/src/components/funnel/funnel-inline-editable.tsx');
  const publicView = read('apps/web/src/components/funnel/funnel-public-form-view.tsx');
  const inlineSvc = read('apps/api/src/funnel-builder/funnel-inline-edit.service.ts');

  if (
    inlineEditable.includes('FunnelInlineEditable') &&
    inlineEditable.includes('Sửa') &&
    inlineEditable.includes('Lưu') &&
    publicView.includes('Chế độ chỉnh sửa trực tiếp') &&
    publicView.includes('Cập nhật phiên bản đang chạy') &&
    inlineSvc.includes('saveInlineContent') &&
    read('apps/web/src/app/f/[id]/page.tsx').includes('canEdit: false') &&
    read('apps/web/src/app/(app)/funnel/preview/[id]/page.tsx').includes('fetchFunnelPreviewForm')
  ) {
    verdict.INLINE_EDIT = 'PASS';
    console.log('PASS INLINE_EDIT');
  } else {
    console.log('FAIL INLINE_EDIT');
  }

  if (publicView.includes('sm:') && publicView.includes('max-w-lg') && publicView.includes('px-4')) {
    verdict.MOBILE = 'PASS';
    console.log('PASS MOBILE');
  } else {
    console.log('FAIL MOBILE');
  }

  const xssIn = '<script>alert(1)</script>Hello<b>world</b>';
  const xssOut = sanitizeFunnelInlineText(xssIn, 200);
  const patchSan = sanitizeFunnelInlineContentPatch({
    name: xssIn,
    leadForm: { title: '<img onerror=alert(1) src=x> Title' },
  });
  if (!xssOut.includes('<script') && !xssOut.includes('<b>') && !patchSan.name.includes('<')) {
    verdict.XSS_SAFE = 'PASS';
    console.log('PASS XSS_SAFE');
  } else {
    console.log('FAIL XSS_SAFE', { xssOut, patchSan });
  }

  const org = await prisma.organization.create({
    data: { name: `${TAG} org`, slug: `${TAG.toLowerCase()}-org` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` },
  });
  await ensureActiveSubscription(org.id);
  const { user, role } = await ensureAdsUser(org.id, 'a');
  const token = mint(org.id, user.id, user.email, role.code);
  await ensureActiveSubscription(orgB.id);
  const { user: userB, role: roleB } = await ensureAdsUser(orgB.id, 'b');
  const tokenB = mint(orgB.id, userB.id, userB.email, roleB.code);

  let baseSpec = buildFallbackFunnelComplete({ templateSlug: 'voucher' });
  baseSpec = parseFunnelCompleteSpec({
    ...baseSpec,
    name: 'Phễu test inline',
    offer: 'Offer gốc',
  });

  const rec = await prisma.funnelRecommendation.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      prompt: 'inline test',
      result: { schemaVersion: 'funnel-generator.v1', recommendations: [] },
      source: 'fallback',
      completeSpec: baseSpec,
      status: 'DRAFT',
    },
  });

  const preview = await api(`/funnel-builder/recommendations/${rec.id}/preview-form`, token);
  if (preview.status === 200 && preview.json?.canEdit && preview.json?.name) {
    verdict.LIVE_PREVIEW = 'PASS';
    console.log('PASS LIVE_PREVIEW');
  } else {
    console.log('FAIL LIVE_PREVIEW', preview.status, preview.json);
  }

  const noAuth = await api(`/funnel-builder/recommendations/${rec.id}/inline-content`, null, {
    method: 'PATCH',
    body: JSON.stringify({ patch: { name: 'Hack' } }),
  });
  const crossOrg = await api(`/funnel-builder/recommendations/${rec.id}/inline-content`, tokenB, {
    method: 'PATCH',
    body: JSON.stringify({ patch: { name: 'Hack' } }),
  });
  if (noAuth.status === 401 && (crossOrg.status === 403 || crossOrg.status === 404)) {
    verdict.PERMISSION = 'PASS';
    console.log('PASS PERMISSION');
  } else {
    console.log('FAIL PERMISSION', noAuth.status, crossOrg.status);
  }

  const patched = await api(`/funnel-builder/recommendations/${rec.id}/inline-content`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      patch: {
        name: 'Tên mới inline',
        offer: 'Subtitle mới',
        leadForm: {
          title: 'Form title mới',
          submitLabel: 'Gửi thông tin mới',
          privacyNote: 'Privacy mới',
          fields: [{ key: baseSpec.leadForm.fields[0].key, label: 'Label mới', placeholder: 'PL mới' }],
        },
        appearance: { primaryColor: '#112233', ctaBackgroundColor: '#445566' },
      },
    }),
  });

  const rowAfter = await prisma.funnelRecommendation.findUnique({ where: { id: rec.id } });
  const specAfter = parseFunnelCompleteSpec(rowAfter.completeSpec);

  if (
    patched.status === 200 &&
    specAfter.name === 'Tên mới inline' &&
    specAfter.leadForm.fields[0].label === 'Label mới' &&
    specAfter.appearance?.ctaBackgroundColor === '#445566'
  ) {
    verdict.SAVE_PERSIST = 'PASS';
    console.log('PASS SAVE_PERSIST');
  } else {
    console.log('FAIL SAVE_PERSIST', patched.status, patched.json);
  }

  const publishedSpec = parseFunnelCompleteSpec(specAfter);
  await prisma.funnelRecommendation.update({
    where: { id: rec.id },
    data: {
      status: 'ACTIVE',
      publishedSpec: publishedSpec,
      publishedVersion: 1,
      publishedAt: new Date(),
    },
  });

  await api(`/funnel-builder/recommendations/${rec.id}/inline-content`, token, {
    method: 'PATCH',
    body: JSON.stringify({ patch: { name: 'Draft khác live' } }),
  });

  const liveRow = await prisma.funnelRecommendation.findUnique({ where: { id: rec.id } });
  const livePublished = parseFunnelCompleteSpec(liveRow.publishedSpec);
  const liveDraft = parseFunnelCompleteSpec(liveRow.completeSpec);

  if (livePublished.name === 'Tên mới inline' && liveDraft.name === 'Draft khác live') {
    verdict.LIVE_FUNNEL_SAFE = 'PASS';
    console.log('PASS LIVE_FUNNEL_SAFE');
  } else {
    console.log('FAIL LIVE_FUNNEL_SAFE', livePublished.name, liveDraft.name);
  }

  await prisma.funnelRecommendation.delete({ where: { id: rec.id } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { organizationId: { in: [org.id, orgB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [user.id, userB.id] } } });
  await prisma.role.deleteMany({ where: { id: { in: [role.id, roleB.id] } } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.organization.delete({ where: { id: orgB.id } });

  const gates = ['INLINE_EDIT', 'SAVE_PERSIST', 'LIVE_PREVIEW', 'PERMISSION', 'XSS_SAFE', 'LIVE_FUNNEL_SAFE', 'MOBILE'];
  verdict.FUNNEL_INLINE_E2E = gates.every((g) => verdict[g] === 'PASS') ? 'PASS' : 'FAIL';

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);
  if (verdict.FUNNEL_INLINE_E2E !== 'PASS') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
