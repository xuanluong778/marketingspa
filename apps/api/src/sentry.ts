/**
 * Sentry placeholder — không crash khi thiếu DSN.
 * Cài @sentry/node và bỏ comment khi deploy production.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] DSN not configured — skipping init (MVP placeholder)');
    return;
  }
  console.log('[sentry] Placeholder ready — install @sentry/node to enable capture');
}

export function captureException(error: unknown, context?: string): void {
  const label = context ? `[${context}]` : '';
  if (error instanceof Error) {
    console.error(`[sentry]${label} ${error.message}`, error.stack);
  } else {
    console.error(`[sentry]${label}`, error);
  }
  if (!process.env.SENTRY_DSN) return;
  // TODO: Sentry.captureException(error);
}
