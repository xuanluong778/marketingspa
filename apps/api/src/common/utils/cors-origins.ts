/**
 * Resolve allowlisted browser origins for credentialed CORS.
 * Never reflect arbitrary Origin.
 */
export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromList = (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const singles = [
    env.APP_URL,
    env.NEXT_PUBLIC_APP_URL,
    env.WEB_URL,
    env.DOMAIN ? `https://${env.DOMAIN.replace(/^https?:\/\//, '')}` : '',
    'https://marketingautoaz.com',
    'https://www.marketingautoaz.com',
  ]
    .map((s) => (s || '').trim().replace(/\/$/, ''))
    .filter(Boolean);

  const dev =
    env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://127.0.0.1:3002'];

  return [...new Set([...fromList, ...singles, ...dev])];
}

export function isCorsOriginAllowed(origin: string | undefined, allowlist: string[]): boolean {
  if (!origin) return false;
  const o = origin.replace(/\/$/, '');
  return allowlist.some((a) => a === o);
}
