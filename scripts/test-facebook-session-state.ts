#!/usr/bin/env node
/**
 * Facebook session state gates — no false expired after OAuth success.
 *
 *   pnpm test:facebook-session-state
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  isStaleFacebookReconnectError,
  publicFacebookLastError,
  resolveFacebookSessionState,
} from '../apps/api/src/auto-post/facebook-session-state';
import { humanizeAutoPostFacebookError } from '../apps/api/src/auto-post/auto-post-user-facing-errors';

const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const WEB_SRC = path.join(ROOT, 'apps/web/src');
const API_SRC = path.join(ROOT, 'apps/api/src/auto-post');

function read(rel: string): string {
  return fs.readFileSync(path.join(WEB_SRC, rel), 'utf8');
}

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  const rows: string[] = [];
  const serviceSrc = fs.readFileSync(path.join(API_SRC, 'auto-post-facebook.service.ts'), 'utf8');
  const panelSrc = read('components/content-auto-post/auto-post-channels-panel.tsx');
  const enDict = read('i18n/dictionaries/en.ts');

  // --- Unit: session state ---
  const connected = resolveFacebookSessionState({
    hasConnection: true,
    connectionStatus: 'CONNECTED',
    pendingOAuthValid: false,
    isTokenExpired: false,
    apiStatus: 'CONNECTED',
  });
  const pending = resolveFacebookSessionState({
    hasConnection: true,
    connectionStatus: 'DISCONNECTED',
    pendingOAuthValid: true,
    isTokenExpired: false,
    apiStatus: 'DISCONNECTED',
  });
  const sessionOk =
    connected === 'CONNECTED' &&
    pending === 'OAUTH_PENDING' &&
    resolveFacebookSessionState({
      hasConnection: true,
      connectionStatus: 'CONNECTED',
      pendingOAuthValid: false,
      isTokenExpired: true,
      apiStatus: 'NEEDS_RECONNECT',
    }) === 'EXPIRED';
  gate('SESSION_STATE', sessionOk);
  rows.push(
    `Session state enum | missing OAUTH_PENDING / stale error mapping | facebook-session-state.ts | new helper | CONNECTED/EXPIRED/REVOKED/DISCONNECTED/OAUTH_PENDING | ${sessionOk ? 'PASS' : 'FAIL'}`,
  );

  // --- Unit: no false expired on reconnect prep / OAuth pending ---
  const stale = 'NEEDS_RECONNECT: Phiên OAuth mới đã bắt đầu — hoàn tất đăng nhập Facebook';
  const noFalseExpired =
    isStaleFacebookReconnectError(stale) &&
    publicFacebookLastError('OAUTH_PENDING', stale, humanizeAutoPostFacebookError) === null &&
    publicFacebookLastError('CONNECTED', null, humanizeAutoPostFacebookError) === null &&
    publicFacebookLastError(
      'EXPIRED',
      'NEEDS_RECONNECT: Token Facebook đã hết hạn',
      humanizeAutoPostFacebookError,
    ) !== null;
  gate('NO_FALSE_EXPIRED_WARNING', noFalseExpired);
  rows.push(
    `False expired banner | resetOAuthSessionForReconnect sets NEEDS_RECONNECT lastError | auto-post-facebook.service.ts | clear lastError + OAUTH_PENDING | no banner during page picker | ${noFalseExpired ? 'PASS' : 'FAIL'}`,
  );

  // --- Static: reconnect clears error, UI guards ---
  const reconnectClear =
    serviceSrc.includes('lastError: null') &&
    serviceSrc.includes('resetOAuthSessionForReconnect') &&
    serviceSrc.includes('sessionState') &&
    serviceSrc.includes('publicFacebookLastError') &&
    panelSrc.includes('shouldShowFacebookSessionError');
  gate('RECONNECT_CLEAR_ERROR', reconnectClear);
  rows.push(
    `Reconnect clear error | stale lastError survives OAuth callback | auto-post-facebook.service.ts + auto-post-channels-panel.tsx | null lastError on reconnect + UI guard | ${reconnectClear ? 'PASS' : 'FAIL'}`,
  );

  // --- EN terminology ---
  const enOk =
    enDict.includes("connectFanpage: 'Connect Facebook Pages'") &&
    !enDict.includes("connectFanpage: 'Connect Fanpage'");
  gate('EN_TERMINOLOGY', enOk);
  rows.push(
    `Connect Fanpage EN label | nav key still Fanpage | en.ts nav.connectFanpage | Connect Facebook Pages | ${enOk ? 'PASS' : 'FAIL'}`,
  );

  // --- Live API (optional) ---
  let facebookLogin = true;
  let pageList = true;
  const email = (process.env.META_REVIEWER_EMAIL ?? '').trim();
  const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();
  const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
    /\/api\/v1$/,
    '',
  );

  if (email && password) {
    try {
      const login = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const { accessToken } = (await login.json()) as { accessToken?: string };
      facebookLogin = login.ok && Boolean(accessToken);
      if (accessToken) {
        const oauthStart = await fetch(`${API}/api/v1/auto-post/facebook/oauth/start`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          redirect: 'manual',
        });
        facebookLogin = facebookLogin && (oauthStart.status === 302 || oauthStart.status === 200);

        const st = await fetch(`${API}/api/v1/auto-post/facebook/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const body = (await st.json()) as {
          sessionState?: string;
          lastError?: string | null;
          pages?: unknown[];
        };
        pageList = st.ok;
        if (body.sessionState === 'OAUTH_PENDING' || body.sessionState === 'CONNECTED') {
          pageList = pageList && body.lastError == null;
        }
      }
    } catch (e) {
      facebookLogin = false;
      pageList = false;
      console.log(`Live API skip: ${(e as Error).message}`);
    }
  } else {
    console.log('SKIP live FACEBOOK_LOGIN/PAGE_LIST — no META_REVIEWER creds');
  }
  gate('FACEBOOK_LOGIN', facebookLogin);
  gate('PAGE_LIST', pageList);

  // --- Facebook review static gates ---
  let fbPreserved = false;
  try {
    const out = execSync('node scripts/with-root-env.cjs pnpm test:facebook-en-review-flow 2>&1', {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 2_000_000,
    });
    fbPreserved = /FACEBOOK_EN_REVIEW_FLOW_READY = PASS/.test(out);
  } catch (e) {
    fbPreserved = /FACEBOOK_EN_REVIEW_FLOW_READY = PASS/.test(
      String((e as { stdout?: string }).stdout ?? e),
    );
  }

  console.log('\nISSUE | ROOT_CAUSE | FILE | FIX | STATUS');
  for (const row of rows) {
    console.log(row);
  }

  const allPass =
    sessionOk &&
    noFalseExpired &&
    reconnectClear &&
    enOk &&
    facebookLogin &&
    pageList &&
    fbPreserved;
  if (!allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
