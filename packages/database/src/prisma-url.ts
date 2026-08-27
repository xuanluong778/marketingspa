/**
 * Normalize DATABASE_URL with safe Prisma pool caps.
 * Direct Postgres: connection_limit per process.
 * PgBouncer (transaction): also set pgbouncer=true.
 */
export function withPrismaPoolParams(
  rawUrl: string | undefined,
  opts?: {
    connectionLimit?: number;
    poolTimeout?: number;
    viaPgBouncer?: boolean;
  },
): string {
  const url = (rawUrl || '').trim();
  if (!url) return url;

  const limit =
    opts?.connectionLimit ??
    (Number(process.env.DATABASE_CONNECTION_LIMIT || 0) ||
      (process.env.PM2_APP_NAME === 'worker' || process.env.PROCESS_ROLE === 'worker'
        ? 8
        : 12));
  const poolTimeout =
    opts?.poolTimeout ?? (Number(process.env.DATABASE_POOL_TIMEOUT || 0) || 20);
  const viaPgBouncer =
    opts?.viaPgBouncer ??
    (process.env.DATABASE_VIA_PGBOUNCER === '1' ||
      /(?:^|[?&])pgbouncer=true(?:&|$)/i.test(url) ||
      /:6432\b/.test(url));

  try {
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', String(Math.max(2, Math.min(limit, 30))));
    }
    if (!u.searchParams.has('pool_timeout')) {
      u.searchParams.set('pool_timeout', String(Math.max(5, poolTimeout)));
    }
    if (viaPgBouncer && !u.searchParams.has('pgbouncer')) {
      u.searchParams.set('pgbouncer', 'true');
    }
    // Prefer schema=public if missing
    if (!u.searchParams.has('schema')) {
      u.searchParams.set('schema', 'public');
    }
    return u.toString();
  } catch {
    // URL with unusual protocol — append query conservatively
    const sep = url.includes('?') ? '&' : '?';
    let out = url;
    if (!/[?&]connection_limit=/.test(url)) {
      out += `${out.includes('?') ? '&' : sep}connection_limit=${limit}`;
    }
    if (!/[?&]pool_timeout=/.test(out)) {
      out += `&pool_timeout=${poolTimeout}`;
    }
    if (viaPgBouncer && !/[?&]pgbouncer=/.test(out)) {
      out += `&pgbouncer=true`;
    }
    return out;
  }
}

/** Apply pool params onto process.env.DATABASE_URL before PrismaClient construct. */
export function applyPrismaPoolEnv(opts?: Parameters<typeof withPrismaPoolParams>[1]): void {
  if (!process.env.DATABASE_URL) return;
  process.env.DATABASE_URL = withPrismaPoolParams(process.env.DATABASE_URL, opts);
}
