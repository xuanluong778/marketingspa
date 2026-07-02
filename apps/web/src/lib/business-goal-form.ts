import type { BusinessGoalInput } from '@/types/business-goals';

export interface CostLineItem {
  id: string;
  category: string;
  customLabel?: string;
  amount: number;
  note?: string;
}

export interface BusinessGoalFormState {
  revenueType: string;
  revenueTypeNote: string;
  transactionCount: number;
  avgRevenuePerTransaction: number;
  totalRevenueManual: number;
  totalRevenueManualEnabled: boolean;

  variableCostPerTransaction: number;
  avgSellingPrice: number;
  totalVariableCostManual: number;
  totalVariableCostManualEnabled: boolean;
  variableCostLines: CostLineItem[];

  fixedCostLines: CostLineItem[];
  totalFixedCostManual: number;
  totalFixedCostManualEnabled: boolean;

  marketingLines: CostLineItem[];
  totalMarketingManual: number;
  totalMarketingManualEnabled: boolean;

  leadCount: number;
  leadConversionRate: number;
  leadSource: string;
  leadSourceNote: string;

  targetRevenue: number;
  targetProfit: number;
  goalType: string;
  goalTypeNote: string;
}

export function createLineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCostLine(category: string, amount = 0): CostLineItem {
  return { id: createLineId(), category, amount, note: '' };
}

export function sumLineAmounts(lines: CostLineItem[]): number {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0);
}

export function safeNumber(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  return Math.max(0, value);
}

export const defaultBusinessGoalFormState: BusinessGoalFormState = {
  revenueType: 'SKIN_CARE',
  revenueTypeNote: '',
  transactionCount: 100,
  avgRevenuePerTransaction: 1_500_000,
  totalRevenueManual: 0,
  totalRevenueManualEnabled: false,

  variableCostPerTransaction: 500_000,
  avgSellingPrice: 1_500_000,
  totalVariableCostManual: 0,
  totalVariableCostManualEnabled: false,
  variableCostLines: [],

  fixedCostLines: [],
  totalFixedCostManual: 80_000_000,
  totalFixedCostManualEnabled: true,

  marketingLines: [],
  totalMarketingManual: 30_000_000,
  totalMarketingManualEnabled: true,

  leadCount: 500,
  leadConversionRate: 20,
  leadSource: 'FACEBOOK',
  leadSourceNote: '',

  targetRevenue: 300_000_000,
  targetProfit: 100_000_000,
  goalType: 'GROWTH',
  goalTypeNote: '',
};

export const sampleBusinessGoalFormState: BusinessGoalFormState = {
  ...defaultBusinessGoalFormState,
};

const DRAFT_KEY = 'ms_business_goal_draft';

export function saveBusinessGoalDraft(state: BusinessGoalFormState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
}

export function loadBusinessGoalDraft(): BusinessGoalFormState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BusinessGoalFormState;
  } catch {
    return null;
  }
}

export function clearBusinessGoalDraft(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DRAFT_KEY);
}

export function computeTotalRevenue(state: BusinessGoalFormState): number {
  const auto = safeNumber(state.transactionCount) * safeNumber(state.avgRevenuePerTransaction);
  if (state.totalRevenueManualEnabled && state.totalRevenueManual > 0) {
    return safeNumber(state.totalRevenueManual);
  }
  return auto;
}

export function computeTotalVariableCost(state: BusinessGoalFormState): number {
  const fromLines = sumLineAmounts(state.variableCostLines);
  if (fromLines > 0) return fromLines;

  if (state.totalVariableCostManualEnabled && state.totalVariableCostManual > 0) {
    return safeNumber(state.totalVariableCostManual);
  }

  return safeNumber(state.variableCostPerTransaction) * safeNumber(state.transactionCount);
}

export function computeTotalFixedCost(state: BusinessGoalFormState): number {
  const fromLines = sumLineAmounts(state.fixedCostLines);
  if (fromLines > 0) return fromLines;

  if (state.totalFixedCostManualEnabled && state.totalFixedCostManual > 0) {
    return safeNumber(state.totalFixedCostManual);
  }

  return 0;
}

export function computeTotalMarketing(state: BusinessGoalFormState): number {
  const fromLines = sumLineAmounts(state.marketingLines);
  if (fromLines > 0) return fromLines;

  if (state.totalMarketingManualEnabled && state.totalMarketingManual > 0) {
    return safeNumber(state.totalMarketingManual);
  }

  return 0;
}

export function deriveApiInput(state: BusinessGoalFormState): BusinessGoalInput {
  const totalRevenue = computeTotalRevenue(state);
  const totalVariableCost = computeTotalVariableCost(state);
  const fixedCost = computeTotalFixedCost(state) + computeTotalMarketing(state);

  let variableCostRate = 0;
  if (totalRevenue > 0) {
    variableCostRate = (totalVariableCost / totalRevenue) * 100;
  } else if (state.avgSellingPrice > 0) {
    variableCostRate = (safeNumber(state.variableCostPerTransaction) / state.avgSellingPrice) * 100;
  }

  return {
    averageRevenuePerTransaction: safeNumber(state.avgRevenuePerTransaction),
    currentTransactionCount: Math.round(safeNumber(state.transactionCount)),
    variableCostRate: Math.min(100, Math.max(0, variableCostRate)),
    fixedCost: safeNumber(fixedCost),
    leadConversionRate: Math.min(100, Math.max(0, safeNumber(state.leadConversionRate))),
    targetProfit: safeNumber(state.targetProfit),
  };
}

export function formStateFromApiInput(input: BusinessGoalInput): BusinessGoalFormState {
  return {
    ...defaultBusinessGoalFormState,
    transactionCount: input.currentTransactionCount,
    avgRevenuePerTransaction: Number(input.averageRevenuePerTransaction),
    avgSellingPrice: Number(input.averageRevenuePerTransaction),
    variableCostPerTransaction:
      input.averageRevenuePerTransaction > 0
        ? Math.round(
            (Number(input.variableCostRate) / 100) * Number(input.averageRevenuePerTransaction),
          )
        : defaultBusinessGoalFormState.variableCostPerTransaction,
    targetProfit: Number(input.targetProfit),
    leadConversionRate: Number(input.leadConversionRate),
    fixedCostLines: [createCostLine('OTHER', Number(input.fixedCost))],
    marketingLines: [],
  };
}
