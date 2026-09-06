import type { AutoPostFacebookStatus } from '@/types/auto-post';

export type FacebookSessionState =
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'OAUTH_PENDING';

/** Only show expired/revoked/permission errors — never alongside OAuth success UI. */
export function shouldShowFacebookSessionError(
  fbStatus: AutoPostFacebookStatus | null | undefined,
  ctx: {
    selectionMode?: boolean;
    facebookParam?: string | null;
    hasSuccessMsg?: boolean;
    hasErrorMsg?: boolean;
  },
): boolean {
  if (!fbStatus?.lastError?.trim()) return false;
  if (ctx.hasErrorMsg || ctx.hasSuccessMsg) return false;
  if (ctx.selectionMode || ctx.facebookParam === 'oauth_connected') return false;

  const state = (fbStatus.sessionState ?? fbStatus.status ?? '').toUpperCase();
  if (state === 'CONNECTED' || state === 'OAUTH_PENDING') return false;
  if (state === 'DISCONNECTED') return false;
  return (
    state === 'EXPIRED' ||
    state === 'REVOKED' ||
    state === 'NEEDS_RECONNECT' ||
    state === 'TOKEN_EXPIRED' ||
    state === 'MISSING_PERMISSION'
  );
}
