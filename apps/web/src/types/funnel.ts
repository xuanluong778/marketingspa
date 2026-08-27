export interface FunnelStep {
  status: string;
  label: string;
  count: number;
  color?: string;
}

export interface FunnelStats {
  from: string;
  to: string;
  totalLeads: number;
  steps: FunnelStep[];
  conversions: {
    leadToBooking: number | null;
    bookingToVisit: number | null;
    visitToPurchase: number | null;
    leadToPurchase: number | null;
  };
  counts: {
    booked: number;
    visited: number;
    purchased: number;
  };
}

export interface FunnelFilters {
  from: string;
  to: string;
  leadSourceId: string;
  assignedToId: string;
  branchId: string;
  adCampaignId: string;
  funnelRecommendationId: string;
  touchModel: 'first' | 'last';
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

export interface FunnelAnalyticsKpis {
  leads: number;
  mql: number;
  sql: number;
  booking: number;
  purchased: number;
  revenue: number;
  spend: number;
  conversionRate: number | null;
  cpl: number | null;
  cac: number | null;
  roas: number | null;
  avgConversionTimeHours: number | null;
}

export interface FunnelAnalyticsStage {
  key: 'LEAD' | 'MQL' | 'SQL' | 'BOOKING' | 'PURCHASED';
  label: string;
  count: number;
  dropOffFromPrevious: number | null;
  conversionFromLead: number | null;
  leadFilter: Record<string, string>;
}

export interface FunnelAnalyticsDashboard {
  from: string;
  to: string;
  touchModel: 'first' | 'last';
  kpis: FunnelAnalyticsKpis;
  funnelStages: FunnelAnalyticsStage[];
  pipeline: FunnelStats;
  attribution: {
    totals: {
      spend: number;
      leads: number;
      revenue: number;
      cpl: number | null;
      cac: number | null;
      roas: number | null;
      orders: number;
    };
    rows: Array<{
      key: string;
      label: string;
      spend: number;
      leads: number;
      revenue: number;
      cpl: number | null;
      cac: number | null;
      roas: number | null;
    }>;
  };
  trackingBreakdown: {
    utmSources: { value: string; leads: number }[];
    utmCampaigns: { value: string; leads: number }[];
    landingPages: { value: string; leads: number }[];
    referrers: { value: string; leads: number }[];
    adSets: { value: string; leads: number }[];
    ads: { value: string; leads: number }[];
    campaigns: { campaignId: string | null; label: string; leads: number }[];
    clickIds: { fbclid: number; gclid: number };
    attributedLeads: number;
  };
}

export const CONVERSION_LABELS = [
  { key: 'leadToBooking' as const, label: 'Lead → Đặt lịch' },
  { key: 'bookingToVisit' as const, label: 'Đặt lịch → Đến spa' },
  { key: 'visitToPurchase' as const, label: 'Đến spa → Mua dịch vụ' },
  { key: 'leadToPurchase' as const, label: 'Lead → Khách mua' },
];

export type LeadPipelineStatusCode =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'BOOKED'
  | 'CONFIRMED'
  | 'VISITED'
  | 'PURCHASED'
  | 'LOST';

export interface FunnelStageProposal {
  name: string;
  code: LeadPipelineStatusCode;
  position: number;
  color?: string;
  isLostStage?: boolean;
}

export interface FunnelFlowProposal {
  name: string;
  triggerType: string;
  delayMinutes?: number;
  channel?: string;
  actions: Array<Record<string, unknown> & { type: string }>;
  rationale?: string;
}

export interface FunnelBlueprintDraft {
  name: string;
  summary?: string;
  industryHint?: string;
  stages: FunnelStageProposal[];
  flows: FunnelFlowProposal[];
}

export interface FunnelBlueprintListItem {
  id: string;
  name: string;
  prompt: string;
  status: 'DRAFT' | 'APPLIED' | 'DISCARDED';
  source: string;
  summary: string | null;
  createdAt: string;
  appliedAt: string | null;
}

export interface FunnelGenerateResult {
  id: string;
  name: string;
  status: string;
  source: string;
  summary: string | null;
  draft: FunnelBlueprintDraft;
  createdAt: string;
}

export interface FunnelApplyResult {
  blueprintId: string;
  draft: FunnelBlueprintDraft;
  stages: Array<{ id: string; code: string; name: string }>;
  pipeline: FunnelStageRow[];
  flows: Array<{ id: string; name: string; triggerType: string }>;
  meta: {
    stagesApplied: number;
    flowsCreated: number;
    activateFlows: boolean;
  };
}

export interface FunnelStageRow {
  id: string;
  name: string;
  code: string;
  category?: string;
  position: number;
  color: string | null;
  probability?: number;
  slaMinutes?: number | null;
  isWon?: boolean;
  isLost?: boolean;
  isActive: boolean;
  pipelineId?: string;
  legacyStatus?: string | null;
}

export interface FunnelTemplateGoal {
  code: string;
  label: string;
  description?: string;
  primaryMetric?: string;
}

export interface FunnelTemplateInput {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  helpText?: string;
}

export interface FunnelTemplateNode {
  id: string;
  type: string;
  label: string;
  description?: string;
  stage?: FunnelStageProposal;
  position?: { x: number; y: number };
}

export interface FunnelTemplateConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface FunnelTemplateListItem {
  id: string;
  organizationId: string | null;
  sourceTemplateId: string | null;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  goal: FunnelTemplateGoal;
  requiredInputs: FunnelTemplateInput[];
  isSystem: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FunnelTemplateDetail extends FunnelTemplateListItem {
  nodes: FunnelTemplateNode[];
  connections: FunnelTemplateConnection[];
  recommendedAutomation: FunnelFlowProposal[];
  definition: Record<string, unknown>;
  isActive: boolean;
  canEdit: boolean;
}

export interface FunnelBriefAnalysis {
  industry: string;
  service: string;
  goal: string;
  targetAudience: string;
  painPoints: string[];
  offer: string;
  leadMagnet: string;
  channels: string[];
  budgetHint?: string | null;
  regionHint?: string | null;
  confidence?: number;
}

export interface FunnelRecommendationOption {
  templateSlug: string;
  funnelName: string;
  strategy: string;
  fitReason: string;
  offer: string;
  customerJourney: Array<{ step: number; label: string; description?: string }>;
  channels: string[];
  cta: string;
  fitScore: number;
}

export interface FunnelGeneratorResult {
  id?: string;
  schemaVersion: 'funnel-generator.v1';
  prompt: string;
  analysis: FunnelBriefAnalysis;
  recommendations: FunnelRecommendationOption[];
  mode: 'preview';
  disclaimers: string[];
  source?: string;
  applied?: boolean;
  deployable?: boolean;
  selectedSlug?: string | null;
  chatbotBotId?: string | null;
  completeSpec?: FunnelCompleteSpec | null;
  completeSource?: string | null;
  completeGeneratedAt?: string | null;
}

/** Fixed schema funnel-complete.v1 — draft only until Templates apply */
export type { FunnelCompleteSpec } from '@marketingspa/shared';
import type { FunnelCompleteSpec } from '@marketingspa/shared';

export interface FunnelCompleteGenerateResult {
  recommendationId: string;
  templateSlug: string;
  source: string;
  complete: FunnelCompleteSpec;
  applied: false;
  deployable: false;
  mode: 'draft';
}

