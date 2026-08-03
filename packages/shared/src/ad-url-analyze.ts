import { z } from 'zod';

export const AD_URL_ANALYZE_LIMITS = {
  maxRedirects: 3,
  maxHtmlBytes: 1_500_000,
  fetchTimeoutMs: 12_000,
  jobTimeoutMs: 90_000,
  rateLimitMax: 8,
  rateLimitWindowMs: 10 * 60 * 1000,
  orgRateLimitMax: 30,
  orgRateLimitWindowMs: 10 * 60 * 1000,
  redisTtlSeconds: 24 * 60 * 60,
  maxExtractChars: 12_000,
} as const;

export const AD_URL_ANALYZE_STAGES = [
  'queued',
  'validating',
  'fetching',
  'extracting',
  'analyzing',
  'completed',
  'failed',
  'cancelled',
] as const;

export type AdUrlAnalyzeStage = (typeof AD_URL_ANALYZE_STAGES)[number];

export const AD_URL_ANALYZE_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;

export type AdUrlAnalyzeStatus = (typeof AD_URL_ANALYZE_STATUSES)[number];

export const AD_URL_ANALYZE_STAGE_LABELS: Record<AdUrlAnalyzeStage, string> = {
  queued: 'Đang xếp hàng',
  validating: 'Kiểm tra URL',
  fetching: 'Tải trang công khai',
  extracting: 'Trích xuất nội dung',
  analyzing: 'AI phân tích & map form',
  completed: 'Hoàn tất',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

export const adUrlAnalyzeQueuePayloadSchema = z.object({
  jobId: z.string().uuid(),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  sourceUrl: z.string().url().max(2000),
  adPostKind: z.enum(['product', 'service']),
  brandName: z.string().max(200).optional(),
});

export type AdUrlAnalyzeQueuePayload = z.infer<typeof adUrlAnalyzeQueuePayloadSchema>;

export type AdUrlAnalyzeProductFields = {
  name?: string;
  category?: string;
  features?: string;
  benefits?: string;
  differentiators?: string;
  price?: string;
  warranty?: string;
  proof?: string;
  offer?: string;
};

export type AdUrlAnalyzeServiceFields = {
  name?: string;
  suitableCustomers?: string;
  problems?: string;
  process?: string;
  highlights?: string;
  expectedBenefits?: string;
  duration?: string;
  location?: string;
  experts?: string;
  proof?: string;
  offer?: string;
};

export type AdUrlAnalyzeFieldKey =
  | keyof AdUrlAnalyzeProductFields
  | keyof AdUrlAnalyzeServiceFields
  | 'brandName'
  | 'targetAudience'
  | 'painPoints'
  | 'benefits'
  | 'offer';

export type AdUrlAnalyzeSuggestion = {
  adPostKind: 'product' | 'service';
  brandName?: string;
  targetAudience?: string;
  painPoints?: string;
  benefits?: string;
  offer?: string;
  product?: AdUrlAnalyzeProductFields;
  service?: AdUrlAnalyzeServiceFields;
  /** Fields that had evidence in source (do not invent) */
  presentFields: string[];
  /** Fields intentionally left empty because source lacked evidence */
  omittedFields: string[];
  warnings: string[];
  pageTitle?: string;
  finalUrl?: string;
  confidence?: number;
};

export type AdUrlAnalyzeJobPublic = {
  id: string;
  organizationId: string;
  userId: string;
  status: AdUrlAnalyzeStatus;
  stage: AdUrlAnalyzeStage;
  stageLabel: string;
  progressPercent: number;
  sourceUrl: string;
  adPostKind: 'product' | 'service';
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: AdUrlAnalyzeSuggestion | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

/** Hosts we cannot reliably crawl (login walls / SPA / marketplace). */
export function detectUnsupportedCommerceHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const rules: Array<{ test: RegExp; message: string }> = [
    {
      test: /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.watch$|(^|\.)instagram\.com$/,
      message:
        'Không thể đọc Facebook/Instagram tự động (đăng nhập / hạn chế công khai). Hãy copy nội dung công khai hoặc dùng link website/landing.',
    },
    {
      test: /(^|\.)tiktok\.com$|(^|\.)vm\.tiktok\.com$/,
      message:
        'Không thể đọc TikTok tự động. Hãy dán link website/landing sản phẩm hoặc nhập tay các trường.',
    },
    {
      test: /(^|\.)shopee\.(vn|com)$|(^|\.)lazada\.(vn|com)$|(^|\.)tiki\.vn$|(^|\.)sendo\.vn$|(^|\.)amazon\.(com|co\.[a-z]+)$|(^|\.)ebay\.com$/,
      message:
        'Sàn thương mại điện tử thường chặn bot / yêu cầu đăng nhập — hệ thống không đọc được. Hãy dùng trang sản phẩm trên website của bạn.',
    },
  ];
  for (const rule of rules) {
    if (rule.test.test(host)) return rule.message;
  }
  return null;
}

export function adUrlAnalyzeRedisKey(jobId: string): string {
  return `ad-url-analyze:job:${jobId}`;
}
