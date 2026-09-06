#!/usr/bin/env node
/**
 * Login rate-limit: count failures only, not successful logins.
 * Run: pnpm test:login-rate-limit
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    for (const line of read('.env').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
  return env;
}

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  const auth = read('apps/api/src/auth/auth.service.ts');
  const rl = read('apps/api/src/common/services/rate-limit.service.ts');
  const gsi = read('apps/web/src/components/auth/google-sign-in-button.tsx');

  const loginFn = auth.slice(auth.indexOf('async login('), auth.indexOf('async loginWithGoogle('));

  let failed = 0;
  const check = (label: string, ok: boolean, detail?: string) => {
    if (!gate(label, ok, detail)) failed += 1;
  };

  check(
    'RATE_LIMIT_PEEK_API',
    rl.includes('isLimited(') && rl.includes('record(') && rl.includes('clear('),
    'peek/record/clear without consuming on check',
  );
  check(
    'LOGIN_DOES_NOT_COUNT_SUCCESS_UPFRONT',
    loginFn.includes('this.rateLimit.isLimited(emailRl') &&
      !loginFn.includes('this.rateLimit.assertWithinLimit('),
    'login peeks limiter instead of consuming a slot',
  );
  check(
    'LOGIN_RECORDS_FAILURE_ONLY',
    loginFn.includes('this.rateLimit.record(emailRl') && loginFn.includes('const fail = async'),
    'failed password increments counter',
  );
  check(
    'LOGIN_CLEARS_ON_SUCCESS',
    loginFn.includes('this.rateLimit.clear(emailRl)'),
    'successful login resets email lockout',
  );
  check(
    'GSI_SINGLE_INIT',
    gsi.includes('gsiInitializedClientId') && !gsi.includes('disabled, handleCredential'),
    'Google Identity initialize() once per client id',
  );
  check(
    'GSI_NO_CANCEL_ON_UNMOUNT',
    !gsi.includes('accounts?.id?.cancel') && !gsi.includes('id?.cancel?.()'),
    'unmount does not cancel GIS (avoids re-init)',
  );

  const env = loadEnv();
  const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const email = (env.META_REVIEWER_EMAIL || '').trim();
  const password = (env.META_REVIEWER_PASSWORD || '').trim();

  if (!email || !password) {
    check('LIVE_SUCCESS_LOGINS', false, 'SKIP — thiếu META_REVIEWER_EMAIL/PASSWORD');
  } else {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      statuses.push(res.status);
      await res.text();
    }
    const allOk = statuses.every((s) => s === 200 || s === 201);
    const locked = statuses.some((s) => s === 429);
    check(
      'LIVE_SUCCESS_LOGINS',
      allOk && !locked,
      `6 correct-password logins → ${statuses.join(',')}`,
    );
  }

  if (failed) {
    console.log(`LOGIN_RATE_LIMIT = FAIL (${failed})`);
    process.exit(1);
  }
  console.log('LOGIN_RATE_LIMIT = PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
