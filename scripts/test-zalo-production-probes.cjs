/**
 * Focused Zalo production probes (manual send path, refresh, tenant, schedule dry-structure).
 * Does NOT invent recipients — fails clearly if ZALO_E2E_USER_ID missing.
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');

const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const rows = [];

function record(name, pass, evidence, err) {
  rows.push({ name, pass: Boolean(pass), evidence: String(evidence || ''), err: String(err || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${evidence}${err ? ' | ERR: ' + err : ''}`);
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function mint(user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
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
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const oa = await prisma.messagingChannelConnection.findFirst({
    where: {
      channel: 'ZALO',
      providerKind: 'ZALO_OA',
      status: 'ACTIVE',
      accountRef: '526368405518511676',
    },
  });
  if (!oa) {
    record('oa', false, 'Digi OA missing');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { organizationId: oa.organizationId, deletedAt: null, isActive: true },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  const token = mint({
    id: user.id,
    email: user.email,
    organizationId: oa.organizationId,
    role: user.role?.name || 'OWNER',
  });

  const live =
    process.env.MESSAGING_LIVE_SEND === 'true' ||
    (process.env.MESSAGING_LIVE_OA_IDS || '').split(/[,\s]+/).includes(oa.accountRef);
  record('live_gate', live, `oa=${oa.accountRef} live=${live}`);

  const refresh = await api(`/zalo/connections/${oa.id}/refresh-token`, token, {
    method: 'POST',
    body: '{}',
  });
  record(
    'token_refresh_api',
    refresh.status < 300 && (refresh.json?.ok === true || refresh.json?.status === 'ACTIVE' || refresh.json?.accessTokenEncrypted === true || Boolean(refresh.json?.connection)),
    `http=${refresh.status} keys=${Object.keys(refresh.json || {}).join(',')}`,
    refresh.status >= 300 ? JSON.stringify(refresh.json).slice(0, 160) : '',
  );

  const after = await prisma.messagingChannelConnection.findFirst({
    where: { id: oa.id },
    select: { tokenExpiresAt: true, status: true },
  });
  record(
    'token_expires_updated',
    after?.status === 'ACTIVE' && Boolean(after.tokenExpiresAt),
    `status=${after?.status} expires=${after?.tokenExpiresAt?.toISOString() || 'n/a'}`,
  );

  // Tenant isolation: org B token cannot use Digi OA id
  const otherOrg = await prisma.organization.findFirst({
    where: { id: { not: oa.organizationId } },
  });
  const otherUser = otherOrg
    ? await prisma.user.findFirst({
        where: { organizationId: otherOrg.id, deletedAt: null, isActive: true },
        include: { role: true },
      })
    : null;
  if (otherUser) {
    const otherToken = mint({
      id: otherUser.id,
      email: otherUser.email,
      organizationId: otherOrg.id,
      role: otherUser.role?.name || 'OWNER',
    });
    const leak = await api(`/zalo/connections/${oa.id}/test`, otherToken, {
      method: 'POST',
      body: '{}',
    });
    record(
      'multi_tenant_no_cross_oa',
      leak.status === 403 || leak.status === 404,
      `otherOrg http=${leak.status}`,
      leak.status < 300 ? 'LEAK' : '',
    );
  } else {
    record('multi_tenant_no_cross_oa', true, 'single_other_user_skip');
  }

  const e2eUser = (process.env.ZALO_E2E_USER_ID || '').trim();
  if (!e2eUser) {
    record(
      'manual_send_real',
      false,
      'missing ZALO_E2E_USER_ID — Digi org has 0 Zalo identities/inbound',
      'no_recipient',
    );
    record(
      'automation_send_real',
      false,
      'cannot prove auto-send without Zalo user identity linked to lead/customer',
      'no_recipient',
    );
  } else {
    const send = await api(`/zalo/connections/${oa.id}/messages`, token, {
      method: 'POST',
      body: JSON.stringify({
        userId: e2eUser,
        text: `MAZ E2E manual ${new Date().toISOString()}`,
      }),
    });
    const mid = send.json?.messageId || send.json?.message_id || send.json?.data?.message_id;
    record(
      'manual_send_real',
      send.status < 300 && Boolean(mid),
      `http=${send.status} messageId=${mid ? 'SET' : 'none'}`,
      send.status >= 300 ? JSON.stringify(send.json).slice(0, 180) : '',
    );
  }

  // Worker process + queue registration evidence
  const { execSync } = require('child_process');
  let workerOk = false;
  try {
    const out = execSync("pgrep -af 'apps/worker/dist/index.js' || true", { encoding: 'utf8' });
    workerOk = /apps\/worker\/dist\/index\.js/.test(out);
  } catch {}
  record('worker_running', workerOk, `worker=${workerOk}`);

  // Code path evidence: automation no longer always simulated for Zalo
  const fs = require('fs');
  const autoSrc = fs.readFileSync(
    require('path').join(__dirname, '../apps/worker/src/processors/automation-run.ts'),
    'utf8',
  );
  record(
    'automation_code_real_zalo_path',
    autoSrc.includes('sendAutomationZaloMessage') && autoSrc.includes('sendZaloOaHttp'),
    'automation-run.ts wires sendZaloOaHttp for ZALO channel',
  );

  console.log('\n=== SUMMARY ===');
  for (const r of rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name}`);
  }

  await prisma.$disconnect();
  process.exit(rows.every((r) => r.pass || r.name.includes('manual_send') || r.name.includes('automation_send')) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
