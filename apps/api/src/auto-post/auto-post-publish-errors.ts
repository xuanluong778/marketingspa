/** Phân loại / làm sạch lỗi đăng bài Fanpage — không lộ token. */

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
    m.includes('token facebook đã hết hạn') ||
    m.includes('hết hạn') && m.includes('token') ||
    m.includes('oauthexception') && (m.includes('190') || m.includes('463') || m.includes('467')) ||
    m.includes('(#190)') ||
    m.includes('( #190)') ||
    m.includes('session has expired') ||
    m.includes('error validating access token') ||
    m.includes('permission') && (m.includes('pages_manage_posts') || m.includes('(#200)'))
  );
}

export function isTransientPublishError(message: string | null | undefined): boolean {
  if (!message) return true;
  if (isPermanentPublishError(message)) return false;
  const m = message.toLowerCase();
  return (
    m.includes('timeout') ||
    m.includes('etimedout') ||
    m.includes('econnreset') ||
    m.includes('econnrefused') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('429') ||
    m.includes('rate limit') ||
    m.includes('temporarily') ||
    m.includes('try again')
  );
}

export function mapPublishErrorCode(message: string): string | undefined {
  const m = message.toLowerCase();
  if (m.includes('needs_reconnect') || (m.includes('hết hạn') && m.includes('token'))) {
    return 'NEEDS_RECONNECT';
  }
  if (m.includes('missing_permission') || m.includes('pages_manage_posts')) {
    return 'MISSING_PERMISSION';
  }
  return undefined;
}

export function friendlyPublishError(raw: string): string {
  const safe = sanitizePublishErrorMessage(raw);
  const code = mapPublishErrorCode(safe);
  if (code === 'NEEDS_RECONNECT') {
    return 'NEEDS_RECONNECT: Token Facebook đã hết hạn — vui lòng kết nối lại Fanpage';
  }
  if (code === 'MISSING_PERMISSION') {
    return 'MISSING_PERMISSION: Thiếu quyền pages_manage_posts — kết nối lại và cấp đủ quyền';
  }
  return safe;
}

export function buildFacebookPostUrl(
  facebookPostId: string | null | undefined,
  pageId: string | null | undefined,
): string | null {
  if (!facebookPostId) return null;
  if (facebookPostId.includes('_')) {
    const [pid, storyId] = facebookPostId.split('_');
    const usePage = pageId || pid;
    if (usePage && storyId) {
      return `https://www.facebook.com/${usePage}/posts/${storyId}`;
    }
  }
  return `https://www.facebook.com/${facebookPostId}`;
}
