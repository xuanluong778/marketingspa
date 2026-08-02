/**
 * Affiliate module smoke tests
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-affiliate.ts
 */
import { createHmac, randomBytes } from 'crypto';
import {
  AffiliateCommissionStatus,
  AffiliateProfileStatus,
  PaymentOrderStatus,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET!;
const SEPAY_TOKEN = process.env.SEPAY_API_TOKEN || '';
const ACCOUNT = process.env.PAYMENT_ACCOUNT_NUMBER || '7982468';
const PREFIX = (process.env.PAYMENT_CODE_PREFIX || 'MKTA').toUpperCase();
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

async function api(path: string, token?: string, init?: RequestInit, cookie?: string) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
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
  return { status: res.status, json };
}

function mkta() {
  return `${PREFIX}${100000 + (randomBytes(3).readUIntBE(0, 3) % 900000)}`;
}

async function main() {
  const results: Case[] = [];
  const superUser = await prisma.user.findUnique({
    where: { email: SUPER_EMAIL },
    include: { role: true },
  });
  if (!superUser) throw new Error('missing super');
  const affUser = await prisma.user.findFirst({
    where: { email: { not: SUPER_EMAIL }, isActive: true, emailVerifiedAt: { not: null } },
    include: { role: true },
  });
  if (!affUser) throw new Error('need affiliate user');

  const affToken = mint({
    id: affUser.id,
    email: affUser.email,
    organizationId: affUser.organizationId,
    role: affUser.role.code,
  });
  const superToken = mint({
    id: superUser.id,
    email: superUser.email,
    organizationId: superUser.organizationId,
    role: superUser.role.code,
  });
  const other = await prisma.user.findFirst({
    where: {
      id: { notIn: [affUser.id, superUser.id] },
      isActive: true,
    },
    include: { role: true },
  });

  // Ensure profile
  {
    const r = await api('/affiliate/me', affToken);
    const body = r.json as { profile?: { code?: string } };
    results.push({
      name: 'affiliate_me_create_profile',
      ok: (r.status === 200 || r.status === 201) && !!body.profile?.code,
      detail: `${r.status} code=${body.profile?.code}`,
    });
  }

  const profile = await prisma.affiliateProfile.findUnique({ where: { userId: affUser.id } });
  if (!profile) throw new Error('profile missing');

  // Track click
  {
    const r = await api('/affiliate/track', undefined, {
      method: 'POST',
      body: JSON.stringify({ code: profile.code, landingPath: '/' }),
    });
    results.push({
      name: 'track_click',
      ok: r.status === 200 || r.status === 201,
      detail: String(r.status),
    });
  }

  // Self-referral: org của chính affiliate không được gắn referral của mình
  {
    const selfRef = await prisma.affiliateReferral.findFirst({
      where: {
        affiliateId: profile.id,
        referredOrganizationId: profile.organizationId,
      },
    });
    results.push({
      name: 'self_referral_not_linked',
      ok: !selfRef,
      detail: selfRef ? 'linked' : 'clean',
    });
  }

  // IDOR: other user cannot see aff admin
  if (other) {
    const otherToken = mint({
      id: other.id,
      email: other.email,
      organizationId: other.organizationId,
      role: other.role.code,
    });
    const r = await api('/admin/affiliate/overview', otherToken);
    results.push({
      name: 'admin_affiliate_non_super_403',
      ok: r.status === 403,
      detail: String(r.status),
    });
  }

  // Super admin overview
  {
    const r = await api('/admin/affiliate/overview', superToken);
    results.push({
      name: 'admin_affiliate_overview',
      ok: r.status === 200,
      detail: String(r.status),
    });
  }

  // Referral lock + paid commission + duplicate webhook
  {
    const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
    if (!plan) throw new Error('no plan');

    // Create a fresh org+user for referred customer
    const slug = `aff-ref-${Date.now().toString(36)}`;
    const email = `affref_${Date.now()}@example.com`;
    const referred = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: 'Aff Ref Spa', slug, email },
      });
      const role = await tx.role.create({
        data: {
          organizationId: org.id,
          code: 'OWNER',
          name: 'Owner',
          isSystem: true,
        },
      });
      const user = await tx.user.create({
        data: {
          email,
          name: 'Aff Ref',
          passwordHash: null,
          authProvider: 'GOOGLE',
          organizationId: org.id,
          roleId: role.id,
          emailVerifiedAt: new Date(),
        },
      });
      return { org, user };
    });

    // Lock referral
    await prisma.organization.update({
      where: { id: referred.org.id },
      data: {
        referredByCode: profile.code,
        referredByAffiliateId: profile.id,
        referralLockedAt: new Date(),
      },
    });
    await prisma.affiliateReferral.create({
      data: {
        affiliateId: profile.id,
        referredOrganizationId: referred.org.id,
        referredUserId: referred.user.id,
        referralCode: profile.code,
        firstOrderOnly: true,
      },
    });
    await prisma.affiliateProfile.update({
      where: { id: profile.id },
      data: { totalSignups: { increment: 1 } },
    });

    const code = mkta();
    const order = await prisma.paymentOrder.create({
      data: {
        code,
        organizationId: referred.org.id,
        planId: plan.id,
        createdByUserId: referred.user.id,
        amountVnd: new Decimal(3900000),
        status: PaymentOrderStatus.PENDING,
        transferContent: code,
        bankCode: 'ACB',
        accountNumber: ACCOUNT,
        accountName: 'CONG TY TNHH THE GIOI DIGI',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const sepayId = `aff-${Date.now()}-${randomBytes(2).toString('hex')}`;
    const body = {
      id: sepayId,
      transferType: 'in',
      transferAmount: 3900000,
      accountNumber: ACCOUNT,
      content: `CK ${code}`,
      gateway: 'ACB',
    };

    const wh1 = await fetch(`${API}/api/v1/payments/sepay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Apikey ${SEPAY_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    const j1 = await wh1.json();
    await new Promise((r) => setTimeout(r, 500)); // commission async

    const commission = await prisma.affiliateCommission.findUnique({
      where: { orderId: order.id },
    });
    results.push({
      name: 'paid_creates_pending_commission',
      ok:
        wh1.status === 200 &&
        !!commission &&
        commission.status === AffiliateCommissionStatus.PENDING &&
        Number(commission.commissionVnd) === Math.floor(3900000 * 0.3),
      detail: `http=${wh1.status} status=${commission?.status} hh=${commission?.commissionVnd}`,
    });

    const wh2 = await fetch(`${API}/api/v1/payments/sepay/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Apikey ${SEPAY_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    const j2 = await wh2.json();
    const count = await prisma.affiliateCommission.count({ where: { orderId: order.id } });
    results.push({
      name: 'webhook_duplicate_no_double_commission',
      ok: wh2.status === 200 && j2.duplicated === true && count === 1,
      detail: `dup=${j2.duplicated} count=${count}`,
    });
    void j1;

    // Underpay — no commission for wrong amount path already covered by sepay tests;
    // ensure wrong amount order doesn't create second commission for same org first-order logic
  }

  // Bank account unique
  {
    const acc = `7982${Date.now().toString().slice(-6)}`;
    const r1 = await api('/affiliate/payout-method', affToken, {
      method: 'POST',
      body: JSON.stringify({
        bankCode: 'ACB',
        bankName: 'ACB',
        accountNumber: acc,
        accountName: 'TEST AFF',
        taxId: '0123456789',
        taxName: 'TEST AFF',
      }),
    });
    results.push({
      name: 'payout_method_save',
      ok: r1.status === 200 || r1.status === 201,
      detail: String(r1.status),
    });
  }

  // Min payout validation
  {
    const r = await api('/affiliate/payouts', affToken, {
      method: 'POST',
      body: JSON.stringify({ amountVnd: 1000 }),
    });
    results.push({
      name: 'payout_min_500k',
      ok: r.status === 400,
      detail: String(r.status),
    });
  }

  // RBAC affiliate me is own data only — other token gets own profile
  if (other) {
    const otherToken = mint({
      id: other.id,
      email: other.email,
      organizationId: other.organizationId,
      role: other.role.code,
    });
    const r = await api('/affiliate/me', otherToken);
    const body = r.json as { profile?: { code?: string; id?: string } };
    results.push({
      name: 'idor_own_profile_only',
      ok:
        (r.status === 200 || r.status === 201) &&
        body.profile?.code !== profile.code,
      detail: `otherCode=${body.profile?.code} affCode=${profile.code}`,
    });
  }

  console.log('\n=== Affiliate tests ===');
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
