'use strict';
/**
 * Emit PG* exports for pg_dump. Never uses PgBouncer (6432).
 * Consumed via: eval "$(node scripts/lib/pg-dump-env.cjs)"
 */
function parse() {
  const direct = process.env.BACKUP_DATABASE_URL || '';
  const raw = direct || process.env.DATABASE_URL || '';
  const host = process.env.BACKUP_PG_HOST || process.env.POSTGRES_HOST || '';
  const portEnv = process.env.BACKUP_PG_PORT || process.env.POSTGRES_PORT || '';
  const user = process.env.BACKUP_PG_USER || process.env.POSTGRES_USER || 'marketingspa';
  const database = process.env.BACKUP_PG_DB || process.env.POSTGRES_DB || 'marketingspa';
  const password = process.env.BACKUP_PG_PASSWORD || process.env.POSTGRES_PASSWORD || '';

  let out = {
    host: host || '127.0.0.1',
    port: portEnv || '5434',
    user,
    database,
    password,
  };

  if (raw) {
    try {
      const u = new URL(raw);
      out = {
        host: host || u.hostname || '127.0.0.1',
        port: portEnv || u.port || '5432',
        user: process.env.BACKUP_PG_USER || process.env.POSTGRES_USER || decodeURIComponent(u.username || 'marketingspa'),
        database:
          process.env.BACKUP_PG_DB ||
          process.env.POSTGRES_DB ||
          decodeURIComponent((u.pathname || '/marketingspa').replace(/^\//, '').split('?')[0] || 'marketingspa'),
        password:
          password || decodeURIComponent(u.password || ''),
      };
    } catch {
      /* keep defaults */
    }
  }

  if (String(out.port) === '6432') {
    out.port = process.env.BACKUP_PG_PORT || '5434';
    if (out.host === '127.0.0.1' || out.host === 'localhost') {
      out.host = '127.0.0.1';
    }
  }

  const shell = (v) => `'${String(v ?? '').replace(/'/g, `'\\''`)}'`;
  process.stdout.write(
    [
      `export PGHOST=${shell(out.host)}`,
      `export PGPORT=${shell(out.port)}`,
      `export PGUSER=${shell(out.user)}`,
      `export PGDATABASE=${shell(out.database)}`,
      `export PGPASSWORD=${shell(out.password)}`,
    ].join('\n') + '\n',
  );
}

parse();
