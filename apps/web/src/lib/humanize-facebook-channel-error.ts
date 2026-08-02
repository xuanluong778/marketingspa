/**
 * Humanize lỗi kênh Facebook cho USER (FE).
 * Khớp logic backend auto-post-user-facing-errors.ts.
 */

const FRIENDLY_MISSING_PERMISSION =
  'Bạn chưa cấp đủ quyền quản lý Fanpage. Vui lòng kết nối lại và cho phép các quyền được yêu cầu.';

const FRIENDLY_RECONNECT =
  'Phiên đăng nhập Facebook đã hết hạn hoặc bị thu hồi. Vui lòng kết nối lại Facebook.';

const FRIENDLY_NOT_READY = 'Kết nối Facebook chưa sẵn sàng. Vui lòng liên hệ hỗ trợ.';

const FRIENDLY_GENERIC =
  'Đã xảy ra lỗi khi kết nối Facebook. Vui lòng thử lại hoặc liên hệ hỗ trợ.';

export function humanizeFacebookChannelError(
  message: string | null | undefined,
  fallback = FRIENDLY_GENERIC,
): string {
  if (!message?.trim()) return fallback;
  const raw = message.trim();
  const m = raw.toLowerCase();

  if (
    m.includes('missing_permission') ||
    m.includes('pages_manage') ||
    m.includes('pages_show') ||
    m.includes('pages_read') ||
    m.includes('chưa cấp quyền') ||
    m.includes('thiếu quyền')
  ) {
    return FRIENDLY_MISSING_PERMISSION;
  }
  if (
    m.includes('needs_reconnect') ||
    m.includes('token') ||
    m.includes('hết hạn') ||
    m.includes('thu hồi')
  ) {
    return FRIENDLY_RECONNECT;
  }
  if (
    m.includes('oauth') ||
    m.includes('server_env') ||
    m.includes('allowlist') ||
    m.includes('config_id') ||
    m.includes('canary') ||
    m.includes('webhook') ||
    m.includes('meta_app') ||
    m.includes('restart api')
  ) {
    if (m.includes('server_env') || m.includes('allowlist')) {
      return 'Tính năng này chỉ dành cho quản trị viên hệ thống.';
    }
    if (m.includes('canary') || m.includes('chưa bật') || m.includes('config')) {
      return FRIENDLY_NOT_READY;
    }
  }
  if (m.includes('graph api') || m.includes('meta api') || m.includes('meta_api')) {
    return 'Không thể kết nối tới Facebook lúc này. Vui lòng thử lại sau.';
  }

  const cleaned = raw
    .replace(/NEEDS_RECONNECT:\s*/gi, '')
    .replace(/MISSING_PERMISSION:\s*/gi, '')
    .replace(/TOKEN_EXPIRED:\s*/gi, '')
    .replace(/\b(OAuth|SERVER_ENV|config_id|webhook|Graph API|API|token|pending)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned || /pages_/.test(cleaned) || /oauth|server_env|allowlist/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export function humanizeOAuthPagesStatus(
  status: string | undefined,
  message?: string | null,
): string {
  switch (status) {
    case 'MISSING_PERMISSION':
      return FRIENDLY_MISSING_PERMISSION;
    case 'TOKEN_EXPIRED':
      return FRIENDLY_RECONNECT;
    case 'NO_PENDING_OAUTH':
      return 'Chưa hoàn tất đăng nhập Facebook. Vui lòng bấm Kết nối lại Facebook.';
    case 'NO_PAGES':
      return 'Không tìm thấy Fanpage nào bạn được quản lý. Hãy kiểm tra quyền trên Facebook rồi kết nối lại.';
    case 'META_API_ERROR':
      return 'Không thể tải danh sách Fanpage từ Facebook lúc này. Vui lòng thử lại sau.';
    default:
      return humanizeFacebookChannelError(message, FRIENDLY_GENERIC);
  }
}
