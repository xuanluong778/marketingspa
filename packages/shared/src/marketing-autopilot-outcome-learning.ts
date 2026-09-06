import { z } from 'zod';

export const OUTCOME_LEARNING_HORIZONS = [1, 7, 30] as const;
export type OutcomeLearningHorizon = (typeof OUTCOME_LEARNING_HORIZONS)[number];

export const outcomeMetricsSnapshotSchema = z.object({
  impressions: z.number().finite().nullable(),
  clicks: z.number().finite().nullable(),
  ctr: z.number().finite().nullable(),
  cpc: z.number().finite().nullable(),
  leads: z.number().finite().nullable(),
  bookings: z.number().finite().nullable(),
  conversionRate: z.number().finite().nullable(),
  revenue: z.number().finite().nullable(),
  cpl: z.number().finite().nullable(),
  cpa: z.number().finite().nullable(),
  roas: z.number().finite().nullable(),
  emailOpenRate: z.number().finite().nullable(),
  emailClickRate: z.number().finite().nullable(),
  chatbotLeadsCaptured: z.number().finite().nullable(),
  funnelLeadsInFunnel: z.number().finite().nullable(),
  funnelConversionRate: z.number().finite().nullable(),
  crmConversionRate: z.number().finite().nullable(),
  emailSent: z.number().finite().nullable(),
  messagingSent: z.number().finite().nullable(),
  adsSpend: z.number().finite().nullable(),
  automationLogsFailed: z.number().finite().nullable(),
  automationLogsSuccess: z.number().finite().nullable(),
  capturedAt: z.string(),
});

export type OutcomeMetricsSnapshot = z.infer<typeof outcomeMetricsSnapshotSchema>;

export type OutcomeVerdict = 'IMPROVED' | 'DECLINED' | 'MIXED' | 'INSUFFICIENT_DATA';

export type OutcomeDelta = {
  metric: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
};

export type OutcomeResult = {
  verdict: OutcomeVerdict;
  deltas: OutcomeDelta[];
  notes: string[];
  correlationOnly: true;
  caveat: string;
};

export type BusinessLearningPlannerItem = {
  category: string;
  key: string;
  title: string;
  summary: string;
  confidence: string;
  sampleSize: number;
  correlationOnly: true;
  evidence?: Record<string, unknown>;
};

const CAVEAT =
  'Correlation only — không coi quan hệ tương quan là nguyên nhân chắc chắn. Kiểm chứng thêm trước khi quyết định.';

type LooseMetrics = {
  leads?: { total?: number | null };
  bookings?: { total?: number | null };
  conversion?: { leadToBookingRate?: number | null };
  revenue?: { total?: number | null };
  ads?: {
    spend?: number | null;
    impressions?: number | null;
    clicks?: number | null;
    ctr?: number | null;
    cpc?: number | null;
    cpl?: number | null;
    roas?: number | null;
  };
  email?: { openRate?: number | null; clickRate?: number | null; sent?: number | null; campaigns?: number | null };
  chatbot?: { leadsCaptured?: number | null };
  funnel?: { leadsInFunnel?: number | null; activeFunnels?: number | null };
  campaigns?: { messagingSent?: number | null };
  automation?: { logsSuccess?: number | null; logsFailed?: number | null };
  crm?: { conversionRate?: number | null };
};

export function extractOutcomeMetrics(
  metrics: LooseMetrics | null | undefined,
  capturedAt = new Date().toISOString(),
): OutcomeMetricsSnapshot {
  const leads = metrics?.leads?.total ?? null;
  const bookings = metrics?.bookings?.total ?? null;
  const spend = metrics?.ads?.spend ?? null;
  const impressions = metrics?.ads?.impressions ?? null;
  const clicks = metrics?.ads?.clicks ?? null;
  const cpl = metrics?.ads?.cpl ?? null;
  const derivedCpa =
    spend != null && bookings != null && bookings > 0 ? Math.round(spend / bookings) : null;
  const funnelLeads = metrics?.funnel?.leadsInFunnel ?? null;
  const funnelConv =
    funnelLeads != null && leads != null && leads > 0
      ? Math.round((Math.min(funnelLeads, leads) / leads) * 1000) / 10
      : null;

  return outcomeMetricsSnapshotSchema.parse({
    impressions,
    clicks,
    ctr: metrics?.ads?.ctr ?? null,
    cpc: metrics?.ads?.cpc ?? null,
    leads,
    bookings,
    conversionRate: metrics?.conversion?.leadToBookingRate ?? null,
    revenue: metrics?.revenue?.total ?? null,
    cpl,
    cpa: derivedCpa,
    roas: metrics?.ads?.roas ?? null,
    emailOpenRate: metrics?.email?.openRate ?? null,
    emailClickRate: metrics?.email?.clickRate ?? null,
    chatbotLeadsCaptured: metrics?.chatbot?.leadsCaptured ?? null,
    funnelLeadsInFunnel: funnelLeads,
    funnelConversionRate: funnelConv,
    crmConversionRate: metrics?.crm?.conversionRate ?? metrics?.conversion?.leadToBookingRate ?? null,
    emailSent: metrics?.email?.sent ?? null,
    messagingSent: metrics?.campaigns?.messagingSent ?? null,
    adsSpend: spend,
    automationLogsFailed: metrics?.automation?.logsFailed ?? null,
    automationLogsSuccess: metrics?.automation?.logsSuccess ?? null,
    capturedAt,
  });
}

function deltaOf(
  metric: string,
  before: number | null,
  after: number | null,
  preferHigher: boolean,
): OutcomeDelta {
  if (before == null || after == null) {
    return { metric, before, after, delta: null, direction: 'unknown' };
  }
  const delta = after - before;
  const direction = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down';
  void preferHigher;
  return { metric, before, after, delta, direction };
}

/** Compare before/after. Lower-is-better metrics: cpl, cpa. */
export function computeOutcome(
  before: OutcomeMetricsSnapshot,
  after: OutcomeMetricsSnapshot,
): OutcomeResult {
  const deltas: OutcomeDelta[] = [
    deltaOf('impressions', before.impressions, after.impressions, true),
    deltaOf('clicks', before.clicks, after.clicks, true),
    deltaOf('ctr', before.ctr, after.ctr, true),
    deltaOf('cpc', before.cpc, after.cpc, false),
    deltaOf('leads', before.leads, after.leads, true),
    deltaOf('bookings', before.bookings, after.bookings, true),
    deltaOf('conversionRate', before.conversionRate, after.conversionRate, true),
    deltaOf('revenue', before.revenue, after.revenue, true),
    deltaOf('cpl', before.cpl, after.cpl, false),
    deltaOf('cpa', before.cpa, after.cpa, false),
    deltaOf('roas', before.roas, after.roas, true),
    deltaOf('emailOpenRate', before.emailOpenRate, after.emailOpenRate, true),
    deltaOf('emailClickRate', before.emailClickRate, after.emailClickRate, true),
    deltaOf('chatbotLeadsCaptured', before.chatbotLeadsCaptured, after.chatbotLeadsCaptured, true),
    deltaOf('funnelLeadsInFunnel', before.funnelLeadsInFunnel, after.funnelLeadsInFunnel, true),
  ];

  const comparable = deltas.filter((d) => d.direction !== 'unknown');
  if (comparable.length === 0) {
    return {
      verdict: 'INSUFFICIENT_DATA',
      deltas,
      notes: ['Không đủ dữ liệu before/after để đánh giá outcome'],
      correlationOnly: true,
      caveat: CAVEAT,
    };
  }

  const lowerBetter = new Set(['cpl', 'cpa', 'cpc']);
  let improved = 0;
  let declined = 0;
  for (const d of comparable) {
    if (d.direction === 'flat') continue;
    const good = lowerBetter.has(d.metric) ? d.direction === 'down' : d.direction === 'up';
    if (good) improved += 1;
    else declined += 1;
  }

  let verdict: OutcomeVerdict = 'MIXED';
  if (improved > 0 && declined === 0) verdict = 'IMPROVED';
  else if (declined > 0 && improved === 0) verdict = 'DECLINED';
  else if (improved === 0 && declined === 0) verdict = 'MIXED';

  return {
    verdict,
    deltas,
    notes: [
      `So sánh ${comparable.length} metric có dữ liệu: +${improved} / -${declined}`,
      CAVEAT,
    ],
    correlationOnly: true,
    caveat: CAVEAT,
  };
}

export function normalizeLearningKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export function buildPlannerBusinessLearningsPayload(
  items: BusinessLearningPlannerItem[],
): {
  disclaimer: string;
  learnings: BusinessLearningPlannerItem[];
} {
  return {
    disclaimer: CAVEAT,
    learnings: items.map((i) => ({
      ...i,
      correlationOnly: true as const,
    })),
  };
}
