"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSentry = initSentry;
exports.captureException = captureException;
/**
 * Sentry placeholder — không crash khi thiếu DSN.
 * Cài @sentry/node và bỏ comment khi deploy production.
 */
function initSentry() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        console.log('[sentry] DSN not configured — skipping init (MVP placeholder)');
        return;
    }
    console.log('[sentry] Placeholder ready — install @sentry/node to enable capture');
}
function captureException(error, context) {
    const label = context ? `[${context}]` : '';
    if (error instanceof Error) {
        console.error(`[sentry]${label} ${error.message}`, error.stack);
    }
    else {
        console.error(`[sentry]${label}`, error);
    }
    if (!process.env.SENTRY_DSN)
        return;
    // TODO: Sentry.captureException(error);
}
