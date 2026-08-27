const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const NODE_HOME =
  '/var/www/marketingaut_usr/data/.nvm/versions/node/v22.22.3';
const NODE_BIN = `${NODE_HOME}/bin`;

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
  'DATABASE_URL',
  'REDIS_URL',
  'ALERT_WEBHOOK_URL',
  'ALERT_EMAIL_TO',
  'SLACK_WEBHOOK_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'PLATFORM_SUPER_ADMIN_EMAIL',
  'BACKUP_DIR',
  'BACKUP_RETENTION_DAYS',
  'BACKUP_R2_BUCKET',
  'BACKUP_R2_ENDPOINT',
  'BACKUP_R2_ACCESS_KEY_ID',
  'BACKUP_R2_SECRET_ACCESS_KEY',
  'BACKUP_R2_REQUIRED',
  'BACKUP_ENCRYPTION_KEY_FILE',
  'BACKUP_OFFSITE_REQUIRED',
  'BACKUP_SSH_HOST',
  'BACKUP_SSH_USER',
  'BACKUP_SSH_PATH',
  'BACKUP_IMAP_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
]);

/** @param {boolean} [viaPgBouncer=true] Force host apps through 127.0.0.1:6432 */
function withPool(url, limit, viaPgBouncer = true) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const viaPb =
      viaPgBouncer ||
      process.env.DATABASE_VIA_PGBOUNCER === '1' ||
      u.port === '6432';
    if (viaPb) {
      u.hostname = '127.0.0.1';
      u.port = '6432';
      u.searchParams.set('pgbouncer', 'true');
    }
    u.searchParams.set('connection_limit', String(limit));
    u.searchParams.set('pool_timeout', '20');
    if (!u.searchParams.has('schema')) u.searchParams.set('schema', 'public');
    return u.toString();
  } catch {
    return url;
  }
}

function pickEnv(keys) {
  const out = {};
  for (const k of keys) {
    if (rootEnv[k]) out[k] = rootEnv[k];
  }
  return out;
}

const LOG_ROTATE = {
  merge_logs: true,
  time: true,
  max_size: '20M',
  retain: 7,
  compress: true,
  min_uptime: '10s',
  max_restarts: 20,
  exp_backoff_restart_delay: 200,
};

const BACKUP_ENV = {
  BACKUP_DIR:
    rootEnv.BACKUP_DIR || '/var/www/marketingaut_usr/data/backups/postgres',
  BACKUP_RETENTION_DAYS: rootEnv.BACKUP_RETENTION_DAYS || '21',
  BACKUP_PG_HOST: '127.0.0.1',
  BACKUP_PG_PORT: '5434',
  BACKUP_ENCRYPTION_KEY_FILE:
    rootEnv.BACKUP_ENCRYPTION_KEY_FILE ||
    '/var/www/marketingaut_usr/data/backups/.backup-key',
  BACKUP_OFFSITE_REQUIRED: rootEnv.BACKUP_OFFSITE_REQUIRED || '1',
  ...(rootEnv.DATABASE_URL ? { BACKUP_DATABASE_URL: rootEnv.DATABASE_URL } : {}),
  ...pickEnv([
    'ALERT_WEBHOOK_URL',
    'ALERT_EMAIL_TO',
    'SLACK_WEBHOOK_URL',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'PLATFORM_SUPER_ADMIN_EMAIL',
    'BACKUP_R2_BUCKET',
    'BACKUP_R2_ENDPOINT',
    'BACKUP_R2_ACCESS_KEY_ID',
    'BACKUP_R2_SECRET_ACCESS_KEY',
    'BACKUP_R2_REQUIRED',
    'BACKUP_SSH_HOST',
    'BACKUP_SSH_USER',
    'BACKUP_SSH_PATH',
    'BACKUP_IMAP_HOST',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ]),
};

const API_INSTANCES = 2;
const API_PRISMA_POOL = 6;
const WORKER_PRISMA_POOL = 8;

module.exports = {
  apps: [
    {
      name: 'api',
      script: 'dist/main.js',
      cwd: './apps/api',
      interpreter: `${NODE_BIN}/node`,
      exec_mode: 'cluster',
      instances: API_INSTANCES,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 4000,
        PATH: `${NODE_BIN}:/usr/local/bin:/usr/bin:/bin`,
        DATABASE_CONNECTION_LIMIT: String(API_PRISMA_POOL),
        DATABASE_VIA_PGBOUNCER: '1',
        PROCESS_ROLE: 'api',
        SOCKET_REDIS_ADAPTER: '1',
        ...(rootEnv.REDIS_URL ? { REDIS_URL: rootEnv.REDIS_URL } : {}),
        ...(rootEnv.DATABASE_URL
          ? { DATABASE_URL: withPool(rootEnv.DATABASE_URL, API_PRISMA_POOL) }
          : {}),
        // Clear polluted META_FACEBOOK_OAUTH_REDIRECT_URI inherited from PM2 daemon.
        // Auto Post uses META_AUTO_POST_REDIRECT_URI from .env instead.
        META_FACEBOOK_OAUTH_REDIRECT_URI: '',
        FEATURE_MARKETING_AUTOPILOT: 'true',
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
      ...LOG_ROTATE,
    },
    {
      name: 'worker',
      script: `${NODE_BIN}/npm`,
      args: 'run start',
      cwd: './apps/worker',
      interpreter: `${NODE_BIN}/node`,
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PATH: `${NODE_BIN}:/usr/local/bin:/usr/bin:/bin`,
        PROCESS_ROLE: 'worker',
        DATABASE_CONNECTION_LIMIT: String(WORKER_PRISMA_POOL),
        DATABASE_VIA_PGBOUNCER: '1',
        WORKER_SINGLETON_GUARD: '1',
        YT_DLP_NODE_PATH: `${NODE_BIN}/node`,
        YT_DLP_REMOTE_COMPONENTS: 'ejs:github',
        ...(rootEnv.DATABASE_URL
          ? { DATABASE_URL: withPool(rootEnv.DATABASE_URL, WORKER_PRISMA_POOL) }
          : {}),
        ...BACKUP_ENV,
      },
      out_file: '../logs/worker.out.log',
      error_file: '../logs/worker.err.log',
      ...LOG_ROTATE,
    },
    {
      name: 'web',
      script: `${NODE_BIN}/npx`,
      args: 'next start -H 127.0.0.1 -p 3002',
      cwd: './apps/web',
      interpreter: `${NODE_BIN}/node`,
      env: {
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
        PATH: `${NODE_BIN}:/usr/local/bin:/usr/bin:/bin`,
      },
      out_file: '../logs/web.out.log',
      error_file: '../logs/web.err.log',
      ...LOG_ROTATE,
    },
  ],
};
