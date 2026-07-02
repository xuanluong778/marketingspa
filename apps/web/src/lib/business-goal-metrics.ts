import type { BusinessGoalInput } from '@/types/business-goals';
import {
  computeTotalFixedCost,
  computeTotalMarketing,
  computeTotalRevenue,
  deriveApiInput,
  safeNumber,
  type BusinessGoalFormState,
} from './business-goal-form';

export type ProfitStatus = 'profit' | 'break_even' | 'loss';

export type WarningSeverity = 'error' | 'warning' | 'success' | 'info';

export interface BusinessGoalWarning {
  id: string;
  severity: WarningSeverity;
  title: string;
  message: string;
}

export interface BusinessGoalInsight {
  text: string;
}

export interface BusinessGoalMetrics {
  totalRevenue: number;
  variableCost: number;
  grossProfit: number;
  grossProfitMargin: number | null;
  grossProfitPerTransaction: number | null;
  fixedCostOnly: number;
  marketingCost: number;
  totalOperatingCost: number;
  netProfit: number;
  profitMargin: number | null;
  status: ProfitStatus;
  breakEvenTransactions: number | null;
  breakEvenLeads: number | null;
  breakEvenLeadsInsufficientData: boolean;
  targetTransactions: number | null;
  targetLeads: number | null;
  targetLeadsInsufficientData: boolean;
  marketingPercentOfRevenue: number | null;
  heroMessage: string;
  insights: BusinessGoalInsight[];
  warnings: BusinessGoalWarning[];
  apiInput: BusinessGoalInput;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function calculateFromInput(
  input: BusinessGoalInput,
): Omit<
  BusinessGoalMetrics,
  | 'fixedCostOnly'
  | 'marketingCost'
  | 'totalOperatingCost'
  | 'marketingPercentOfRevenue'
  | 'heroMessage'
  | 'insights'
  | 'warnings'
  | 'apiInput'
> {
  const avgRev = safeNumber(input.averageRevenuePerTransaction);
  const txCount = safeNumber(input.currentTransactionCount);
  const varRate = safeNumber(input.variableCostRate);
  const fixedCost = safeNumber(input.fixedCost);
  const convRate = safeNumber(input.leadConversionRate);
  const targetProfit = safeNumber(input.targetProfit);

  const totalRevenue = roundMoney(avgRev * txCount);
  const variableCost = roundMoney(totalRevenue * (varRate / 100));
  const grossProfit = roundMoney(totalRevenue - variableCost);
  const grossProfitMargin =
    totalRevenue > 0 ? roundPercent((grossProfit / totalRevenue) * 100) : null;

  const grossProfitPerTransaction = avgRev > 0 ? roundMoney(avgRev * (1 - varRate / 100)) : null;

  let breakEvenTransactions: number | null = null;
  if (grossProfitPerTransaction !== null && grossProfitPerTransaction > 0) {
    breakEvenTransactions = Math.ceil(fixedCost / grossProfitPerTransaction);
  }

  let breakEvenLeads: number | null = null;
  let breakEvenLeadsInsufficientData = false;
  if (breakEvenTransactions !== null) {
    if (convRate > 0) {
      breakEvenLeads = Math.ceil(breakEvenTransactions / (convRate / 100));
    } else {
      breakEvenLeadsInsufficientData = true;
    }
  }

  let targetTransactions: number | null = null;
  if (grossProfitPerTransaction !== null && grossProfitPerTransaction > 0) {
    targetTransactions = Math.ceil((fixedCost + targetProfit) / grossProfitPerTransaction);
  }

  let targetLeads: number | null = null;
  let targetLeadsInsufficientData = false;
  if (targetTransactions !== null) {
    if (convRate > 0) {
      targetLeads = Math.ceil(targetTransactions / (convRate / 100));
    } else {
      targetLeadsInsufficientData = true;
    }
  }

  const netProfit = roundMoney(grossProfit - fixedCost);
  const profitMargin = totalRevenue > 0 ? roundPercent((netProfit / totalRevenue) * 100) : null;

  let status: ProfitStatus = 'break_even';
  if (netProfit > 0) status = 'profit';
  else if (netProfit < 0) status = 'loss';

  return {
    totalRevenue,
    variableCost,
    grossProfit,
    grossProfitMargin,
    grossProfitPerTransaction,
    netProfit,
    profitMargin,
    status,
    breakEvenTransactions,
    breakEvenLeads,
    breakEvenLeadsInsufficientData,
    targetTransactions,
    targetLeads,
    targetLeadsInsufficientData,
  };
}

function buildHeroMessage(status: ProfitStatus): string {
  if (status === 'profit') return 'Spa đang có lãi, mô hình kinh doanh đang ổn.';
  if (status === 'loss') return 'Spa đang lỗ, cần tối ưu chi phí hoặc tăng doanh thu.';
  return 'Spa đang hòa vốn, cần tăng thêm giao dịch để có lãi.';
}

function buildInsights(
  metrics: ReturnType<typeof calculateFromInput>,
  marketingPercent: number | null,
): BusinessGoalInsight[] {
  const insights: BusinessGoalInsight[] = [];

  if (metrics.breakEvenTransactions !== null) {
    insights.push({
      text: `Bạn cần ${metrics.breakEvenTransactions.toLocaleString('vi-VN')} giao dịch để hòa vốn`,
    });
  }

  if (!metrics.breakEvenLeadsInsufficientData && metrics.breakEvenLeads !== null) {
    insights.push({
      text: `Bạn cần ${metrics.breakEvenLeads.toLocaleString('vi-VN')} lead để hòa vốn`,
    });
  } else if (metrics.breakEvenLeadsInsufficientData) {
    insights.push({ text: 'Chưa đủ dữ liệu lead để tính hòa vốn' });
  }

  if (metrics.grossProfitPerTransaction !== null && metrics.grossProfitPerTransaction > 0) {
    insights.push({
      text: `Mỗi giao dịch đang lãi gộp ${metrics.grossProfitPerTransaction.toLocaleString('vi-VN')}đ`,
    });
  }

  if (metrics.profitMargin !== null) {
    insights.push({
      text: `Tỷ lệ lợi nhuận hiện tại là ${metrics.profitMargin.toFixed(2)}%`,
    });
  }

  if (marketingPercent !== null && metrics.totalRevenue > 0) {
    insights.push({
      text: `Chi phí marketing chiếm ${marketingPercent.toFixed(1)}% doanh thu`,
    });
  }

  return insights;
}

function buildWarnings(
  state: BusinessGoalFormState,
  metrics: ReturnType<typeof calculateFromInput>,
  marketingPercent: number | null,
): BusinessGoalWarning[] {
  const warnings: BusinessGoalWarning[] = [];
  const sell = safeNumber(state.avgSellingPrice || state.avgRevenuePerTransaction);
  const varCost = safeNumber(state.variableCostPerTransaction);

  if (sell > 0 && varCost > 0 && sell <= varCost) {
    warnings.push({
      id: 'sell-below-cost',
      severity: 'error',
      title: 'Giá bán thấp hơn chi phí biến đổi',
      message: 'Càng bán càng dễ lỗ',
    });
  }

  if (metrics.status === 'loss' && metrics.breakEvenTransactions !== null) {
    warnings.push({
      id: 'need-more-tx',
      severity: 'warning',
      title: 'Đang lỗ',
      message: `Cần thêm ${metrics.breakEvenTransactions.toLocaleString('vi-VN')} giao dịch để hòa vốn`,
    });
  }

  if (marketingPercent !== null && marketingPercent > 30) {
    warnings.push({
      id: 'marketing-high',
      severity: 'warning',
      title: 'Chi phí marketing đang cao',
      message: `Marketing chiếm ${marketingPercent.toFixed(1)}% doanh thu (nên dưới 30%)`,
    });
  }

  if (state.leadConversionRate > 0 && state.leadConversionRate < 5) {
    warnings.push({
      id: 'low-conversion',
      severity: 'warning',
      title: 'Tỷ lệ chốt lead thấp',
      message: `Hiện tại ${state.leadConversionRate}% — nên cải thiện quy trình chốt sale`,
    });
  }

  if (metrics.profitMargin !== null && metrics.profitMargin > 25) {
    warnings.push({
      id: 'good-margin',
      severity: 'success',
      title: 'Biên lợi nhuận tốt',
      message: `Tỷ lệ lợi nhuận ${metrics.profitMargin.toFixed(2)}% — trên mức trung bình ngành spa`,
    });
  }

  if (state.leadConversionRate >= 20 && state.leadConversionRate < 25) {
    warnings.push({
      id: 'ok-conversion',
      severity: 'info',
      title: 'Tỷ lệ chuyển đổi ổn',
      message: `${state.leadConversionRate}% — có thể tối ưu lên trên 25%`,
    });
  }

  const priority: Record<WarningSeverity, number> = {
    error: 0,
    warning: 1,
    success: 2,
    info: 3,
  };

  return warnings.sort((a, b) => priority[a.severity] - priority[b.severity]).slice(0, 3);
}

export function calculateBusinessGoalMetrics(state: BusinessGoalFormState): BusinessGoalMetrics {
  const apiInput = deriveApiInput(state);
  const core = calculateFromInput(apiInput);
  const fixedCostOnly = computeTotalFixedCost(state);
  const marketingCost = computeTotalMarketing(state);
  const totalOperatingCost = roundMoney(fixedCostOnly + marketingCost);
  const totalRevenue = computeTotalRevenue(state);
  const marketingPercentOfRevenue =
    totalRevenue > 0 ? roundPercent((marketingCost / totalRevenue) * 100) : null;

  const heroMessage = buildHeroMessage(core.status);
  const insights = buildInsights(core, marketingPercentOfRevenue);
  const warnings = buildWarnings(state, core, marketingPercentOfRevenue);

  return {
    ...core,
    fixedCostOnly,
    marketingCost,
    totalOperatingCost,
    marketingPercentOfRevenue,
    heroMessage,
    insights,
    warnings,
    apiInput,
  };
}
