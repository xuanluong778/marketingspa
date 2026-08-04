/**
 * Đổi lỗi kỹ thuật Auto Post Facebook sang ngôn ngữ dễ hiểu cho USER.
 * SUPER_ADMIN / allowlist vẫn có thể xem bản raw qua field riêng.
 */

const FRIENDLY_MISSING_PERMISSION =
  'Bạn chưa cấp đủ quyền quản lý Fanpage. Vui lòng kết nối lại và cho phép các quyền được yêu cầu.';

const FRIENDLY_RECONNECT =
  'Phiên đăng nhập Facebook đã hết hạn hoặc bị thu hồi. Vui lòng kết nối lại Facebook.';

const FRIENDLY_NOT_READY =
  'Kết nối Facebook chưa sẵn sàng. Vui lòng liên hệ hỗ trợ.';

const FRIENDLY_GENERIC =
  'Đã xảy ra lỗi khi kết nối Facebook. Vui lòng thử lại hoặc liên hệ hỗ trợ.';

/**
 * @param fallback — mặc định FRIENDLY_GENERIC khi dùng cho exception message.
 *   Truyền `null` khi map `lastError` trên status (không bịa lỗi khi DB null).
 */
export function humanizeAutoPostFacebookError(
  message: string | null | undefined,
  fallback: string | null = FRIENDLY_GENERIC,
): string | null {
  if (!message?.trim()) return fallback;
  const raw = message.trim();
  const m = raw.toLowerCase();

  if (
    m.includes('missing_permission') ||
    m.includes('pages_manage_posts') ||
    m.includes('pages_show_list') ||
    m.includes('pages_read_engagement') ||
    m.includes('chưa cấp quyền') ||
    m.includes('thiếu quyền')
  ) {
    return FRIENDLY_MISSING_PERMISSION;
  }

  if (
    m.includes('needs_reconnect') ||
    m.includes('token_expired') ||
    m.includes('token facebook') ||
    m.includes('hết hạn') ||
    m.includes('thu hồi') ||
    m.includes('session') ||
    /\b190\b/.test(m) ||
    /\b467\b/.test(m)
  ) {
    return FRIENDLY_RECONNECT;
  }

  if (
    m.includes('oauth_connection') ||
    m.includes('chưa bật') ||
    m.includes('canary') ||
    m.includes('meta_login_config') ||
    m.includes('config_id') ||
    m.includes('invalid scopes') ||
    m.includes('meta_app_id') ||
    m.includes('meta_app_secret') ||
    m.includes('seoauto')
  ) {
    return FRIENDLY_NOT_READY;
  }

  if (m.includes('server_env') || m.includes('allowlist') || m.includes('meta_fanpage_allowed')) {
    return 'Tính năng này chỉ dành cho quản trị viên hệ thống.';
  }

  if (m.includes('meta_api') || m.includes('graph api') || m.includes('oauthexception')) {
    return 'Không thể kết nối tới Facebook lúc này. Vui lòng thử lại sau.';
  }

  if (m.includes('no_pending') || m.includes('chưa có phiên')) {
    return 'Chưa hoàn tất đăng nhập Facebook. Vui lòng bấm Kết nối lại Facebook.';
  }

  if (m.includes('no_pages') || m.includes('không tìm thấy fanpage')) {
    return 'Không tìm thấy Fanpage nào bạn được quản lý. Hãy kiểm tra quyền trên Facebook rồi kết nối lại.';
  }

  // Loại bỏ jargon còn sót
  const cleaned = raw
    .replace(/NEEDS_RECONNECT:\s*/gi, '')
    .replace(/MISSING_PERMISSION:\s*/gi, '')
    .replace(/TOKEN_EXPIRED:\s*/gi, '')
    .replace(/\b(OAuth|SERVER_ENV|config_id|webhook|Graph API|API|token|pending)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned || /pages_/.test(cleaned)) {
    return FRIENDLY_GENERIC;
  }
  return cleaned;
}

export function humanizeOAuthPagesStatusMessage(
  status: string,
  fallback?: string | null,
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
    case 'OK':
      return fallback?.trim() || '';
    default:
      return humanizeAutoPostFacebookError(fallback) ?? FRIENDLY_GENERIC;
  }
}
