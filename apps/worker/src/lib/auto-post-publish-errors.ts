/** Mirror API publish-error helpers for worker (no Nest deps). */

const TOKEN_LEAK_RE =
  /\b(?:EAAG|EAAD|EAA|EBA|EAAE)[A-Za-z0-9_-]{10,}\b/gi;

export function sanitizePublishErrorMessage(raw: string): string {
  return raw
    .replace(/access_token\s*=\s*[^\s&]+/gi, 'access_token=[redacted]')
    .replace(TOKEN_LEAK_RE, '[meta_token]')
    .slice(0, 400);
}

export function isPermanentPublishError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('needs_reconnect') ||
    m.includes('missing_permission') ||
    (m.includes('hết hạn') && m.includes('token')) ||
    m.includes('session has expired') ||
    m.includes('error validating access token') ||
    m.includes('(#190)') ||
    (m.includes('permission') && m.includes('pages_manage_posts'))
  );
}

export function friendlyPublishError(raw: string): string {
  const safe = sanitizePublishErrorMessage(raw);
  const m = safe.toLowerCase();
  if (m.includes('needs_reconnect') || (m.includes('hết hạn') && m.includes('token'))) {
    return 'NEEDS_RECONNECT: Token Facebook đã hết hạn — vui lòng kết nối lại Fanpage';
  }
  if (m.includes('missing_permission') || m.includes('pages_manage_posts')) {
    return 'MISSING_PERMISSION: Thiếu quyền pages_manage_posts — kết nối lại và cấp đủ quyền';
  }
  return safe;
}
