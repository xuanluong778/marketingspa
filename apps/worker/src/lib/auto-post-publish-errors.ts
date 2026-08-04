/** Mirror API publish-errors — worker. Không lộ token. */

const TOKEN_LEAK_RE = /\b(?:EAAG|EAAD|EAA|EBA|EAAE)[A-Za-z0-9_-]{10,}\b/gi;

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

export function formatMetaGraphErrorTechnical(err: MetaGraphErrorShape): string {
  const parts = [
    err.error_user_msg || err.message || 'Meta publish failed',
    err.code != null ? `#${err.code}` : null,
    err.error_subcode != null ? `subcode=${err.error_subcode}` : null,
    err.fbtrace_id ? `fbtrace=${err.fbtrace_id}` : null,
  ].filter(Boolean);
  return sanitizePublishErrorMessage(parts.join(' · '));
}

export function formatMetaGraphErrorUserFacing(err: MetaGraphErrorShape): string {
  if (
    err.error_subcode === 1366046 ||
    /cannot.*image|không thể.*ảnh|file jpg/i.test(err.error_user_msg || err.message || '')
  ) {
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
    (m.includes('oauthexception') &&
      (m.includes('190') || m.includes('463') || m.includes('467'))) ||
    m.includes('(#190)') ||
    m.includes('session has expired') ||
    m.includes('error validating access token') ||
    (m.includes('permission') && (m.includes('pages_manage_posts') || m.includes('(#200)'))) ||
    m.includes('url ảnh phải') ||
    m.includes('1366046')
  );
}

export function friendlyPublishError(raw: string): string {
  const safe = sanitizePublishErrorMessage(raw);
  if (/needs_reconnect|hết hạn.*token|token.*hết hạn/i.test(safe)) {
    return 'Phiên đăng nhập Facebook đã hết hạn. Vui lòng kết nối lại Fanpage.';
  }
  if (/missing_permission|pages_manage_posts/i.test(safe)) {
    return 'Bạn chưa cấp đủ quyền quản lý Fanpage. Vui lòng kết nối lại và cho phép các quyền được yêu cầu.';
  }
  if (/invalid parameter|1366046|url ảnh phải/i.test(safe)) {
    return formatMetaGraphErrorUserFacing({ message: safe, error_subcode: 1366046 });
  }
  return safe;
}
