import type { PaginatedResult } from './api';

export interface MarketingAutopilotStatus {
  enabled: boolean;
  organizationId: string;
  liveActionsEnabled: boolean;
  facebookSafetyMode: string;
}

export interface MarketingAutopilotProjectInput {
  projectName?: string;
  productName: string;
  productPrice: number;
  customerProfile: string;
  targetArea: string;
  monthlyBudget: number;
  primaryGoal: string;
  goals?: string[];
  channels?: string[];
}

export interface UpdateMarketingAutopilotProjectInput {
  projectName?: string;
  productName?: string;
  productPrice?: number;
  customerProfile?: string;
  targetArea?: string;
  monthlyBudget?: number;
  primaryGoal?: string;
  goals?: string[];
  channels?: string[];
}

export interface ArchiveMarketingAutopilotProjectResponse {
  id: string;
  archived: boolean;
  deletedAt: string;
  message?: string;
}

export interface UpdateMarketingAutopilotProjectResponse extends MarketingAutopilotProject {
  briefOnly?: boolean;
  assetsFrozen?: boolean;
  message?: string;
}

export interface MarketingAutopilotAnalysis {
  id: string;
  projectId: string;
  organizationId: string;
  createdById: string;
  engine: string;
  summary: string;
  recommendationJson: {
    summary: string;
    score: number;
    suggestedChannels?: string[];
    risks?: string[];
    nextSteps?: string[];
    budgetSplit?: Array<{ channel: string; percent: number }>;
    plan?: unknown;
    nextBestActions?: Array<{
      type: string;
      label?: string;
      rationale?: string;
      priority?: number;
      title?: string;
      whyNow?: string;
      confidence?: string;
      expectedImpact?: string;
      estimatedCost?: number | null;
      riskLevel?: string;
      recommendedDraft?: string;
      evidenceText?: string;
      evidence?: {
        reason?: string;
        evidence?: string;
        source?: string;
        confidence?: string;
        expectedImpact?: string;
        riskLevel?: string;
      };
    }>;
    budgetScenarios?: Array<{
      scenarioId: string;
      label: string;
      monthlyBudget: number;
      estimates: Record<
        string,
        {
          value: number | null;
          status: string;
          note?: string;
          basedOn?: string[];
          timeRange?: { from: string; to: string } | null;
          sampleSize?: number | null;
          confidence?: string;
        }
      >;
      dataQuality: string;
      assumptions: string[];
      timeRange?: { from: string; to: string } | null;
      mode?: 'historical' | 'assumption';
    }>;
    nbaEngine?: { version?: string; maxActions?: number };
    safety?: { policy?: string; highRiskActionSuggestionsBlocked?: string[] };
    contextUsed?: {
      snapshotId?: string | null;
      generatedAt?: string;
      insightCount?: number;
    };
    plannerMeta?: {
      engine?: string;
      usedLlm?: boolean;
      fallbackReason?: string | null;
    };
    sectionRecommendations?: Record<
      string,
      {
        reason?: string;
        evidence?: string;
        source?: string;
        confidence?: string;
        expectedImpact?: string;
        riskLevel?: string;
      }
    >;
  };
  createdAt: string;
}

export interface MarketingAutopilotProject {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  status: string;
  productName: string;
  productPrice: string;
  customerProfile: string;
  targetArea: string;
  monthlyBudget: string;
  primaryGoal: string;
  inputSnapshot: MarketingAutopilotProjectInput;
  analysisSummary: string;
  analysisJson: MarketingAutopilotAnalysis['recommendationJson'];
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; email: string };
  analyses?: MarketingAutopilotAnalysis[];
  /** Latest drafts for this project (newest first), enriched with editUrl */
  drafts?: MarketingAutopilotDraft[];
  /** AI Orchestrator A→Z mission (additive) */
  mission?: MarketingMission | null;
}

export interface MarketingMissionApprovalSummary {
  progressPercent: number;
  status: string;
  currentStep: string;
  currentStepLabel?: string;
  strategy: string;
  audience: string;
  funnel: string;
  contentCount: number;
  automation: string;
  campaign: string;
  email: string;
  zalo: string;
  ads: string;
  budget: string;
  kpi: string;
  confidence: string;
  risk: string;
  canApprove: boolean;
  approval?: {
    id: string;
    version: number;
    approvedAt: string;
    approvedById: string;
    runStatus: string;
  } | null;
}

export interface MarketingMission {
  id: string;
  organizationId: string;
  projectId: string;
  status: string;
  currentStep: string;
  currentStepLabel?: string;
  progressPercent: number;
  steps?: unknown;
  error?: unknown;
  readyAt?: string | null;
  approvedAt?: string | null;
  approvalVersion?: number;
  draftOnly?: boolean;
  liveActionsEnabled?: boolean;
  drafts?: MarketingAutopilotDraft[];
  assets?: Array<{
    id: string;
    module: string;
    entityType: string;
    entityId: string;
    status: string;
    missionId?: string;
    assetType?: string | null;
    editUrl?: string | null;
    recommendationId?: string | null;
  }>;
  approvalSummary?: MarketingMissionApprovalSummary;
  approval?: {
    id: string;
    version: number;
    approvedAt: string;
    approvedById: string;
    runStatus: string;
    snapshot?: unknown;
  } | null;
  planPreview?: unknown;
}

export type MarketingAutopilotProjectList = PaginatedResult<MarketingAutopilotProject>;

export type ProjectDatePreset =
  'today' | '7d' | '30d' | 'this_month' | 'last_month' | 'this_year' | 'custom' | '';

export type ProjectSortOption = 'newest' | 'oldest' | 'budget' | 'name';
export type ProjectQuickFilter = '' | 'running' | 'needs_approval';

export type MarketingAutopilotProjectListQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  datePreset?: ProjectDatePreset;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  goal?: string;
  product?: string;
  budgetMin?: number;
  budgetMax?: number;
  quickFilter?: ProjectQuickFilter;
  sort?: ProjectSortOption;
  projectId?: string;
};

export interface MarketingAutopilotProjectFilterOptions {
  products: string[];
  statuses: string[];
  goals: string[];
  budgetMin: number;
  budgetMax: number;
}

export interface MarketingAutopilotDraftRun {
  id: string;
  organizationId: string;
  createdById: string;
  projectId: string;
  idempotencyKey: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutopilotContentIdeaView {
  index: number;
  title: string;
  hook: string;
  customerInsight: string;
  angle: string;
  fullContent: string;
  offer: string;
  cta: string;
  channel: string;
  format: string;
  formatLabel: string;
  safetyNotes?: string[];
}

export interface MarketingAutopilotContentIdeasResponse {
  projectId: string;
  contentId: string | null;
  ideas: AutopilotContentIdeaView[];
  draftOnly: boolean;
}

export interface MarketingAutopilotDraft {
  id: string;
  organizationId: string;
  createdById: string;
  projectId: string;
  runId: string;
  type: string;
  status: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  /** Confirm response enrichment */
  draftId?: string;
  editUrl?: string;
  externalEntityId?: string | null;
  externalEntityType?: string | null;
  contentIdeas?: AutopilotContentIdeaView[];
}

export interface MarketingAutopilotConfirmDraftResponse {
  draftRun: MarketingAutopilotDraftRun;
  drafts: MarketingAutopilotDraft[];
  results?: Array<{
    draftId: string;
    type: string;
    status: string;
    editUrl: string;
  }>;
}

export type MarketingContextConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export interface MarketingContextInsight {
  id: string;
  category: string;
  title: string;
  summary: string;
  evidence: string;
  source: string;
  timeRange: { from: string; to: string };
  confidence: MarketingContextConfidence;
}

export interface MarketingContextSnapshot {
  organizationId: string;
  generatedAt: string;
  timeRange: { from: string; to: string };
  engineVersion: string;
  metrics: Record<string, unknown>;
  insights: MarketingContextInsight[];
  sources: Array<{ domain: string; status: string; recordCount?: number; error?: string }>;
  /** Context Engine V2 additive */
  windows?: Array<{
    days: number;
    timeRange: { from: string; to: string };
    metrics: Record<string, unknown>;
  }>;
  bottlenecks?: Array<{
    id: string;
    kind: string;
    title: string;
    summary: string;
    evidence: string;
    severity?: string;
    confidence?: string;
  }>;
  opportunities?: Array<{
    id: string;
    kind: string;
    title: string;
    summary: string;
    evidence: string;
    confidence?: string;
  }>;
}

export interface MarketingContextResponse {
  snapshot: MarketingContextSnapshot;
  fromCache: boolean;
  snapshotId: string | null;
}

export type AutofillConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export interface AutopilotFormProduct {
  id: string;
  name: string;
  price: number;
  category?: string | null;
  bookingCount30d: number;
}

export interface AutopilotFormSegment {
  id: string;
  name: string;
  source: string;
}

export interface AutopilotFormOptions {
  products: AutopilotFormProduct[];
  segments: AutopilotFormSegment[];
  provinces: string[];
  defaultProvince: string | null;
  defaultProvinceSource: string | null;
  organizationName: string;
  organizationAddress: string | null;
  goals: Array<{ id: string; label: string }>;
  budgetPresets: Array<{ id: string; label: string; amount: number }>;
}

export interface AutofillFieldEvidence {
  value: string | number | null;
  source: string;
  evidence: string;
  confidence: AutofillConfidence;
  hint?: string | null;
}

export interface AutofillFormPayload {
  projectName: string;
  productId: string | null;
  productName: string;
  productPrice: number;
  customerProfile: string;
  customerMode: 'ai' | 'segment' | 'manual';
  segmentId: string | null;
  targetArea: string;
  monthlyBudget: number;
  budgetPresetId: string;
  goals: string[];
  primaryGoal: string;
}

export interface AutofillResponse {
  form: AutofillFormPayload;
  snapshotId: string | null;
  generatedAt: string;
  questions: string[];
  evidence: Record<string, AutofillFieldEvidence>;
}
