import { z } from 'zod';

/** ISO date YYYY-MM-DD */
export const adsDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD');

export const adsPlatformSchema = z.enum(['META', 'GOOGLE', 'TIKTOK', 'ZALO', 'MANUAL', 'OTHER']);

/**
 * Conversion action rõ ràng (Meta action_type / Google conversion action).
 * count & value giữ số thô — không làm tròn sớm.
 */
export const adsConversionActionSchema = z.object({
  type: z.string().min(1).max(200),
  count: z.number().finite().nonnegative(),
  value: z.number().finite().nonnegative().optional(),
});

/**
 * Schema chuẩn hóa chung Meta + Google Ads metrics.
 * Tiền (spend, conversionValue, cpc, cpm, cpa) dùng number ở biên Zod;
 * persistence dùng Prisma Decimal.
 */
export const adsNormalizedMetricsSchema = z.object({
  impressions: z.number().finite().nonnegative(),
  reach: z.number().finite().nonnegative(),
  clicks: z.number().finite().nonnegative(),
  spend: z.number().finite().nonnegative(),
  conversions: z.number().finite().nonnegative(),
  conversionValue: z.number().finite().nonnegative(),
  /** null khi không tính được (mẫu số = 0) */
  ctr: z.number().finite().nonnegative().nullable(),
  cpc: z.number().finite().nonnegative().nullable(),
  cpm: z.number().finite().nonnegative().nullable(),
  cpa: z.number().finite().nonnegative().nullable(),
  roas: z.number().finite().nonnegative().nullable(),
  currency: z.string().min(1).max(8),
  /** Ngày theo timezone ad account (YYYY-MM-DD) — hoặc dateFrom khi range */
  date: adsDateSchema,
  conversionActions: z.array(adsConversionActionSchema).default([]),
});

export const adsNormalizedCampaignRowSchema = adsNormalizedMetricsSchema.extend({
  organizationId: z.string().uuid(),
  platform: adsPlatformSchema,
  externalCampaignId: z.string().min(1),
  campaignName: z.string().min(1),
  dateFrom: adsDateSchema,
  dateTo: adsDateSchema,
  timezone: z.string().min(1).max(64),
});

/** Query list — organizationId bắt buộc (inject từ JWT, không tin client). */
export const adsMetricsQuerySchema = z
  .object({
    organizationId: z.string().uuid(),
    dateFrom: adsDateSchema,
    dateTo: adsDateSchema,
    platform: adsPlatformSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((val, ctx) => {
    if (val.dateFrom > val.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFrom phải <= dateTo',
        path: ['dateFrom'],
      });
    }
    const from = new Date(val.dateFrom + 'T00:00:00.000Z');
    const to = new Date(val.dateTo + 'T00:00:00.000Z');
    const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
    if (spanDays > 366) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Khoảng ngày tối đa 366 ngày',
        path: ['dateTo'],
      });
    }
  });

export type AdsConversionAction = z.infer<typeof adsConversionActionSchema>;
export type AdsNormalizedMetrics = z.infer<typeof adsNormalizedMetricsSchema>;
export type AdsNormalizedCampaignRow = z.infer<typeof adsNormalizedCampaignRowSchema>;
export type AdsMetricsQuery = z.infer<typeof adsMetricsQuerySchema>;

/** Không chia cho 0 — trả null thay vì Infinity/NaN. */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function asFiniteNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Ngày theo timezone ad account (YYYY-MM-DD).
 * Dùng Intl — không phụ thuộc luxon.
 */
export function formatDateInTimezone(input: Date | string, timeZone: string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date for timezone format');
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
}

export type NormalizeAdsMetricsInput = {
  impressions?: unknown;
  reach?: unknown;
  clicks?: unknown;
  spend?: unknown;
  conversions?: unknown;
  conversionValue?: unknown;
  /** Nếu có sẵn từ provider — chỉ dùng khi finite; không làm tròn */
  ctr?: unknown;
  cpc?: unknown;
  cpm?: unknown;
  cpa?: unknown;
  roas?: unknown;
  currency: string;
  date: string;
  conversionActions?: AdsConversionAction[];
  /** true = luôn tính lại ratio từ spend/clicks/... (khuyến nghị) */
  recomputeRates?: boolean;
};

/**
 * Chuẩn hóa metrics chung Meta/Google.
 * - Không chia 0
 * - Không Math.round tiền / ratio
 * - Impressions/clicks/reach: giữ số nguyên không âm (floor counts)
 */
export function normalizeAdsMetrics(input: NormalizeAdsMetricsInput): AdsNormalizedMetrics {
  const impressions = Math.max(0, asFiniteNumber(input.impressions));
  const reach = Math.max(0, asFiniteNumber(input.reach));
  const clicks = Math.max(0, asFiniteNumber(input.clicks));
  const spend = Math.max(0, asFiniteNumber(input.spend));
  const conversions = Math.max(0, asFiniteNumber(input.conversions));
  const conversionValue = Math.max(0, asFiniteNumber(input.conversionValue));

  const recompute = input.recomputeRates !== false;

  const ctr = recompute
    ? safeDivide(clicks * 100, impressions)
    : (finiteOrNull(input.ctr) ?? safeDivide(clicks * 100, impressions));
  const cpc = recompute
    ? safeDivide(spend, clicks)
    : (finiteOrNull(input.cpc) ?? safeDivide(spend, clicks));
  const cpm = recompute
    ? safeDivide(spend * 1000, impressions)
    : (finiteOrNull(input.cpm) ?? safeDivide(spend * 1000, impressions));
  const cpa = recompute
    ? safeDivide(spend, conversions)
    : (finiteOrNull(input.cpa) ?? safeDivide(spend, conversions));
  const roas = recompute
    ? safeDivide(conversionValue, spend)
    : (finiteOrNull(input.roas) ?? safeDivide(conversionValue, spend));

  return adsNormalizedMetricsSchema.parse({
    impressions,
    reach,
    clicks,
    spend,
    conversions,
    conversionValue,
    ctr,
    cpc,
    cpm,
    cpa,
    roas,
    currency: input.currency || 'USD',
    date: input.date,
    conversionActions: input.conversionActions ?? [],
  });
}

function finiteOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Public DTO — không chứa token/secret. */
export const adsMetricsPublicSchema = adsNormalizedCampaignRowSchema.omit({}).strict();

export function assertAdsMetricsPublic(payload: unknown): AdsNormalizedCampaignRow {
  return adsMetricsPublicSchema.parse(payload);
}

/** Trạng thái job đồng bộ Ads (public — không có token). */
export const adsSyncJobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const adsSyncJobPublicSchema = z.object({
  id: z.string().uuid(),
  status: adsSyncJobStatusSchema,
  platform: z.enum(['META', 'GOOGLE']),
  accountId: z.string().min(1),
  dateFrom: z.union([z.string(), z.coerce.date()]),
  dateTo: z.union([z.string(), z.coerce.date()]),
  progressPercent: z.number().min(0).max(100),
  progressMessage: z.string().nullable(),
  campaignsSynced: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  startedAt: z.union([z.string(), z.coerce.date()]).nullable(),
  finishedAt: z.union([z.string(), z.coerce.date()]).nullable(),
  createdAt: z.union([z.string(), z.coerce.date()]),
});

/** Payload Socket.IO `ads:sync-progress` */
export const adsSyncProgressEventSchema = z.object({
  jobId: z.string().uuid(),
  status: adsSyncJobStatusSchema,
  progressPercent: z.number().min(0).max(100),
  progressMessage: z.string().nullable().optional(),
  campaignsSynced: z.number().int().nonnegative().optional(),
  accountId: z.string().optional(),
  platform: z.enum(['META', 'GOOGLE']).optional(),
  lastError: z.string().nullable().optional(),
});

export type AdsSyncJobStatus = z.infer<typeof adsSyncJobStatusSchema>;
export type AdsSyncJobPublic = z.infer<typeof adsSyncJobPublicSchema>;
export type AdsSyncProgressEvent = z.infer<typeof adsSyncProgressEventSchema>;

export const ADS_PERMISSIONS = {
  READ: 'ads.read',
  CONNECT: 'ads.connect',
  SYNC: 'ads.sync',
  ANALYZE: 'ads.analyze',
  MANAGE: 'ads.manage',
} as const;
