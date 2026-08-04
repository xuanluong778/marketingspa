/**
 * Facebook / Meta Ads policy check — shared types (API).
 */

export type FacebookPolicySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FacebookPolicyOverallStatus =
  'PASS_CANDIDATE' | 'REVIEW_REQUIRED' | 'HIGH_RISK' | 'PROHIBITED' | 'INSUFFICIENT_DATA';
export type SpecialAdCategory =
  'NONE' | 'CREDIT' | 'EMPLOYMENT' | 'HOUSING' | 'SOCIAL_ISSUES_ELECTIONS_POLITICS';

export type FacebookPolicyUrlKind =
  'website' | 'facebook_post' | 'facebook_video' | 'facebook_reel' | 'landing_page' | 'unknown';

export type FacebookPolicyMeta = {
  policyCode: string;
  policyVersion: string;
  sourceUrl: string;
  reviewedAt: string;
  label: string;
};

export type FacebookPolicyFinding = {
  id: string;
  field: string;
  excerpt: string;
  /** Alias of excerpt — evidence snippet shown to operators. */
  evidence?: string;
  policyGroup: string;
  policyCode: string;
  severity: FacebookPolicySeverity;
  reason: string;
  /** Alias of reason. */
  explanation?: string;
  remediation: string;
  suggestedReplacement?: string;
  /** Alias of suggestedReplacement / remediation. */
  suggestion?: string;
  signalCount: number;
  signals: string[];
  source: 'rule' | 'ai' | 'hybrid';
  dismissedByAi?: boolean;
};

export type FacebookPolicyCheckInput = {
  headline?: string;
  primaryText?: string;
  description?: string;
  cta?: string;
  productService?: string;
  audience?: string;
  country?: string;
  ageMin?: number;
  ageMax?: number;
  specialAdCategory?: SpecialAdCategory;
  brandName?: string;
  contentToRewrite?: string;
  imageOcrText?: string;
  transcript?: string;
  landingPageText?: string;
  landingUrl?: string;
  organizationId?: string | null;
};

export type FacebookPolicyCheckResult = {
  riskScore: number;
  confidence: number;
  overallStatus: FacebookPolicyOverallStatus;
  findings: FacebookPolicyFinding[];
  rewrittenContent: string | null;
  policyMeta: FacebookPolicyMeta;
  layers: {
    ruleFindingCount: number;
    aiReviewed: boolean;
    aiSource: 'ai' | 'skipped' | 'fallback';
    falsePositivesDismissed: number;
  };
  organizationId: string | null;
  requiresRecheck: boolean;
  summary: string;
};

export type FacebookPolicyRewriteResult = {
  rewrittenContent: string;
  preserved: {
    brandName: boolean;
    product: boolean;
    price: boolean;
    phone: boolean;
    address: boolean;
    offer: boolean;
  };
  changes: string[];
  requiresRecheck: true;
  policyMeta: FacebookPolicyMeta;
  organizationId: string | null;
  source: 'ai' | 'template';
  preliminaryRiskScore: number;
  preliminaryStatus: FacebookPolicyOverallStatus;
};

export type FacebookPolicyRule = {
  id: string;
  policyGroup: string;
  policyCode: string;
  severity: FacebookPolicySeverity;
  minSignals: number;
  signals: string[];
  reason: string;
  remediation: string;
  suggestedReplacement?: string;
  fieldHint?: string;
};

export type LandingSignals = {
  productHints: string[];
  priceHints: string[];
  ctaHints: string[];
  hasSensitiveForm: boolean;
  phishingSignals: string[];
};

export type FacebookPolicyImportResult = {
  sourceType: FacebookPolicyUrlKind;
  url: string;
  finalUrl?: string;
  editable: true;
  headline?: string;
  primaryText?: string;
  description?: string;
  permalink?: string;
  thumbnailUrl?: string;
  pageId?: string;
  pageName?: string;
  warnings: string[];
  insufficientData: boolean;
  statusHint?: 'INSUFFICIENT_DATA' | 'OK' | 'PERMISSION_REQUIRED';
  message?: string;
  landing?: LandingSignals;
};

export type FacebookPolicyMediaAnalysis = {
  mediaType: 'image' | 'video' | 'transcript';
  ocrText: string;
  transcript: string;
  caption: string;
  visualNotes: string[];
  regions: Array<{
    label: string;
    box?: { x: number; y: number; w: number; h: number };
    startSec?: number;
    endSec?: number;
  }>;
  findings: FacebookPolicyFinding[];
  insufficientData: boolean;
  statusHint: 'OK' | 'INSUFFICIENT_DATA';
  message?: string;
  warnings: string[];
};
