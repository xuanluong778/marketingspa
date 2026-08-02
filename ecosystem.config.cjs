const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

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
]);

module.exports = {
  apps: [
    {
      name: 'api',
      script: '/var/www/marketingaut_usr75/data/.nvm/versions/node/v22.22.3/bin/npm',
      args: 'run start:prod',
      cwd: './apps/api',
      interpreter: '/var/www/marketingaut_usr75/data/.nvm/versions/node/v22.22.3/bin/node',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        // Clear polluted META_FACEBOOK_OAUTH_REDIRECT_URI inherited from PM2 daemon.
        // Auto Post uses META_AUTO_POST_REDIRECT_URI from .env instead.
        META_FACEBOOK_OAUTH_REDIRECT_URI: '',
        ...(rootEnv.AUTO_POST_OAUTH_CANARY
          ? { AUTO_POST_OAUTH_CANARY: rootEnv.AUTO_POST_OAUTH_CANARY }
          : {}),
        ...(rootEnv.AUTO_POST_OAUTH_CANARY_ORG_IDS
          ? { AUTO_POST_OAUTH_CANARY_ORG_IDS: rootEnv.AUTO_POST_OAUTH_CANARY_ORG_IDS }
          : {}),
        ...(rootEnv.OAUTH_CONNECTION
          ? { OAUTH_CONNECTION: rootEnv.OAUTH_CONNECTION }
          : {}),
      },
      out_file: '../logs/api.out.log',
      error_file: '../logs/api.err.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'worker',
      script: '/var/www/marketingaut_usr75/data/.nvm/versions/node/v22.22.3/bin/npm',
      args: 'run start',
      cwd: './apps/worker',
      interpreter: '/var/www/marketingaut_usr75/data/.nvm/versions/node/v22.22.3/bin/node',
      env: {
        NODE_ENV: 'production',
        PATH:
          '/var/www/marketingaut_usr75/data/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:/bin',
        YT_DLP_NODE_PATH: '/var/www/marketingaut_usr75/data/.nvm/versions/node/v22.22.3/bin/node',
        YT_DLP_REMOTE_COMPONENTS: 'ejs:github',
      },
      out_file: '../logs/worker.out.log',
      error_file: '../logs/worker.err.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'web',
      script: 'npx',
      args: 'next start -p 3002',
      cwd: './apps/web',
      env: {
        NODE_ENV: 'production'
      },
      out_file: '../logs/web.out.log',
      error_file: '../logs/web.err.log',
      merge_logs: true,
      time: true
    }
  ]
};
