export type AutoPostType =
  | 'SPA_SALES'
  | 'BRAND_BUILDING'
  | 'CUSTOMER_FEEDBACK'
  | 'PROMOTION'
  | 'BEAUTY_KNOWLEDGE'
  | 'OLD_CUSTOMER_CARE'
  | 'OPENING_EVENT'
  | 'INBOX_BOOKING';

export type AutoPostStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED';

export const AUTO_POST_TYPE_OPTIONS: { value: AutoPostType; label: string }[] = [
  { value: 'SPA_SALES', label: 'Bài bán hàng' },
  { value: 'BRAND_BUILDING', label: 'Bài xây dựng thương hiệu' },
  { value: 'CUSTOMER_FEEDBACK', label: 'Bài feedback khách hàng' },
  { value: 'PROMOTION', label: 'Bài khuyến mãi' },
  { value: 'BEAUTY_KNOWLEDGE', label: 'Bài kiến thức chuyên môn' },
  { value: 'OLD_CUSTOMER_CARE', label: 'Bài chăm sóc khách cũ' },
  { value: 'OPENING_EVENT', label: 'Bài khai trương/sự kiện' },
  { value: 'INBOX_BOOKING', label: 'Bài kéo inbox/đặt lịch' },
];

export const AUTO_POST_STATUS_LABELS: Record<AutoPostStatus, string> = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ duyệt',
  SCHEDULED: 'Đã lên lịch',
  PUBLISHING: 'Đang đăng',
  PUBLISHED: 'Đã đăng',
  FAILED: 'Lỗi',
  CANCELLED: 'Đã hủy',
};

export interface AutoPostFacebookPage {
  id: string;
  pageId: string;
  pageName: string;
  pagePictureUrl: string | null;
  tasks?: string[];
  canManagePosts?: boolean;
}

export type OAuthPagesStatus =
  | 'OK'
  | 'MISSING_PERMISSION'
  | 'NO_PAGES'
  | 'TOKEN_EXPIRED'
  | 'NO_PENDING_OAUTH'
  | 'META_API_ERROR';

export interface AutoPostOAuthPagesResponse {
  status: OAuthPagesStatus;
  facebookUserName: string | null;
  grantedScopes: string[];
  missingScopes: string[];
  requiredScopes: string[];
  pages: AutoPostFacebookPage[];
  message: string | null;
}

export interface AutoPostFacebookStatus {
  connected: boolean;
  status: string;
  needsReconnect?: boolean;
  facebookUserName: string | null;
  pages: AutoPostFacebookPage[];
  tokenExpiresAt: string | null;
  lastError: string | null;
  /** Chỉ SUPER_ADMIN / allowlist */
  lastErrorRaw?: string | null;
  connectionMode?: 'env' | 'oauth';
  scopes?: string[];
}

export interface AutoPostSelectPagesResult extends AutoPostFacebookStatus {
  success: boolean;
  connectedPages: Array<{ pageId: string; pageName: string }>;
  failedPages: Array<{ pageId: string; reason: string }>;
  warning: string | null;
  selectedPageIds?: string[];
  /** @deprecated dùng failedPages */
  failed?: Array<{ pageId: string; reason: string }>;
}

export interface AutoPostRefreshPagesResult extends AutoPostFacebookStatus {
  success: boolean;
  connectedPages: Array<{ pageId: string; pageName: string }>;
  failedPages: Array<{ pageId: string; reason: string }>;
  warning: string | null;
}

/** Chi tiết Fanpage (pages_read_engagement) — không chứa token. */
export type FanpageDetailsErrorCode =
  | 'permission_missing'
  | 'permission_declined'
  | 'expired_token'
  | 'invalid_page_token'
  | 'wrong_page_id'
  | 'rate_limited'
  | 'MISSING_PAGES_READ_ENGAGEMENT'
  | 'TOKEN_EXPIRED'
  | 'PAGE_ACCESS_REVOKED'
  | 'META_RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'META_API_ERROR';

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
  permissions: Array<{ permission: string; status: string }>;
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
  cached?: boolean;
  stale?: boolean;
  dataSource?: 'live' | 'cache' | 'stale';
}

export interface AutoPostPlatformStatus {
  aiConfigured: boolean;
  facebookConnectAvailable?: boolean;
  metaConfigured?: boolean;
  metaLoginConfigId?: boolean;
  metaLoginConfigIdValue?: string;
  metaAppId?: string | null;
  metaPageEnvConfigured?: boolean;
  canUseServerEnv?: boolean;
  oauthConnectionEnabled?: boolean;
  oauthCanary?: boolean;
  allowlistOrgCount?: number;
  currentOrgAllowlisted?: boolean;
  isSuperAdmin?: boolean;
}

export interface AutoPostItem {
  id: string;
  fanpageId: string | null;
  fanpagePageId: string | null;
  fanpageName: string | null;
  postType: AutoPostType;
  topic: string;
  caption: string;
  imageUrl: string | null;
  linkUrl: string | null;
  hashtags: string | null;
  cta: string | null;
  spaService: string | null;
  targetAudience: string | null;
  tone: string | null;
  promotion: string | null;
  industryId?: string | null;
  industryName?: string | null;
  customIndustry?: string | null;
  status: AutoPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  facebookPostId: string | null;
  facebookPostUrl?: string | null;
  errorMessage: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutoPostFormState {
  postType: AutoPostType;
  topic: string;
  spaService: string;
  targetAudience: string;
  tone: string;
  promotion: string;
  linkUrl: string;
  hashtags: string;
  cta: string;
  caption: string;
  fanpageId: string;
  imageUrl: string;
  scheduledAt: string;
}

export const defaultAutoPostFormState: AutoPostFormState = {
  postType: 'SPA_SALES',
  topic: '',
  spaService: '',
  targetAudience: 'Phụ nữ 25–45 tuổi quan tâm làm đẹp',
  tone: 'Thân thiện, tự nhiên',
  promotion: '',
  linkUrl: '',
  hashtags: '',
  cta: 'Inbox để được tư vấn miễn phí',
  caption: '',
  fanpageId: '',
  imageUrl: '',
  scheduledAt: '',
};

export function autoPostTypeLabel(type: AutoPostType): string {
  return AUTO_POST_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}
