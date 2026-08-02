/** Response chuẩn “Xem thông tin Fanpage” — không chứa token. */

/**
 * Mã lỗi chuẩn (App Review / SaaS).
 * Giữ alias cũ để FE cũ không gãy.
 */
export type FanpageDetailsErrorCode =
  | 'permission_missing'
  | 'permission_declined'
  | 'expired_token'
  | 'invalid_page_token'
  | 'wrong_page_id'
  | 'rate_limited'
  | 'NETWORK_ERROR'
  | 'META_API_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  /** @deprecated dùng permission_missing */
  | 'MISSING_PAGES_READ_ENGAGEMENT'
  /** @deprecated dùng expired_token */
  | 'TOKEN_EXPIRED'
  /** @deprecated dùng wrong_page_id / invalid_page_token */
  | 'PAGE_ACCESS_REVOKED'
  /** @deprecated dùng rate_limited */
  | 'META_RATE_LIMIT';

export interface FanpageDetailsPage {
  id: string;
  pageId: string;
  name: string;
  pictureUrl: string | null;
  category: string | null;
  about: string | null;
  website: string | null;
  link: string | null;
  followersCount: number | null;
  fanCount: number | null;
}

export interface FanpageDetailsPost {
  id: string;
  message: string | null;
  createdTime: string | null;
  permalinkUrl: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reactions: number | null;
}

export interface FanpageDetailsPermissions {
  pages_show_list: boolean;
  pages_read_engagement: boolean;
  pages_manage_posts: boolean;
}

export interface FanpageDetailsResponse {
  page: FanpageDetailsPage;
  recentPosts: FanpageDetailsPost[];
  permissions: FanpageDetailsPermissions;
  refreshedAt: string;
  warnings: string[];
  /** true nếu lấy từ cache (fresh hoặc stale) */
  cached?: boolean;
  /** true nếu đang dùng bản stale 24h (chỉ display — không dùng để xác minh quyền/publish) */
  stale?: boolean;
  /** Nguồn dữ liệu hiển thị */
  dataSource?: 'live' | 'cache' | 'stale';
  /** Token page đã được làm mới từ /me/accounts trong request này */
  pageTokenRefreshed?: boolean;
}

/** Chẩn đoán OAuth Fanpage — không chứa token. */
export interface FanpagePermissionsDiagnostics {
  loginConfigId: string | null;
  appId: string | null;
  connectionStatus: string | null;
  facebookUserId: string | null;
  facebookUserName: string | null;
  tokenType: 'user' | 'page' | 'env' | 'none';
  tokenUpdatedAt: string | null;
  tokenExpiresAt: string | null;
  scopesStored: string[];
  permissions: Array<{ permission: string; status: 'granted' | 'declined' | 'expired' | 'unknown' }>;
  granted: string[];
  declined: string[];
  missingRequired: string[];
  pages: Array<{
    id: string;
    pageId: string;
    pageName: string;
    tokenUpdatedAt: string | null;
  }>;
  pagesReadEngagement: 'granted' | 'declined' | 'missing' | 'unknown';
  checkedAt: string;
  source: 'live' | 'stored' | 'none';
}

export const FANPAGE_DETAILS_CACHE_TTL_MS = 4 * 60 * 1000; // 4 phút (trong khoảng 3–5)
export const FANPAGE_DETAILS_POST_LIMIT = 10;

/** Prefix chuẩn — luôn gồm org + fanpage + operation */
export const META_CACHE_OP_DETAILS = 'details' as const;
