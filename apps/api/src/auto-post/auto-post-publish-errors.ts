/** Phân loại / làm sạch lỗi đăng bài Fanpage — không lộ token. */

const TOKEN_LEAK_RE =
  /\b(?:EAAG|EAAD|EAA|EBA|EAAE)[A-Za-z0-9_-]{10,}\b/gi;

export type MetaGraphErrorShape = {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
  fbtrace_id?: string;
  error_user_msg?: string;
  error_user_title?: string;
};

export function sanitizePublishErrorMessage(raw: string): string {
  return raw
    .replace(/access_token\s*=\s*[^\s&]+/gi, 'access_token=[redacted]')
    .replace(TOKEN_LEAK_RE, '[meta_token]')
    .slice(0, 500);
}

/** Ghép lỗi Meta đầy đủ (đã redact token) cho log / SUPER_ADMIN. */
export function formatMetaGraphErrorTechnical(err: MetaGraphErrorShape): string {
  const parts = [
    err.error_user_msg || err.message || 'Meta publish failed',
    err.code != null ? `#${err.code}` : null,
    err.error_subcode != null ? `subcode=${err.error_subcode}` : null,
    err.fbtrace_id ? `fbtrace=${err.fbtrace_id}` : null,
  ].filter(Boolean);
  return sanitizePublishErrorMessage(parts.join(' · '));
}

/** Thông báo dễ hiểu cho USER. */
export function formatMetaGraphErrorUserFacing(err: MetaGraphErrorShape): string {
  if (err.error_subcode === 1366046 || /cannot.*image|không thể.*ảnh|file jpg/i.test(err.error_user_msg || err.message || '')) {
    return 'Không đăng được ảnh: đường dẫn phải là file ảnh trực tiếp (JPG/PNG/GIF/WebP), không phải trang web. Hãy sửa ô URL ảnh hoặc để trống và dùng liên kết.';
  }
  if (err.error_user_msg?.trim()) {
    return sanitizePublishErrorMessage(err.error_user_msg.trim());
  }
  if (/invalid parameter/i.test(err.message || '')) {
    return 'Tham số đăng bài không hợp lệ. Kiểm tra URL ảnh/liên kết và nội dung rồi thử lại.';
  }
  return sanitizePublishErrorMessage(err.message || 'Đăng bài Facebook thất bại');
}

export function isPermanentPublishError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('needs_reconnect') ||
    m.includes('missing_permission') ||
    (m.includes('hết hạn') && m.includes('token')) ||
    m.includes('token facebook đã hết hạn') ||
    (m.includes('oauthexception') && (m.includes('190') || m.includes('463') || m.includes('467'))) ||
    m.includes('(#190)') ||
    m.includes('session has expired') ||
    m.includes('error validating access token') ||
    (m.includes('permission') && (m.includes('pages_manage_posts') || m.includes('(#200)'))) ||
    m.includes('url ảnh phải') ||
    m.includes('1366046')
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

export function friendlyPublishError(raw: string, opts?: { technical?: boolean }): string {
  const safe = sanitizePublishErrorMessage(raw);
  const code = mapPublishErrorCode(safe);
  if (code === 'NEEDS_RECONNECT') {
    return opts?.technical
      ? safe
      : 'Phiên đăng nhập Facebook đã hết hạn. Vui lòng kết nối lại Fanpage.';
  }
  if (code === 'MISSING_PERMISSION') {
    return opts?.technical
      ? safe
      : 'Bạn chưa cấp đủ quyền quản lý Fanpage. Vui lòng kết nối lại và cho phép các quyền được yêu cầu.';
  }
  if (/invalid parameter|1366046|url ảnh phải/i.test(safe)) {
    return opts?.technical
      ? safe
      : formatMetaGraphErrorUserFacing({ message: safe, error_subcode: 1366046 });
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
      // permalink.php ổn định hơn /{pageId}/posts/{storyId} (page id công khai có thể khác Graph id)
      return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(storyId)}&id=${encodeURIComponent(usePage)}`;
    }
  }
  if (/^https?:\/\//i.test(facebookPostId)) return facebookPostId;
  return `https://www.facebook.com/${facebookPostId}`;
}

