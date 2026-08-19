export type FunnelScoreDimension =
  | 'offer'
  | 'audience'
  | 'capture'
  | 'followUp'
  | 'automation'
  | 'conversion'
  | 'remarketing'
  | 'tracking';

export interface FunnelValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: 'blocking' | 'warning';
  message: string;
  hint?: string;
}

export interface FunnelDimensionScore {
  score: number;
  max: number;
  issues: string[];
}

export interface FunnelValidatorResult {
  ready: boolean;
  canActivate: boolean;
  score: number;
  dimensions: Record<FunnelScoreDimension, FunnelDimensionScore>;
  checks: FunnelValidationCheck[];
  blocking: string[];
  warnings: string[];
  explanation?: { explanation: string; source: 'ai' | 'rules' };
}

export const FUNNEL_DIMENSION_LABELS: Record<FunnelScoreDimension, string> = {
  offer: 'Offer',
  audience: 'Audience',
  capture: 'Capture',
  followUp: 'Follow-up',
  automation: 'Automation',
  conversion: 'Conversion',
  remarketing: 'Remarketing',
  tracking: 'Tracking',
};
