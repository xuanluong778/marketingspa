/**
 * Sentry placeholder cho Next.js frontend
 */
export function initSentry(): void {
  if (typeof window === 'undefined') return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[sentry] DSN not configured — skipping init (MVP placeholder)');
    }
    return;
  }
  console.log('[sentry] Placeholder — install @sentry/nextjs to enable');
}

export function captureException(error: unknown, context?: string): void {
  const label = context ? `[${context}]` : '';
  console.error(`[sentry]${label}`, error);
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  // TODO: Sentry.captureException(error);
}
