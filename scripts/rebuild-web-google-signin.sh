#!/usr/bin/env bash
set -euo pipefail
ROOT=/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247
cd "$ROOT"

echo "== check env =="
node scripts/with-root-env.cjs node <<'NODE'
const v = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
if (!v) {
  console.error('MISSING NEXT_PUBLIC_GOOGLE_CLIENT_ID');
  process.exit(1);
}
console.log('NEXT_PUBLIC_GOOGLE_CLIENT_ID SET len=' + v.length);
NODE

echo "== write apps/web/.env.production =="
node scripts/with-root-env.cjs node <<'NODE'
const fs = require('fs');
const path = require('path');
const cid = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
const api =
  (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
const lines = [`NEXT_PUBLIC_GOOGLE_CLIENT_ID=${cid}`];
if (api) lines.push(`NEXT_PUBLIC_API_URL=${api}`);
const out = path.join('apps/web/.env.production');
fs.writeFileSync(out, lines.join('\n') + '\n', { mode: 0o600 });
console.log('wrote', out);
for (const line of lines) console.log(line.split('=')[0] + '=***');
NODE

echo "== build web =="
node scripts/with-root-env.cjs pnpm --filter @marketingspa/web build

echo "== verify bake =="
node scripts/with-root-env.cjs node <<'NODE'
const { execSync } = require('child_process');
const cid = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
try {
  execSync(`rg -q --fixed-strings "${cid}" apps/web/.next/static -g '*.js'`, {
    stdio: 'inherit',
  });
  console.log('VERIFY: CLIENT_ID baked into .next/static — OK');
} catch {
  console.error('VERIFY FAIL: CLIENT_ID not found in client bundle');
  process.exit(1);
}
NODE

echo "== chown + restart =="
chown -R marketingaut_usr:marketingaut_usr apps/web/.next apps/web/.env.production
pm2 restart web --update-env
sleep 3
curl -s -o /dev/null -w "web_login:%{http_code}\n" http://127.0.0.1:3002/login
pm2 list
echo DONE
