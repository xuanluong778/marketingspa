/** Quick verify createOrder QR amounts for both MSP plans */
import { createHmac, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET!;

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

async function createOrder(token: string, planCode: string) {
  const res = await fetch(`${API}/api/v1/billing/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planCode }),
  });
  return { status: res.status, json: await res.json() };
}

async function main() {
  const stamp = Date.now();
  const org = await prisma.organization.create({
    data: { name: `QR test ${stamp}`, slug: `qr-test-${stamp}`, email: `qr.${stamp}@example.com` },
  });
  await prisma.creditWallet.create({ data: { organizationId: org.id, balance: 0 } });
  const role = await prisma.role.create({
    data: { organizationId: org.id, code: 'OWNER', name: 'Owner' },
  });
  const user = await prisma.user.create({
    data: {
      email: `qr.${stamp}@example.com`,
      name: 'QR Test',
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: role.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });
  const token = mint({ id: user.id, email: user.email, organizationId: org.id, role: 'OWNER' });

  for (const [planCode, expected] of [
    ['msp-pro-6m', 5500000],
    ['msp-pro-12m', 8500000],
  ] as const) {
    const r = await createOrder(token, planCode);
    const amount = Number((r.json as { amountVnd?: number | string }).amountVnd);
    const qr = String((r.json as { qrUrl?: string }).qrUrl ?? '');
    const qrAmount = new URL(qr.startsWith('http') ? qr : `https://x?${qr.split('?')[1] ?? ''}`).searchParams.get('amount');
    const ok =
      (r.status === 201 || r.status === 200) &&
      amount === expected &&
      qrAmount === String(expected);
    console.log(`${ok ? 'PASS' : 'FAIL'} createOrder ${planCode}: http=${r.status} amount=${amount} qrAmount=${qrAmount}`);
    if (!ok) process.exitCode = 1;
  }

  await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
  await prisma.$disconnect();
}

void main();
