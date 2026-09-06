export type MarketingContextConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type MarketingContextTimeRange = {
  from: string;
  to: string;
};

export type MarketingContextInsight = {
  id: string;
  category: string;
  title: string;
  summary: string;
  evidence: string;
  source: string;
  timeRange: MarketingContextTimeRange;
  confidence: MarketingContextConfidence;
};

export type MarketingContextSourceStatus = {
  domain: string;
  status: 'OK' | 'ERROR' | 'INSUFFICIENT_DATA';
  recordCount?: number;
  error?: string;
};

export type MarketingContextMetrics = {
  leads: {
    total: number | null;
    new: number | null;
    hot: number | null;
    unassigned: number | null;
    noFollowUp: number | null;
  };
  bookings: {
    total: number | null;
    upcoming: number | null;
    completed: number | null;
  };
  conversion: {
    leadToBookingRate: number | null;
  };
  revenue: {
    total: number | null;
    currency: string;
  };
  ads: {
    spend: number | null;
    impressions: number | null;
    clicks: number | null;
    ctr: number | null;
    cpc: number | null;
    cpl: number | null;
    roas: number | null;
    leads?: number | null;
    anomalousCampaigns?: number | null;
  };
  email: {
    campaigns: number | null;
    sent: number | null;
    openRate: number | null;
    clickRate: number | null;
  };
  zalo: {
    campaigns: number | null;
    sent: number | null;
  };
  chatbot: {
    bots: number | null;
    openConversations: number | null;
    leadsCaptured: number | null;
  };
  funnel: {
    activeFunnels: number | null;
    pipelineStages: number | null;
    leadsInFunnel: number | null;
  };
  campaigns: {
    messagingActive: number | null;
    messagingSent: number | null;
    legacyCampaigns: number | null;
  };
  content: {
    teleprompterSources: number | null;
    autoPostDrafts: number | null;
    autoPostPublished: number | null;
  };
  automation: {
    activeFlows: number | null;
    pausedFlows: number | null;
    logsSuccess: number | null;
    logsFailed: number | null;
  };
  customers: {
    total: number | null;
    linkedIdentities: number | null;
    repurchaseCandidates: number | null;
  };
  businessEvents: {
    counts: Record<string, number>;
  };
};

/** Context Engine V2 — multi-window aggregation */
export const CONTEXT_ENGINE_WINDOWS = [7, 30, 90] as const;
export type ContextWindowDays = (typeof CONTEXT_ENGINE_WINDOWS)[number];

export type MarketingContextWindowSlice = {
  days: ContextWindowDays;
  timeRange: MarketingContextTimeRange;
  metrics: MarketingContextMetrics;
  sources: MarketingContextSourceStatus[];
};

export type MarketingContextBottleneck = {
  id: string;
  kind: 'crm_followup' | 'conversion' | 'funnel' | 'ads_efficiency' | 'automation' | 'email' | 'other';
  title: string;
  summary: string;
  evidence: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  windowDays: ContextWindowDays;
  confidence: MarketingContextConfidence;
};

export type MarketingContextOpportunity = {
  id: string;
  kind: 'hot_leads' | 'content' | 'chatbot' | 'remarketing' | 'revenue_growth' | 'repurchase' | 'other';
  title: string;
  summary: string;
  evidence: string;
  windowDays: ContextWindowDays;
  confidence: MarketingContextConfidence;
};

export type MarketingContextSnapshotPayload = {
  organizationId: string;
  generatedAt: string;
  /** Primary window (30d) — backward compatible */
  timeRange: MarketingContextTimeRange;
  engineVersion: string;
  /** Primary metrics (30d) */
  metrics: MarketingContextMetrics;
  insights: MarketingContextInsight[];
  sources: MarketingContextSourceStatus[];
  /** V2 additive fields */
  windows?: MarketingContextWindowSlice[];
  bottlenecks?: MarketingContextBottleneck[];
  opportunities?: MarketingContextOpportunity[];
};

export type MarketingContextDatasourceResult<T> = {
  domain: string;
  status: 'OK' | 'ERROR' | 'INSUFFICIENT_DATA';
  data?: T;
  recordCount?: number;
  error?: string;
};
