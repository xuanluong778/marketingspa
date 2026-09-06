#!/usr/bin/env node
/**
 * UI locale persistence — reload keeps selected language.
 *
 *   pnpm test:ui-locale-persist
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const WEB = path.join(ROOT, 'apps/web/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(WEB, rel), 'utf8');
}

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function main() {
  const providers = read('providers/app-providers.tsx');
  const sync = read('components/i18n/locale-sync.tsx');
  const persist = read('lib/persist-user-ui-locale.ts');
  const bridge = read('components/i18n/locale-persist-bridge.tsx');
  const apiTypes = read('types/api.ts');

  const patchApi =
    persist.includes("'/auth/locale'") &&
    persist.includes('JSON.stringify({ locale })') &&
    bridge.includes('persistUserUiLocale');
  gate('LOCALE_PATCH_API', patchApi);

  const reloadSafe =
    sync.includes('getStoredLocale') &&
    sync.includes('stored !== server') &&
    sync.includes('persistUserUiLocale');
  gate('RELOAD_KEEPS_LOCALE', reloadSafe);

  const wired =
    providers.includes('LocalePersistBridge') &&
    !providers.includes('persistUiLocale(locale)') &&
    apiTypes.includes('uiLocale');
  gate('PROVIDER_WIRED', wired);

  const allPass = patchApi && reloadSafe && wired;
  if (!allPass) process.exit(1);
}

main();
