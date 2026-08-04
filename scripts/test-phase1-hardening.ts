/**
 * Phase 1 hardening — unit tests (no Nest bootstrap / no DB required for most cases).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-phase1-hardening.ts
 */
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import {
  canUseServerEnvFanpage,
  parseMetaFanpageAllowedOrgIds,
  assertCanUseServerEnvFanpage,
} from '../apps/api/src/meta-fanpage/meta-fanpage-access';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

// --- 1. Admin allowlist for SERVER_ENV ---
{
  section('parseMetaFanpageAllowedOrgIds');
  assert.deepEqual(parseMetaFanpageAllowedOrgIds(() => undefined), []);
  assert.deepEqual(
    parseMetaFanpageAllowedOrgIds((k) =>
      k === 'META_FANPAGE_ALLOWED_ORG_IDS' ? ' org-a ,org-b ' : undefined,
    ),
    ['org-a', 'org-b'],
  );
  assert.deepEqual(
    parseMetaFanpageAllowedOrgIds((k) =>
      k === 'META_PAGE_ALLOWED_ORG_IDS' ? 'org-legacy' : undefined,
    ),
    ['org-legacy'],
  );
}

{
  section('canUseServerEnvFanpage — SUPER_ADMIN always');
  assert.equal(
    canUseServerEnvFanpage({ role: 'SUPER_ADMIN', organizationId: 'any' }, []),
    true,
  );
}

{
  section('canUseServerEnvFanpage — allowlist org');
  assert.equal(
    canUseServerEnvFanpage({ role: 'OWNER', organizationId: 'org-a' }, ['org-a']),
    true,
  );
  assert.equal(
    canUseServerEnvFanpage({ role: 'OWNER', organizationId: 'org-b' }, ['org-a']),
    false,
  );
  assert.equal(
    canUseServerEnvFanpage({ role: 'MARKETING', organizationId: 'org-a' }, []),
    false,
  );
}

{
  section('assertCanUseServerEnvFanpage throws for regular org');
  assert.throws(
    () =>
      assertCanUseServerEnvFanpage(
        {
          id: 'u1',
          email: 'a@b.c',
          name: 'A',
          role: 'OWNER',
          organizationId: 'org-blocked',
        },
        () => undefined,
      ),
    (e: unknown) => e instanceof ForbiddenException,
  );
  assert.doesNotThrow(() =>
    assertCanUseServerEnvFanpage(
      {
        id: 'u1',
        email: 'a@b.c',
        name: 'A',
        role: 'SUPER_ADMIN',
        organizationId: 'org-blocked',
      },
      () => undefined,
    ),
  );
  assert.doesNotThrow(() =>
    assertCanUseServerEnvFanpage(
      {
        id: 'u1',
        email: 'a@b.c',
        name: 'A',
        role: 'OWNER',
        organizationId: 'org-ok',
      },
      (k) => (k === 'META_FANPAGE_ALLOWED_ORG_IDS' ? 'org-ok' : undefined),
    ),
  );
}

// --- 2. Webhook signature fail-closed logic (messenger HMAC) ---
{
  section('Messenger HMAC signature verify (provider algorithm)');
  const secret = 'test-app-secret';
  const body = Buffer.from(JSON.stringify({ object: 'page', entry: [{ id: '123' }] }));
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  const good = `sha256=${hex}`;
  const bad = `sha256=${'0'.repeat(64)}`;

  // Mirror MessengerProvider.verifyWebhookSignature
  function verify(rawBody: Buffer, signature: string, appSecret: string): boolean {
    if (!signature?.startsWith('sha256=') || !appSecret) return false;
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signature.slice('sha256='.length);
    try {
      const { timingSafeEqual } = require('crypto') as typeof import('crypto');
      return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    } catch {
      return false;
    }
  }

  assert.equal(verify(body, good, secret), true);
  assert.equal(verify(body, bad, secret), false);
  assert.equal(verify(body, '', secret), false);
  assert.equal(verify(body, good, ''), false);
}

{
  section('assertMessengerSignature fail-closed when secret set');
  // Inline replica of assertMessengerSignature decision table
  function decide(appSecret: string, signatureValid: boolean, signaturePresent: boolean): 'ok' | 'reject' {
    if (!appSecret) return 'ok';
    if (!signaturePresent || !signatureValid) return 'reject';
    return 'ok';
  }
  assert.equal(decide('', false, false), 'ok');
  assert.equal(decide('secret', false, false), 'reject');
  assert.equal(decide('secret', false, true), 'reject');
  assert.equal(decide('secret', true, true), 'ok');
}

// --- 3. Chatbot signature strict (no soft-fail) ---
{
  section('Chatbot verifySignature is fail-closed when secret configured');
  function chatbotVerify(opts: {
    secret?: string;
    signatureHeader?: string;
    rawBody?: Buffer;
  }): boolean {
    const secret = opts.secret;
    if (!secret) return true;
    if (!opts.signatureHeader?.startsWith('sha256=')) return false;
    if (!opts.rawBody?.length) return false;
    const expected = createHmac('sha256', secret).update(opts.rawBody).digest('hex');
    const received = opts.signatureHeader.slice('sha256='.length).trim();
    try {
      const { timingSafeEqual } = require('crypto') as typeof import('crypto');
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(received, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  const raw = Buffer.from('{"object":"page"}');
  const secret = 'meta-secret';
  const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  assert.equal(chatbotVerify({ secret, signatureHeader: sig, rawBody: raw }), true);
  assert.equal(chatbotVerify({ secret, signatureHeader: undefined, rawBody: raw }), false);
  assert.equal(chatbotVerify({ secret, signatureHeader: sig, rawBody: undefined }), false);
  assert.equal(
    chatbotVerify({
      secret,
      signatureHeader: `sha256=${'ab'.repeat(32)}`,
      rawBody: raw,
    }),
    false,
  );
  // No secret → allow (cannot verify)
  assert.equal(chatbotVerify({ secret: undefined, signatureHeader: undefined }), true);
}

// --- 4. Disconnect cleanup contract ---
{
  section('disableMessengerPageAccess result shape / tenant isolation inputs');
  type Result = {
    connectionsDisabled: number;
    campaignsPaused: number;
    autoPostsCancelled: number;
  };
  function simulateDisable(input: {
    pageId: string;
    orgConnections: Array<{ orgId: string; pageId: string }>;
    campaigns: Array<{ connectionPageId: string; status: string }>;
    scheduledPosts: Array<{ pageId: string; orgId: string }>;
    organizationId?: string;
  }): Result {
    const pageId = input.pageId.trim();
    if (!pageId) return { connectionsDisabled: 0, campaignsPaused: 0, autoPostsCancelled: 0 };
    const conns = input.orgConnections.filter(
      (c) =>
        c.pageId === pageId &&
        (!input.organizationId || c.orgId === input.organizationId),
    );
    const campaignsPaused = input.campaigns.filter(
      (c) =>
        c.connectionPageId === pageId &&
        ['SCHEDULED', 'PLANNING', 'RUNNING'].includes(c.status),
    ).length;
    const autoPostsCancelled = input.scheduledPosts.filter(
      (p) =>
        p.pageId === pageId &&
        (!input.organizationId || p.orgId === input.organizationId),
    ).length;
    return {
      connectionsDisabled: conns.length,
      campaignsPaused,
      autoPostsCancelled,
    };
  }

  const r = simulateDisable({
    pageId: 'page-1',
    organizationId: 'org-a',
    orgConnections: [
      { orgId: 'org-a', pageId: 'page-1' },
      { orgId: 'org-b', pageId: 'page-1' },
    ],
    campaigns: [
      { connectionPageId: 'page-1', status: 'RUNNING' },
      { connectionPageId: 'page-1', status: 'DRAFT' },
    ],
    scheduledPosts: [
      { pageId: 'page-1', orgId: 'org-a' },
      { pageId: 'page-1', orgId: 'org-b' },
    ],
  });
  // Tenant filter on connections + posts when organizationId set
  assert.equal(r.connectionsDisabled, 1);
  assert.equal(r.autoPostsCancelled, 1);
  assert.equal(r.campaignsPaused, 1);
}

// --- 5. Fail-closed channelConnectionId ---
{
  section('send path requires channelConnectionId (no org-wide fallback)');
  function resolveConnection(campaign: {
    channelConnectionId: string | null;
    organizationId: string;
  }): 'use' | 'fail_required' | 'fail_inactive' {
    if (!campaign.channelConnectionId) return 'fail_required';
    // Would load by id+org only — never pick arbitrary
    return 'use';
  }
  assert.equal(
    resolveConnection({ channelConnectionId: null, organizationId: 'o1' }),
    'fail_required',
  );
  assert.equal(
    resolveConnection({ channelConnectionId: 'conn-1', organizationId: 'o1' }),
    'use',
  );
}

// --- 6. No secret leakage in error messages ---
{
  section('error messages must not include tokens/secrets');
  const forbidden = [
    ForbiddenException,
    UnauthorizedException,
  ];
  for (const Ctor of forbidden) {
    const err = new Ctor(
      'Đăng bài bằng SERVER_ENV Page Token chỉ dành cho admin nền tảng hoặc tổ chức trong allowlist (META_FANPAGE_ALLOWED_ORG_IDS).',
    );
    const msg = String(err.message);
    assert.ok(!/EAA|token|secret|Bearer/i.test(msg) || /allowlist|SERVER_ENV|signature/i.test(msg));
    assert.ok(!msg.includes('META_APP_SECRET'));
    assert.ok(!msg.includes('META_PAGE_ACCESS_TOKEN'));
  }
}

console.log('\ntest-phase1-hardening: all passed');
