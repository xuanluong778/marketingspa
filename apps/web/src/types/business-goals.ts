import type { PaginatedResult } from './api';

export interface BusinessGoalInput {
  averageRevenuePerTransaction: number;
  currentTransactionCount: number;
  variableCostRate: number;
  fixedCost: number;
  leadConversionRate: number;
  targetProfit: number;
}

export type ProfitStatus = 'profit' | 'break_even' | 'loss';

export interface BusinessGoalCalculationResult {
  inputs: BusinessGoalInput;
  totalRevenue: number;
  variableCost: number;
  grossProfit: number;
  grossProfitMargin: number | null;
  grossProfitPerTransaction: number | null;
  breakEvenTransactions: number | null;
  breakEvenLeads: number | null;
  breakEvenLeadsInsufficientData: boolean;
  targetTransactions: number | null;
  targetLeads: number | null;
  targetLeadsInsufficientData: boolean;
  netProfit: number;
  profitMargin: number | null;
  status: ProfitStatus;
}

export interface BusinessGoalScenario extends BusinessGoalInput {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  calculatedRevenue: number;
  calculatedGrossProfit: number;
  calculatedNetProfit: number;
  breakEvenTransactions: number | null;
  breakEvenLeads: number | null;
  targetTransactions: number | null;
  targetLeads: number | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  branch?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string };
}

export type BusinessGoalScenarioList = PaginatedResult<BusinessGoalScenario>;

export interface CreateBusinessGoalScenarioPayload extends BusinessGoalInput {
  name: string;
  branchId?: string;
}

export const defaultBusinessGoalInput: BusinessGoalInput = {
  averageRevenuePerTransaction: 1_500_000,
  currentTransactionCount: 100,
  variableCostRate: 33.33,
  fixedCost: 90_000_000,
  leadConversionRate: 20,
  targetProfit: 80_000_000,
};
