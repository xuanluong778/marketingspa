#!/usr/bin/env node
/**
 * Meta reviewer forced English UI — static + live API checks.
 *
 *   pnpm test:meta-reviewer-ui-locale
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const WEB = path.join(ROOT, 'apps/web/src');
const API = path.join(ROOT, 'apps/api/src');

function read(base: string, rel: string): string {
  return fs.readFileSync(path.join(base, rel), 'utf8');
}

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function liveLoginCheck(): Promise<boolean> {
  const email = (process.env.META_REVIEWER_EMAIL ?? '').trim();
  const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    gate('LIVE_REVIEWER_LOGIN', true, 'SKIP — no META_REVIEWER_EMAIL/PASSWORD');
    return true;
  }
  const base = (process.env.API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
  const loginUrl = `${base}/api/v1/auth/login`;
  try {
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      gate('LIVE_REVIEWER_LOGIN', false, `HTTP ${res.status}`);
      return false;
    }
    const data = (await res.json()) as { user?: { uiLocale?: string; forceUiLocale?: boolean } };
    const ok =
      data.user?.uiLocale === 'en' && data.user?.forceUiLocale === true;
    gate('LIVE_REVIEWER_LOGIN', ok, JSON.stringify(data.user));
    return ok;
  } catch (e) {
    gate('LIVE_REVIEWER_LOGIN', false, String(e));
    return false;
  }
}

async function main() {
  const auth = read(API, 'auth/auth.service.ts');
  const meta = read(WEB, 'lib/meta-reviewer-ui-locale.ts');
  const sync = read(WEB, 'components/i18n/locale-sync.tsx');
  const urlSync = read(WEB, 'components/i18n/locale-url-sync.tsx');
  const bridge = read(WEB, 'components/i18n/locale-persist-bridge.tsx');
  const fb = read(WEB, 'lib/facebook-review-locale.ts');
  const useAuth = read(WEB, 'hooks/use-auth.ts');
  const settings = read(WEB, 'components/settings/settings-language-panel.tsx');
  const types = read(WEB, 'types/api.ts');

  const checks = [
    gate('API_FORCE_EN', auth.includes('forceUiLocale: true') && auth.includes("uiLocale: 'en'")),
    gate('FE_FORCE_HELPER', meta.includes('isForcedEnglishUiUser')),
    gate('FE_TYPE', types.includes('forceUiLocale')),
    gate('LOCALE_SYNC', sync.includes('isForcedEnglishUiUser')),
    gate('URL_SYNC', urlSync.includes('isForcedEnglishUiUser')),
    gate('PERSIST_BRIDGE', bridge.includes("locale !== 'en'")),
    gate('FB_REVIEW_LOCALE', fb.includes('forcedEn')),
    gate('LOGIN_APPLY', useAuth.includes('applyLoginUiLocale')),
    gate('LOGOUT_RESET', useAuth.includes('resetUiLocaleOnLogout')),
    gate('SETTINGS_LOCK', settings.includes('lockedEnglish')),
  ];

  const liveOk = await liveLoginCheck();
  const allPass = checks.every(Boolean) && liveOk;
  if (!allPass) process.exit(1);
}

main();
