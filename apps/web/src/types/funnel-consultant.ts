import type { FunnelCompleteSpec } from './funnel';
import type { FunnelValidatorResult } from './funnel-validator';

export type FunnelConsultantIntent =
  | 'ADD_MINI_GAME'
  | 'CHANGE_OFFER'
  | 'NO_DISCOUNT'
  | 'ADD_MESSENGER'
  | 'ADD_REMARKETING'
  | 'OPTIMIZE_FOLLOW_UP'
  | 'OPTIMIZE_FROM_DATA'
  | 'CUSTOM';

export interface FunnelConsultantDiffItem {
  path: string;
  before: string;
  after: string;
}

export interface FunnelConsultantInsight {
  topic: 'drop-off' | 'cpl' | 'booking' | 'sla' | 'conversion' | 'data';
  message: string;
  suggestedIntent?: FunnelConsultantIntent;
}

export interface FunnelConsultantProposal {
  applied: false;
  deployable: false;
  budgetChanged: false;
  requiresConfirmation: true;
  source: 'ai' | 'rules';
  intents: FunnelConsultantIntent[];
  rationale: string;
  changes: string[];
  diff: FunnelConsultantDiffItem[];
  proposed: FunnelCompleteSpec;
  validation: FunnelValidatorResult;
  insights: FunnelConsultantInsight[];
  specHash: string;
}

export const FUNNEL_CONSULTANT_CHIPS: Array<{
  intent: FunnelConsultantIntent;
  label: string;
}> = [
  { intent: 'ADD_MINI_GAME', label: 'Thêm mini game' },
  { intent: 'CHANGE_OFFER', label: 'Đổi offer' },
  { intent: 'NO_DISCOUNT', label: 'Không giảm giá' },
  { intent: 'ADD_MESSENGER', label: 'Thêm Messenger' },
  { intent: 'ADD_REMARKETING', label: 'Thêm remarketing' },
  { intent: 'OPTIMIZE_FOLLOW_UP', label: 'Tối ưu follow-up' },
];
