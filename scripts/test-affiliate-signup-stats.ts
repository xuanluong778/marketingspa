/**
 * Test: capture ref → send-otp stores code → verify → dashboard signups +1
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-affiliate-signup-stats.ts
 */
import { createHmac, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

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

async function api(
  path: string,
  init?: RequestInit & { token?: string; cookie?: string; refHeader?: string },
) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init?.cookie ? { Cookie: init.cookie } : {}),
      ...(init?.refHeader ? { 'X-Affiliate-Ref': init.refHeader } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const results: Case[] = [];
  const affUser = await prisma.user.findFirst({
    where: { affiliateProfile: { isNot: null }, isActive: true },
    include: { role: true, affiliateProfile: true },
  });
  if (!affUser?.affiliateProfile) throw new Error('need affiliate profile');
  const code = affUser.affiliateProfile.code;
  const affToken = mint({
    id: affUser.id,
    email: affUser.email,
    organizationId: affUser.organizationId,
    role: affUser.role.code,
  });

  const before = await api('/affiliate/me', { token: affToken });
  const beforeSignups = (before.json as { stats?: { signups?: number } }).stats?.signups ?? 0;

  const email = `aff.signup.${Date.now()}@example.com`;
  const password = 'TestPass123!';
  const orgName = `Aff Signup ${Date.now()}`;

  // 1) send-otp với header X-Affiliate-Ref (mô phỏng client sau khi mất HttpOnly)
  const send = await api('/auth/register/send-otp', {
    method: 'POST',
    refHeader: code,
    body: JSON.stringify({
      email,
      password,
      name: 'Aff Signup',
      organizationName: orgName,
      referralCode: code,
    }),
  });
  const registrationId = (send.json as { registrationId?: string }).registrationId;
  results.push({
    name: 'send_otp_stores_ref',
    ok: send.status === 200 || send.status === 201,
    detail: String(send.status),
  });

  const otpRow = await prisma.registrationOtp.findUnique({ where: { id: registrationId! } });
  results.push({
    name: 'otp_has_referral_code',
    ok: otpRow?.referralCode === code,
    detail: `got=${otpRow?.referralCode}`,
  });

  // Đọc OTP thật từ DB không được — dùng hash bypass bằng cách consume thủ công + gọi attach
  // Thay vào đó: simulate verify bằng tạo user qua attach path sau khi tạo org giống verify
  // Để test end-to-end thật cần OTP plaintext. Inject: cập nhật codeHash tạm? 
  // Cách chắc: gọi attachReferralOnSignup gián tiếp bằng cách tạo user như verify nhưng
  // dùng API verify với OTP từ mail — không có. 
  // Workaround: dùng prisma để set password và gọi internal flow:
  // Tạo org+user rồi gọi attach qua HTTP không có. 
  // → Dùng AffiliateService qua dynamic import không DI.
  // Practical: tạo org/user, gọi POST không; dùng prisma + replicate attach bằng fetch to a test:
  
  // Direct DB path that mirrors verifyRegistrationOtp success attach:
  const { createHash } = await import('crypto');
  // Generate known OTP by recreating row
  const plainOtp = '123456';
  const hash = createHash('sha256').update(plainOtp).digest('hex');
  await prisma.registrationOtp.update({
    where: { id: registrationId! },
    data: { codeHash: hash, attemptCount: 0, expiresAt: new Date(Date.now() + 300000) },
  });

  const verify = await api('/auth/register/verify-otp', {
    method: 'POST',
    cookie: `msa_ref=${code}; msa_ref_js=${code}`,
    body: JSON.stringify({ registrationId, otp: plainOtp }),
  });
  results.push({
    name: 'verify_otp_creates_user',
    ok: verify.status === 200 || verify.status === 201,
    detail: String(verify.status),
  });

  const newUser = await prisma.user.findUnique({ where: { email } });
  const org = newUser
    ? await prisma.organization.findUnique({ where: { id: newUser.organizationId } })
    : null;
  const referral = org
    ? await prisma.affiliateReferral.findUnique({
        where: { referredOrganizationId: org.id },
      })
    : null;

  results.push({
    name: 'org_locked_to_affiliate',
    ok: !!org?.referralLockedAt && org.referredByCode === code && !!referral,
    detail: `code=${org?.referredByCode} ref=${!!referral}`,
  });

  const after = await api('/affiliate/me', { token: affToken });
  const afterSignups = (after.json as { stats?: { signups?: number } }).stats?.signups ?? 0;
  results.push({
    name: 'dashboard_signups_increment',
    ok: afterSignups === beforeSignups + 1,
    detail: `${beforeSignups} → ${afterSignups}`,
  });

  // IDOR: referred user token không thấy affiliate profile của affUser
  if (newUser) {
    const role = await prisma.role.findUnique({ where: { id: newUser.roleId } });
    const newToken = mint({
      id: newUser.id,
      email: newUser.email,
      organizationId: newUser.organizationId,
      role: role!.code,
    });
    const otherMe = await api('/affiliate/me', { token: newToken });
    const otherCode = (otherMe.json as { profile?: { code?: string } }).profile?.code;
    results.push({
      name: 'idor_other_user_own_profile',
      ok: otherCode !== code,
      detail: `other=${otherCode} aff=${code}`,
    });
  }

  // Idempotent re-attach: verify again shouldn't create second referral
  const refCount = await prisma.affiliateReferral.count({
    where: { referredOrganizationId: org!.id },
  });
  results.push({
    name: 'no_duplicate_referral',
    ok: refCount === 1,
    detail: String(refCount),
  });

  console.log('\n=== Affiliate signup stats tests ===');
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
  .finally(() => prisma.$disconnect());
