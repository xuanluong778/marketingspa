/**
 * Structured Google Ads API error parsing + user guidance.
 * Never include tokens/secrets in messages or logs.
 */

export type GoogleAdsErrorClassification =
  | 'permission'
  | 'auth'
  | 'rate_limit'
  | 'two_factor'
  | 'not_found'
  | 'developer_token'
  | 'customer'
  | 'other';

export type GoogleAdsParsedError = {
  httpStatus: number;
  rpcStatus: string | null;
  /** e.g. USER_PERMISSION_DENIED, DEVELOPER_TOKEN_NOT_APPROVED */
  errorCode: string | null;
  message: string;
  requestId: string | null;
  guidance: string;
  classification: GoogleAdsErrorClassification;
};

type GoogleAdsFailureDetail = {
  '@type'?: string;
  requestId?: string;
  reason?: string;
  errors?: Array<{
    errorCode?: Record<string, string>;
    message?: string;
  }>;
};

type GoogleErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: GoogleAdsFailureDetail[];
  };
};

function extractAdsErrorCode(details: GoogleAdsFailureDetail[] | undefined): string | null {
  for (const d of details ?? []) {
    if (typeof d.reason === 'string' && d.reason.trim()) return d.reason.trim();
    for (const err of d.errors ?? []) {
      const codes = err.errorCode ?? {};
      for (const v of Object.values(codes)) {
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
  }
  return null;
}

function extractAdsMessage(details: GoogleAdsFailureDetail[] | undefined, fallback: string): string {
  for (const d of details ?? []) {
    for (const err of d.errors ?? []) {
      if (err.message?.trim()) return err.message.trim();
    }
  }
  return fallback;
}

function extractRequestId(
  details: GoogleAdsFailureDetail[] | undefined,
  header: string | null | undefined,
): string | null {
  const fromHeader = header?.trim();
  if (fromHeader) return fromHeader;
  for (const d of details ?? []) {
    if (d.requestId?.trim()) return d.requestId.trim();
  }
  return null;
}

export function guidanceForGoogleAdsErrorCode(
  errorCode: string | null,
  rpcStatus: string | null,
  httpStatus: number,
  message?: string | null,
): { guidance: string; classification: GoogleAdsErrorClassification } {
  const code = (errorCode ?? '').toUpperCase();
  const rpc = (rpcStatus ?? '').toUpperCase();
  const msg = (message ?? '').toLowerCase();

  if (
    code === 'SERVICE_DISABLED' ||
    msg.includes('has not been used in project') ||
    msg.includes('it is disabled') ||
    (msg.includes('googleads.googleapis.com') && msg.includes('enable'))
  ) {
    const urlMatch = (message ?? '').match(/https:\/\/console\.developers\.google\.com[^\s]+/);
    return {
      classification: 'developer_token',
      guidance: urlMatch
        ? `Google Ads API chưa được bật trên GCP project của OAuth client. Mở và Enable API: ${urlMatch[0]} — đợi vài phút rồi Thử lại / Kết nối lại Google.`
        : 'Google Ads API chưa được bật trên GCP project gắn với OAuth Client ID. Vào Google Cloud Console → APIs & Services → Enable “Google Ads API”, đợi vài phút rồi Thử lại.',
    };
  }

  if (
    code.includes('TWO_STEP') ||
    code === 'TWO_STEP_VERIFICATION_NOT_ENROLLED' ||
    rpc.includes('TWO_STEP')
  ) {
    return {
      classification: 'two_factor',
      guidance: 'Bật xác minh 2 bước (2FA) trên tài khoản Google dùng để kết nối, rồi Kết nối lại Google.',
    };
  }

  switch (code) {
    case 'USER_PERMISSION_DENIED':
      return {
        classification: 'permission',
        guidance:
          'Gmail OAuth chưa có quyền trên tài khoản Ads này. Thêm email đó vào Google Ads (Admin) hoặc chọn đúng tài khoản Google có quyền, rồi Kết nối lại Google.',
      };
    case 'NOT_ADS_USER':
      return {
        classification: 'permission',
        guidance:
          'Tài khoản Google chưa phải người dùng Google Ads. Đăng nhập Google Ads bằng đúng Gmail này hoặc mời Gmail vào một tài khoản Ads, rồi Kết nối lại.',
      };
    case 'CUSTOMER_NOT_ENABLED':
      return {
        classification: 'customer',
        guidance: 'Tài khoản Google Ads chưa được kích hoạt (Customer not enabled). Mở Google Ads và hoàn tất kích hoạt tài khoản.',
      };
    case 'CUSTOMER_NOT_FOUND':
      return {
        classification: 'customer',
        guidance: 'Không tìm thấy customer ID. Kiểm tra lại ID (chỉ số, bỏ dấu -) và quyền truy cập.',
      };
    case 'DEVELOPER_TOKEN_NOT_APPROVED':
      return {
        classification: 'developer_token',
        guidance:
          'Developer token chưa được Google phê duyệt (chỉ Test Account). Xin Basic/Standard Access trong Google Ads API Center, hoặc dùng tài khoản test.',
      };
    case 'DEVELOPER_TOKEN_PROHIBITED':
      return {
        classification: 'developer_token',
        guidance:
          'Developer token không được phép với GCP project hiện tại (đã gắn với MCC/project khác). Tạo Google Cloud project mới, bật Google Ads API, dùng OAuth client của project đó.',
      };
    case 'DEVELOPER_TOKEN_INVALID':
      return {
        classification: 'developer_token',
        guidance: 'Developer token không hợp lệ. Kiểm tra GOOGLE_ADS_DEVELOPER_TOKEN trong API Center của MCC.',
      };
    case 'OAUTH_TOKEN_INVALID':
    case 'OAUTH_TOKEN_EXPIRED':
    case 'NOT_AUTHENTICATED':
      return {
        classification: 'auth',
        guidance: 'OAuth token hết hạn hoặc không hợp lệ. Bấm Kết nối lại Google (scope adwords).',
      };
    case 'AUTHORIZATION_ERROR':
      return {
        classification: 'permission',
        guidance: 'Lỗi ủy quyền Google Ads. Kết nối lại Google với scope adwords và kiểm tra quyền trên MCC/customer.',
      };
    default:
      break;
  }

  if (httpStatus === 401 || rpc === 'UNAUTHENTICATED') {
    return {
      classification: 'auth',
      guidance: 'Chưa xác thực Google Ads. Kết nối lại Google với scope https://www.googleapis.com/auth/adwords.',
    };
  }
  if (httpStatus === 429 || rpc === 'RESOURCE_EXHAUSTED') {
    return {
      classification: 'rate_limit',
      guidance: 'Google Ads đang giới hạn tốc độ (rate limit). Đợi vài phút rồi Thử lại.',
    };
  }
  if (httpStatus === 404 || rpc === 'NOT_FOUND') {
    return {
      classification: 'not_found',
      guidance:
        'Endpoint/API version không tồn tại hoặc customer không tìm thấy. Kiểm tra GOOGLE_ADS_API_VERSION (khuyến nghị v22) và customer ID.',
    };
  }
  if (httpStatus === 403 || rpc === 'PERMISSION_DENIED') {
    return {
      classification: 'permission',
      guidance:
        'Bị từ chối quyền Google Ads. Kiểm tra: (1) bật Google Ads API trên GCP project của OAuth client, (2) scope adwords khi OAuth, (3) Gmail có quyền trên MCC/customer, (4) developer token khớp project, (5) login-customer-id (MCC, bỏ dấu -) khi truy cập tài khoản con.',
    };
  }

  return {
    classification: 'other',
    guidance: 'Xem mã lỗi Google Ads bên dưới; nếu cần, Kết nối lại Google hoặc kiểm tra developer token / quyền tài khoản.',
  };
}

export function parseGoogleAdsErrorResponse(input: {
  httpStatus: number;
  body: unknown;
  requestIdHeader?: string | null;
}): GoogleAdsParsedError {
  const body = (input.body ?? {}) as GoogleErrorBody;
  const details = body.error?.details;
  const rpcStatus = body.error?.status?.trim() || null;
  const errorCode = extractAdsErrorCode(details);
  const rawMessage = extractAdsMessage(
    details,
    (body.error?.message ?? `Google Ads error (${input.httpStatus})`).trim(),
  );
  const requestId = extractRequestId(details, input.requestIdHeader);
  const { guidance, classification } = guidanceForGoogleAdsErrorCode(
    errorCode,
    rpcStatus,
    input.httpStatus,
    rawMessage,
  );

  return {
    httpStatus: input.httpStatus,
    rpcStatus,
    errorCode,
    message: rawMessage.slice(0, 500),
    requestId,
    guidance,
    classification,
  };
}

/** User-facing one-liner (safe — no secrets). */
export function formatGoogleAdsUserMessage(parsed: GoogleAdsParsedError): string {
  const code = parsed.errorCode || parsed.rpcStatus || `HTTP_${parsed.httpStatus}`;
  return `Google Ads: ${code} — ${parsed.message.slice(0, 180)}`;
}

/** Safe log line — never pass tokens into this. */
export function formatGoogleAdsLogLine(parsed: GoogleAdsParsedError, apiVersion?: string): string {
  return [
    `http=${parsed.httpStatus}`,
    `rpc=${parsed.rpcStatus ?? '-'}`,
    `code=${parsed.errorCode ?? '-'}`,
    `requestId=${parsed.requestId ?? '-'}`,
    apiVersion ? `apiVersion=${apiVersion}` : null,
    `msg=${parsed.message.slice(0, 240)}`,
  ]
    .filter(Boolean)
    .join(' ');
}
