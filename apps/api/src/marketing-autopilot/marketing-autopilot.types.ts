export type MarketingAutopilotNextBestAction = {
  type: string;
  label?: string;
  rationale?: string;
  evidence?: MarketingAutopilotRecommendationEvidence;
  /** NBA Engine V2 fields */
  priority?: number;
  title?: string;
  whyNow?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  expectedImpact?: string;
  estimatedCost?: number | null;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedDraft?: string;
  /** Plain evidence string for V2 ranking (distinct from structured evidence). */
  evidenceText?: string;
};

export type BudgetScenarioMetric = {
  value: number | null;
  status: 'historical' | 'estimate' | 'INSUFFICIENT_DATA';
  note?: string;
  basedOn: string[];
  timeRange: { from: string; to: string } | null;
  sampleSize: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
};

export type BudgetScenario = {
  scenarioId: '5tr' | '10tr' | '20tr' | '50tr' | 'custom';
  label: string;
  monthlyBudget: number;
  estimates: {
    leads: BudgetScenarioMetric;
    bookings: BudgetScenarioMetric;
    revenue: BudgetScenarioMetric;
    cpl: BudgetScenarioMetric;
    cpa: BudgetScenarioMetric;
    roas: BudgetScenarioMetric;
  };
  dataQuality: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  assumptions: string[];
  timeRange?: { from: string; to: string } | null;
};

export type MarketingAutopilotRecommendationEvidence = {
  reason: string;
  evidence: string;
  source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  expectedImpact: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type MarketingAutopilotPlannerMeta = {
  engine: 'strategy-planner-v3' | 'strategy-planner-v2' | 'llm-planner' | 'heuristic-orchestrator';
  usedLlm: boolean;
  model?: string | null;
  fallbackReason?: string | null;
  schemaVersion?: string | null;
  latencyMs?: number | null;
  plannerSteps?: Array<
    'context' | 'diagnose' | 'strategy' | 'nba' | 'budget' | 'draft' | 'critic' | 'repair' | 'build'
  >;
  criticPassed?: boolean | null;
};

export type MarketingAutopilotPlan = {
  customersTarget: { targetProfile: string; personas: string[]; targetArea: string };
  customerProfile: string;
  offer: { productName: string; productPrice: number; primaryGoal: string; valueProps: string[] };
  funnel: { stages: Array<{ name: string; objective: string }> };
  content: { channels: string[]; themes: string[]; formats: string[] };
  ads: { strategy: string; budgetSharePercent: number };
  crm: { leadScoring: string; lifecycle: string[]; segmentation: string[] };
  chatbot: { purpose: string; keyFlows: string[] };
  communications: { email: string[]; messenger: string[]; zalo: string[] };
  emailMessengerZalo: { email: string[]; messenger: string[]; zalo: string[] };
  remarketing: { audiences: string[]; cadence: string; messageTheme: string };
  kpi: { kpis: Array<{ name: string; target: number; unit: string }> };
  budget: { monthlyBudget: number; split: Array<{ channel: string; percent: number }> };
  timeline: { phases: Array<{ phase: string; focus: string; durationWeeks: number }> };
  businessDiagnosis?: { bottlenecks: string[]; strengths: string[]; opportunities: string[] };
  icpProfiles?: Array<{ name: string; description: string; priority: number }>;
  channelStrategy?: Array<{ channel: string; role: string; budgetSharePercent: number }>;
  valueProposition?: string;
  timeline306090?: { days30: string[]; days60: string[]; days90: string[] };
};

export type AutopilotAnalysis = {
  summary: string;
  score: number;
  suggestedChannels: string[];
  risks: string[];
  nextSteps: string[];
  budgetSplit: Array<{ channel: string; percent: number }>;
  plan: MarketingAutopilotPlan;
  nextBestActions: MarketingAutopilotNextBestAction[];
  budgetScenarios?: BudgetScenario[];
  nbaEngine?: {
    version: 'v3' | 'v2';
    rankedAt?: string;
    maxActions: number;
  };
  safety: {
    policy: 'READ_ONLY';
    highRiskActionSuggestionsBlocked: string[];
  };
  contextUsed?: {
    snapshotId?: string | null;
    generatedAt?: string;
    insightCount: number;
    topInsights: Array<{ title: string; evidence: string; confidence: string }>;
  };
  plannerMeta?: MarketingAutopilotPlannerMeta;
  sectionRecommendations?: Partial<
    Record<
      | 'goal'
      | 'icp'
      | 'offer'
      | 'funnel'
      | 'content'
      | 'ads'
      | 'crm'
      | 'chatbot'
      | 'followUp'
      | 'remarketing'
      | 'kpi'
      | 'budget'
      | 'timeline'
      | 'businessDiagnosis'
      | 'icpProfiles'
      | 'channelStrategy'
      | 'assumptions',
      MarketingAutopilotRecommendationEvidence
    >
  >;
  strategyV2?: {
    businessDiagnosis?: MarketingAutopilotPlan['businessDiagnosis'];
    icpProfiles?: MarketingAutopilotPlan['icpProfiles'];
    channelStrategy?: MarketingAutopilotPlan['channelStrategy'];
    assumptions?: string[];
    timeline306090?: { days30: string[]; days60: string[]; days90: string[] };
  };
};

export type MarketingAutopilotDraftType =
  | 'CONTENT_DRAFT'
  | 'FUNNEL_DRAFT'
  | 'AUTOMATION_DRAFT'
  | 'CAMPAIGN_DRAFT';
