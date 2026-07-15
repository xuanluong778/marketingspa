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
  { value: 'SPA_SALES', label: 'Bài bán hàng spa' },
  { value: 'BRAND_BUILDING', label: 'Bài xây dựng thương hiệu' },
  { value: 'CUSTOMER_FEEDBACK', label: 'Bài feedback khách hàng' },
  { value: 'PROMOTION', label: 'Bài khuyến mãi' },
  { value: 'BEAUTY_KNOWLEDGE', label: 'Bài kiến thức làm đẹp' },
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
}

export interface AutoPostFacebookStatus {
  connected: boolean;
  status: string;
  facebookUserName: string | null;
  pages: AutoPostFacebookPage[];
  tokenExpiresAt: string | null;
  lastError: string | null;
  connectionMode?: 'env' | 'oauth';
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
  status: AutoPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  facebookPostId: string | null;
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
  hashtags: '#spa #lamdep #chamsocda',
  cta: 'Inbox để được tư vấn miễn phí',
  caption: '',
  fanpageId: '',
  imageUrl: '',
  scheduledAt: '',
};

export function autoPostTypeLabel(type: AutoPostType): string {
  return AUTO_POST_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}
