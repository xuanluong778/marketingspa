/** Canonical Facebook Fanpage OAuth session state for API + UI. */
export type FacebookSessionState =
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'OAUTH_PENDING';

export function resolveFacebookSessionState(input: {
  hasConnection: boolean;
  connectionStatus: string | null | undefined;
  pendingOAuthValid: boolean;
  isTokenExpired: boolean;
  apiStatus: string;
}): FacebookSessionState {
  if (input.pendingOAuthValid) return 'OAUTH_PENDING';
  if (!input.hasConnection) return 'DISCONNECTED';
  if (input.isTokenExpired || input.apiStatus === 'TOKEN_EXPIRED') return 'EXPIRED';
  if (input.apiStatus === 'NEEDS_RECONNECT') return 'REVOKED';
  if (
    input.connectionStatus === 'CONNECTED' &&
    !input.isTokenExpired &&
    input.apiStatus === 'CONNECTED'
  ) {
    return 'CONNECTED';
  }
  if (input.connectionStatus === 'DISCONNECTED') return 'DISCONNECTED';
  return 'DISCONNECTED';
}

/** Stale prep errors written during reconnect — not user-facing failures. */
export function isStaleFacebookReconnectError(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  const m = message.toLowerCase();
  return (
    m.includes('phiên oauth mới') ||
    m.includes('oauth session') ||
    m.includes('new oauth session') ||
    (m.includes('needs_reconnect') && m.includes('hoàn tất đăng nhập'))
  );
}

export function publicFacebookLastError(
  sessionState: FacebookSessionState,
  lastError: string | null | undefined,
  humanize: (msg: string | null | undefined, fallback: string | null) => string | null,
): string | null {
  if (!lastError?.trim() || isStaleFacebookReconnectError(lastError)) return null;
  if (sessionState === 'CONNECTED' || sessionState === 'OAUTH_PENDING') return null;
  if (sessionState === 'DISCONNECTED') return null;
  return humanize(lastError, null);
}
