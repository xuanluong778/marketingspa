import { z } from 'zod';
import { adsDateSchema, adsPlatformSchema, ADS_PERMISSIONS } from './ads-metrics';

/** Tenant context — luôn inject từ backend (JWT), không tin client. */
export const adsMcpTenantContextSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string().min(1),
  permissions: z.array(z.string()).default([]),
});

export type AdsMcpTenantContext = z.infer<typeof adsMcpTenantContextSchema>;

/** Giới hạn an toàn cho mọi tool MCP Ads. */
export const ADS_MCP_LIMITS = {
  /** Khoảng ngày tối đa (ngày) */
  maxDateSpanDays: 90,
  /** Số dòng trả về tối đa */
  maxRows: 50,
  /** Timeout mỗi tool (ms) */
  timeoutMs: 5_000,
  /** Page size mặc định */
  defaultLimit: 20,
} as const;

export const adsMcpDateRangeSchema = z
  .object({
    dateFrom: adsDateSchema,
    dateTo: adsDateSchema,
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
    const span = (to.getTime() - from.getTime()) / 86_400_000;
    if (span > ADS_MCP_LIMITS.maxDateSpanDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Khoảng ngày MCP tối đa ${ADS_MCP_LIMITS.maxDateSpanDays} ngày`,
        path: ['dateTo'],
      });
    }
  });

export const adsMcpLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(ADS_MCP_LIMITS.maxRows)
  .default(ADS_MCP_LIMITS.defaultLimit);

/** Bằng chứng số liệu — bắt buộc trong output phân tích. */
export const adsMcpEvidenceSchema = z.object({
  metric: z.string().min(1).max(64),
  value: z.number().finite().nullable(),
  unit: z.string().max(16).optional(),
  compareTo: z.number().finite().nullable().optional(),
  note: z.string().max(300).optional(),
});

export type AdsMcpEvidence = z.infer<typeof adsMcpEvidenceSchema>;

export const adsMcpAccountSchema = z.object({
  platform: z.enum(['META', 'GOOGLE', 'GMAIL']),
  status: z.string(),
  connected: z.boolean(),
  accountName: z.string().nullable(),
  /** Đã mask — không phải raw external id đầy đủ nếu nhạy cảm */
  externalAccountId: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  currency: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  readiness: z
    .object({
      mcpReady: z.boolean(),
      pendingCustomerSelection: z.boolean(),
      dataFreshnessMinutes: z.number().int().nullable(),
      stale: z.boolean(),
    })
    .optional(),
});

export const adsMcpCampaignSchema = z.object({
  campaignId: z.string(),
  insightId: z.string().optional(),
  platform: adsPlatformSchema,
  name: z.string(),
  status: z.string(),
  spend: z.number().finite(),
  impressions: z.number().finite(),
  clicks: z.number().finite(),
  conversions: z.number().finite(),
  conversionValue: z.number().finite(),
  ctr: z.number().finite().nullable(),
  cpc: z.number().finite().nullable(),
  cpm: z.number().finite().nullable(),
  cpa: z.number().finite().nullable(),
  roas: z.number().finite().nullable(),
  efficiencyScore: z.number().finite().nullable().optional(),
  currency: z.string().optional(),
  dateFrom: adsDateSchema.optional(),
  dateTo: adsDateSchema.optional(),
});

export const adsMcpMetricsSummarySchema = z.object({
  dateFrom: adsDateSchema,
  dateTo: adsDateSchema,
  organizationId: z.string().uuid(),
  totalSpend: z.number().finite(),
  conversionValue: z.number().finite(),
  totalConversions: z.number().finite(),
  impressions: z.number().finite(),
  clicks: z.number().finite(),
  roas: z.number().finite().nullable(),
  cpa: z.number().finite().nullable(),
  ctr: z.number().finite().nullable(),
  activeCampaigns: z.number().int(),
  poorCampaigns: z.number().int(),
  source: z.literal('AdsMcpGateway'),
  evidence: z.array(adsMcpEvidenceSchema),
});

export const adsMcpTrendPointSchema = z.object({
  date: adsDateSchema,
  spend: z.number().finite(),
  conversions: z.number().finite(),
  conversionValue: z.number().finite(),
  impressions: z.number().finite(),
  clicks: z.number().finite(),
  roas: z.number().finite().nullable(),
});

export const adsMcpTrendsSchema = z.object({
  dateFrom: adsDateSchema,
  dateTo: adsDateSchema,
  organizationId: z.string().uuid(),
  points: z.array(adsMcpTrendPointSchema).max(ADS_MCP_LIMITS.maxRows),
  previousPeriod: z
    .object({
      dateFrom: adsDateSchema,
      dateTo: adsDateSchema,
      totalSpend: z.number().finite(),
      conversionValue: z.number().finite(),
      roas: z.number().finite().nullable(),
    })
    .optional(),
  deltas: z
    .object({
      spendPct: z.number().finite().nullable(),
      conversionValuePct: z.number().finite().nullable(),
      roasPct: z.number().finite().nullable(),
    })
    .optional(),
  evidence: z.array(adsMcpEvidenceSchema),
  source: z.literal('AdsMcpGateway'),
});

export const adsMcpWasteSignalSchema = z.object({
  code: z.enum([
    'SPEND_NO_CONVERSION',
    'LOW_ROAS',
    'HIGH_CPA',
    'HIGH_CPM_LOW_CTR',
    'POOR_EFFICIENCY',
  ]),
  severity: z.enum(['low', 'medium', 'high']),
  campaignId: z.string(),
  campaignName: z.string(),
  platform: adsPlatformSchema,
  message: z.string().max(500),
  evidence: z.array(adsMcpEvidenceSchema).min(1),
  estimatedWasteSpend: z.number().finite().nonnegative().optional(),
});

export const adsMcpWasteReportSchema = z.object({
  dateFrom: adsDateSchema,
  dateTo: adsDateSchema,
  organizationId: z.string().uuid(),
  signals: z.array(adsMcpWasteSignalSchema).max(ADS_MCP_LIMITS.maxRows),
  totalEstimatedWaste: z.number().finite().nonnegative(),
  evidence: z.array(adsMcpEvidenceSchema),
  source: z.literal('AdsMcpGateway'),
});

/** Structured AI analysis — Zod bắt buộc; số liệu làm bằng chứng. */
export const adsAiAnalysisOutputSchema = z.object({
  organizationId: z.string().uuid(),
  campaignId: z.string().optional(),
  summary: z.string().min(1).max(2000),
  verdict: z.enum(['scale', 'hold', 'optimize', 'pause', 'investigate']),
  confidence: z.number().min(0).max(1),
  efficiencyScore: z.number().int().min(0).max(100).nullable(),
  recommendations: z.array(z.string().max(400)).max(10),
  evidence: z.array(adsMcpEvidenceSchema).min(1),
  wasteSignals: z.array(adsMcpWasteSignalSchema).max(20).default([]),
  source: z.literal('AdsMcpGateway'),
  generatedAt: z.string().datetime(),
});

export type AdsAiAnalysisOutput = z.infer<typeof adsAiAnalysisOutputSchema>;

export const ADS_MCP_TOOLS = {
  LIST_ACCOUNTS: 'ads.list_accounts',
  LIST_CAMPAIGNS: 'ads.list_campaigns',
  GET_METRICS: 'ads.get_metrics',
  GET_TRENDS: 'ads.get_trends',
  GET_TOP_CAMPAIGNS: 'ads.get_top_campaigns',
  GET_POOR_CAMPAIGNS: 'ads.get_poor_campaigns',
  DETECT_BUDGET_WASTE: 'ads.detect_budget_waste',
  ANALYZE_CAMPAIGN: 'ads.analyze_campaign',
} as const;

export type AdsMcpToolName = (typeof ADS_MCP_TOOLS)[keyof typeof ADS_MCP_TOOLS];

export const adsMcpToolPermissionMap: Record<
  AdsMcpToolName,
  typeof ADS_PERMISSIONS.READ | typeof ADS_PERMISSIONS.ANALYZE
> = {
  [ADS_MCP_TOOLS.LIST_ACCOUNTS]: ADS_PERMISSIONS.READ,
  [ADS_MCP_TOOLS.LIST_CAMPAIGNS]: ADS_PERMISSIONS.READ,
  [ADS_MCP_TOOLS.GET_METRICS]: ADS_PERMISSIONS.READ,
  [ADS_MCP_TOOLS.GET_TRENDS]: ADS_PERMISSIONS.READ,
  [ADS_MCP_TOOLS.GET_TOP_CAMPAIGNS]: ADS_PERMISSIONS.ANALYZE,
  [ADS_MCP_TOOLS.GET_POOR_CAMPAIGNS]: ADS_PERMISSIONS.ANALYZE,
  [ADS_MCP_TOOLS.DETECT_BUDGET_WASTE]: ADS_PERMISSIONS.ANALYZE,
  [ADS_MCP_TOOLS.ANALYZE_CAMPAIGN]: ADS_PERMISSIONS.ANALYZE,
};

export function adsMcpHasPermission(ctx: AdsMcpTenantContext, required: string): boolean {
  // Khớp PermissionsGuard: OWNER / SUPER_ADMIN bypass toàn bộ RBAC Ads MCP
  if (ctx.role === 'OWNER' || ctx.role === 'SUPER_ADMIN') return true;
  return (ctx.permissions ?? []).includes(required);
}
