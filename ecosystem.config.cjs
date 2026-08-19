const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const NODE_BIN = process.env.NODE_BIN_PATH || '/usr/bin';

/** Load selected keys from monorepo .env so PM2 restarts keep canary allowlist. */
function readRootEnvKeys(keys) {
  const envPath = resolve(__dirname, '.env');
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    if (!keys.includes(key)) continue;
    out[key] = trimmed.slice(i + 1).trim();
  }
  return out;
}

const rootEnv = readRootEnvKeys([
  'AUTO_POST_OAUTH_CANARY',
  'AUTO_POST_OAUTH_CANARY_ORG_IDS',
  'OAUTH_CONNECTION',
  'ASSISTANT_ENABLED',
  'ASSISTANT_CANARY',
  'ASSISTANT_CANARY_ORG_IDS',
]);

module.exports = {
  apps: [
    {
      name: 'dev-mkspa-api',
      script: 'node',
      args: 'dist/main',
      cwd: './apps/api',
      env: {
        NODE_ENV: 'production',
        PORT: 4010,
        META_FACEBOOK_OAUTH_REDIRECT_URI: '',
        ...rootEnv,
      },
      out_file: '../logs/dev-api.out.log',
      error_file: '../logs/dev-api.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'dev-mkspa-worker',
      script: 'node',
      args: 'dist/index.js',
      cwd: './apps/worker',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '../logs/dev-worker.out.log',
      error_file: '../logs/dev-worker.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'dev-mkspa-web',
      script: 'npx',
      args: 'next start -p 3020',
      cwd: './apps/web',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '../logs/dev-web.out.log',
      error_file: '../logs/dev-web.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
