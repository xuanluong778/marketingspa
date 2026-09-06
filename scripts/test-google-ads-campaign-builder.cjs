/**
 * Google Ads AI Campaign Builder gates.
 * Run: pnpm test:google-ads-campaign-builder
 *
 * AI_CAMPAIGN_DRAFT | BUDGET_VALIDATION | USER_APPROVAL
 * WRITE_PREFLIGHT | WRITE_IDEMPOTENCY | CAMPAIGN_DEPLOYMENT
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  prisma,
  AdConnectionProvider,
  AdConnectionStatus,
} = require('../packages/database/dist');
const {
  executeGoogleAdsCampaignPlan,
  createDryRunMutatePort,
  buildTemplateStructuredDraft,
  resolveDailyBudget,
} = require('../packages/shared/dist/google-ads-campaign-builder');

const root = path.join(__dirname, '..');
const API = (process.env.API_URL || process.env.APP_URL || 'https://marketingautoaz.com').replace(
  /\/$/,
  '',
);
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const TAG = `GADS_CB_${Date.now()}`;

const verdict = {
  AI_CAMPAIGN_DRAFT: 'FAIL',
  BUDGET_VALIDATION: 'FAIL',
  USER_APPROVAL: 'FAIL',
  WRITE_PREFLIGHT: 'FAIL',
  WRITE_IDEMPOTENCY: 'FAIL',
  CAMPAIGN_DEPLOYMENT: 'FAIL',
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

async function api(pathname, token, init = {}) {
  const res = await fetch(`${API}/api/v1${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

function encryptSecret(plain, key) {
  const derived = crypto.scryptSync(key, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
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

async function ensureAdsUser(orgId) {
  let perms = await prisma.permission.findMany({
    where: { code: { in: ['ads.read', 'ads.connect', 'ads.sync', 'ads.manage', 'ads.analyze'] } },
  });
  if (perms.length < 4) {
    perms = await prisma.permission.findMany({ where: { code: { contains: 'ads.' } }, take: 8 });
  }
  const role = await prisma.role.create({
    data: {
      organizationId: orgId,
      code: `ADS_CB_${TAG}`,
      name: 'Ads Campaign Builder',
      isSystem: true,
      permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `${TAG}@test.local`,
      name: 'Campaign Builder',
      passwordHash: 'x',
      organizationId: orgId,
      roleId: role.id,
      isActive: true,
    },
  });
  return { user, role };
}

async function main() {
  console.log(`=== ${TAG} Google Ads AI Campaign Builder ===`);

  const builderSvc = read('apps/api/src/ai-ads-manager/google-ads-campaign-builder.service.ts');
  const llmLeaksMutate =
    builderSvc.includes(':mutate') || builderSvc.includes('createLiveGoogleAdsMutatePort');
  if (llmLeaksMutate) throw new Error('LLM/draft service must not call Google Ads mutate');
  if (!builderSvc.includes('generateStructuredDraft') || !builderSvc.includes('approve')) {
    throw new Error('Missing draft/approve in campaign builder service');
  }
  const workerMutate = read('apps/worker/src/lib/google-ads-api.ts');
  const mutateOk =
    workerMutate.includes('${collection}:mutate') &&
    workerMutate.includes('createLiveGoogleAdsMutatePort') &&
    ['campaignBudgets', 'campaigns', 'adGroups', 'adGroupCriteria', 'adGroupAds', 'campaignCriteria'].every(
      (c) => workerMutate.includes(`'${c}'`) || workerMutate.includes(`"${c}"`),
    );
  if (!mutateOk) {
    throw new Error('Worker missing mutate sequence');
  }
  const ui = read('apps/web/src/components/ai-ads-manager/google-ads-campaign-builder.tsx');
  if (!ui.includes('Xác nhận chạy quảng cáo') || !ui.includes('Ước tính tháng')) {
    throw new Error('UI missing approval / monthly estimate');
  }

  const org = await prisma.organization.create({
    data: { name: `${TAG} org`, slug: `${TAG.toLowerCase()}-org` },
  });
  await ensureActiveSubscription(org.id);
  const { user, role } = await ensureAdsUser(org.id);
  const token = mint(org.id, user.id, user.email, role.code);

  const enc = encryptSecret(JSON.stringify({ refreshToken: 'rt-campaign-builder-test' }), ENCRYPTION_KEY);
  const conn = await prisma.adConnection.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      provider: AdConnectionProvider.GOOGLE,
      status: AdConnectionStatus.CONNECTED,
      encryptedCredentials: enc,
      scopes: ['https://www.googleapis.com/auth/adwords'],
      externalAccountId: '5555555555',
      externalAccountName: 'Builder Test',
    },
  });
  await prisma.adGoogleAdsAccount.create({
    data: {
      organizationId: org.id,
      connectionId: conn.id,
      customerId: '5555555555',
      name: 'Builder Test',
      currency: 'VND',
      isSelected: true,
      accessType: 'direct',
    },
  });

  const brief = {
    product: 'Chăm sóc da mặt',
    landingPage: 'https://example.com/dat-lich',
    objective: 'Thu lead đặt lịch',
    location: 'Hồ Chí Minh',
    audience: 'Nữ 25-40 tuổi quan tâm spa',
    dailyBudget: 150000,
  };

  const badBudget = await api('/ai-ads-manager/google/campaign-builder/drafts', token, {
    method: 'POST',
    body: JSON.stringify({
      customerId: '5555555555',
      brief: { ...brief, dailyBudget: 0, landingPage: 'https://example.com' },
    }),
  });
  const badUrl = await api('/ai-ads-manager/google/campaign-builder/drafts', token, {
    method: 'POST',
    body: JSON.stringify({
      customerId: '5555555555',
      brief: { ...brief, landingPage: 'http://localhost/x' },
    }),
  });
  if (badBudget.status === 404 || badUrl.status === 404) {
    throw new Error('Campaign builder route missing (404)');
  }
  if (badBudget.status < 400 || badUrl.status < 400) {
    throw new Error('Budget/URL validation should reject invalid brief');
  }
  verdict.BUDGET_VALIDATION = 'PASS';
  console.log('PASS BUDGET_VALIDATION');

  const created = await api('/ai-ads-manager/google/campaign-builder/drafts', token, {
    method: 'POST',
    body: JSON.stringify({ customerId: '5555555555', brief }),
  });
  if (created.status >= 300 || !created.json?.id || !created.json?.structuredDraft?.headlines) {
    throw new Error(`Draft create failed ${created.status} ${JSON.stringify(created.json)}`);
  }
  const draftId = created.json.id;
  const sd = created.json.structuredDraft;
  if (
    sd.campaignType !== 'SEARCH' ||
    !sd.adGroups?.length ||
    sd.headlines.length < 3 ||
    sd.descriptions.length < 2
  ) {
    throw new Error('Structured draft missing required fields');
  }
  if (created.json.dailyBudget !== 150000 || !created.json.monthlyEstimate) {
    throw new Error('Draft budget/monthly estimate missing');
  }
  verdict.AI_CAMPAIGN_DRAFT = 'PASS';
  console.log('PASS AI_CAMPAIGN_DRAFT');

  const unapprovedDeploy = await api(
    `/ai-ads-manager/google/campaign-builder/drafts/${draftId}/deploy`,
    token,
    { method: 'POST' },
  );
  if (unapprovedDeploy.status < 400) {
    throw new Error('Deploy without approval must fail');
  }

  const preview = await api(
    `/ai-ads-manager/google/campaign-builder/drafts/${draftId}/preview`,
    token,
    { method: 'POST' },
  );
  if (preview.status >= 300 || !preview.json?.preview?.steps?.includes('CampaignBudget')) {
    throw new Error(`Preview failed ${preview.status}`);
  }

  const preflight = await api(
    `/ai-ads-manager/google/campaign-builder/drafts/${draftId}/preflight`,
    token,
    { method: 'POST' },
  );
  const checkIds = (preflight.json?.preflight?.checks || []).map((c) => c.id);
  const requiredOk = ['url', 'budget', 'account', 'permission'].every((id) =>
    (preflight.json?.preflight?.checks || []).find((c) => c.id === id && c.ok),
  );
  if (preflight.status >= 300 || !preflight.json?.preflight?.ok || !requiredOk) {
    throw new Error(`Preflight failed ${preflight.status} ${JSON.stringify(preflight.json)}`);
  }
  if (!checkIds.includes('url') || !checkIds.includes('account')) {
    throw new Error('Preflight missing url/account checks');
  }
  verdict.WRITE_PREFLIGHT = 'PASS';
  console.log('PASS WRITE_PREFLIGHT', checkIds.join(','));

  const deny = await api(
    `/ai-ads-manager/google/campaign-builder/drafts/${draftId}/approve`,
    token,
    { method: 'POST', body: JSON.stringify({ confirm: false }) },
  );
  if (deny.status < 400) throw new Error('approve confirm=false must fail');

  const approve = await api(
    `/ai-ads-manager/google/campaign-builder/drafts/${draftId}/approve`,
    token,
    { method: 'POST', body: JSON.stringify({ confirm: true }) },
  );
  if (approve.status >= 300 || approve.json?.status !== 'APPROVED' || !approve.json?.approvedAt) {
    throw new Error(`Approve failed ${approve.status} ${JSON.stringify(approve.json)}`);
  }
  verdict.USER_APPROVAL = 'PASS';
  console.log('PASS USER_APPROVAL');

  const deploy1 = await api(
    `/ai-ads-manager/google/campaign-builder/drafts/${draftId}/deploy`,
    token,
    { method: 'POST' },
  );
  if (deploy1.status >= 300 || !deploy1.json?.deployment?.id) {
    throw new Error(`Deploy failed ${deploy1.status} ${JSON.stringify(deploy1.json)}`);
  }
  const resources = deploy1.json.deployment.createdResources || {};
  const stepsOk =
    resources.budgetResourceName &&
    resources.campaignResourceName &&
    resources.adGroupResourceNames?.length &&
    resources.keywordResourceNames?.length &&
    resources.adResourceNames?.length;
  if (deploy1.json.deployment.status !== 'SUCCEEDED' || !stepsOk) {
    throw new Error(`Deployment incomplete ${JSON.stringify(deploy1.json.deployment)}`);
  }

  const deploy2 = await api(
    `/ai-ads-manager/google/campaign-builder/drafts/${draftId}/deploy`,
    token,
    { method: 'POST' },
  );
  if (!deploy2.json?.reused || deploy2.json.deployment.id !== deploy1.json.deployment.id) {
    throw new Error('Retry created a second deployment — not idempotent');
  }
  verdict.WRITE_IDEMPOTENCY = 'PASS';
  console.log('PASS WRITE_IDEMPOTENCY');

  const budget = resolveDailyBudget(brief);
  const structured = buildTemplateStructuredDraft(brief, budget);
  let calls = { budget: 0, campaign: 0 };
  const failing = {
    ...createDryRunMutatePort('5555555555'),
    async createBudget(input) {
      calls.budget += 1;
      return createDryRunMutatePort('5555555555').createBudget(input);
    },
    async createCampaign() {
      calls.campaign += 1;
      throw new Error('simulated_mid_failure');
    },
  };
  const partial = await executeGoogleAdsCampaignPlan({
    draft: structured,
    resources: {},
    mutate: failing,
  });
  if (partial.completed || partial.failedStep !== 'campaign' || !partial.resources.budgetResourceName) {
    throw new Error('PARTIAL path not recorded');
  }
  const resume = await executeGoogleAdsCampaignPlan({
    draft: structured,
    resources: partial.resources,
    mutate: {
      ...createDryRunMutatePort('5555555555'),
      async createBudget() {
        throw new Error('must_not_recreate_budget');
      },
    },
  });
  if (!resume.completed || !resume.resources.adResourceNames?.length) {
    throw new Error('Retry after PARTIAL did not finish remaining steps');
  }
  if (calls.budget !== 1) throw new Error('Budget created more than once');

  verdict.CAMPAIGN_DEPLOYMENT = 'PASS';
  console.log('PASS CAMPAIGN_DEPLOYMENT (Budget→Campaign→AdGroup→Keyword→RSA + PARTIAL retry)');

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);
  const allPass = Object.values(verdict).every((v) => v === 'PASS');
  if (!allPass) process.exit(1);
  console.log('GOOGLE ADS AI CAMPAIGN BUILDER PASS');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    console.log('\n=== VERDICT ===');
    for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
