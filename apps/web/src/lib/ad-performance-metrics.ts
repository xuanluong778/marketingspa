import type {
  AdCampaignRow,
  AdPerformanceFormState,
  AdPerformanceMetrics,
  AdPerformanceWarning,
} from '@/types/ad-performance';

export function safeAdNumber(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  return value;
}

export function calculateCampaignMetrics(row: AdCampaignRow) {
  const adBudget = safeAdNumber(row.adBudget);
  const cpm = safeAdNumber(row.cpm);
  const resultRate = safeAdNumber(row.resultRate);
  const frequency = safeAdNumber(row.frequency);

  const impressions = cpm > 0 ? (adBudget / cpm) * 1000 : 0;
  const resultCount = impressions * (resultRate / 100);
  const costPerResult = resultCount > 0 ? adBudget / resultCount : 0;
  const reachPeople = frequency > 0 ? resultCount / frequency : 0;

  return {
    impressions: safeAdNumber(impressions),
    resultCount: safeAdNumber(resultCount),
    costPerResult: safeAdNumber(costPerResult),
    reachPeople: safeAdNumber(reachPeople),
  };
}

export type AdPerformanceFieldErrors = Partial<
  Record<
    | `campaign.${number}.name`
    | `campaign.${number}.adBudget`
    | `campaign.${number}.cpm`
    | `campaign.${number}.resultRate`
    | `campaign.${number}.frequency`
    | 'business.averageOrderValue'
    | 'business.grossProfitRate'
    | 'business.manualOrderCount'
    | 'business.manualTotalAdSpend',
    string
  >
>;

export function validateAdPerformanceInput(
  state: AdPerformanceFormState,
): AdPerformanceFieldErrors {
  const errors: AdPerformanceFieldErrors = {};

  state.campaigns.forEach((row, index) => {
    if (!row.name.trim()) {
      errors[`campaign.${index}.name`] = 'Nhập tên chiến dịch';
    }
    (['adBudget', 'cpm', 'resultRate', 'frequency'] as const).forEach((field) => {
      const value = row[field];
      if (!Number.isFinite(value) || value < 0) {
        errors[`campaign.${index}.${field}`] = 'Giá trị không hợp lệ';
      }
    });
    if (row.cpm <= 0) {
      errors[`campaign.${index}.cpm`] = 'CPM phải lớn hơn 0';
    }
    if (row.frequency <= 0) {
      errors[`campaign.${index}.frequency`] = 'Tần suất phải lớn hơn 0';
    }
  });

  const { business } = state;
  if (!Number.isFinite(business.averageOrderValue) || business.averageOrderValue < 0) {
    errors['business.averageOrderValue'] = 'Giá/đơn hàng không hợp lệ';
  }
  if (
    !Number.isFinite(business.grossProfitRate) ||
    business.grossProfitRate < 0 ||
    business.grossProfitRate > 100
  ) {
    errors['business.grossProfitRate'] = 'Tỷ suất lợi nhuận từ 0–100%';
  }
  if (business.useManualOrderCount && business.manualOrderCount < 0) {
    errors['business.manualOrderCount'] = 'Số đơn hàng không hợp lệ';
  }
  if (business.useManualTotalAdSpend && business.manualTotalAdSpend < 0) {
    errors['business.manualTotalAdSpend'] = 'Tổng tiền quảng cáo không hợp lệ';
  }

  return errors;
}

function buildWarnings(
  profitAfterAds: number,
  adCostRate: number,
  costPerOrder: number,
  profitPerOrder: number,
  hasInvalidResultRate: boolean,
): AdPerformanceWarning[] {
  const warnings: AdPerformanceWarning[] = [];

  if (hasInvalidResultRate) {
    warnings.push({
      id: 'invalid-result-rate',
      message: 'Chưa có tỷ lệ kết quả hợp lệ.',
      tone: 'warning',
    });
  }
  if (profitAfterAds > 0) {
    warnings.push({
      id: 'profit',
      message: 'Chiến dịch đang có lãi.',
      tone: 'success',
    });
  } else if (profitAfterAds < 0) {
    warnings.push({
      id: 'loss',
      message: 'Chiến dịch đang lỗ, cần giảm chi phí quảng cáo hoặc tăng tỷ lệ chuyển đổi.',
      tone: 'danger',
    });
  }
  if (adCostRate > 30) {
    warnings.push({
      id: 'high-ad-rate',
      message: 'Tỷ lệ chi phí quảng cáo đang cao.',
      tone: 'warning',
    });
  }
  if (costPerOrder > profitPerOrder && profitPerOrder > 0) {
    warnings.push({
      id: 'cpo-vs-profit',
      message: 'Chi phí quảng cáo/đơn cao hơn lãi/đơn, càng chạy càng dễ lỗ.',
      tone: 'danger',
    });
  }

  return warnings;
}

export function calculateAdPerformanceMetrics(state: AdPerformanceFormState): AdPerformanceMetrics {
  const campaigns = state.campaigns.map((row) => ({
    ...row,
    calculated: calculateCampaignMetrics(row),
  }));

  const budgetFromCampaigns = campaigns.reduce((sum, row) => sum + safeAdNumber(row.adBudget), 0);
  const totalAdSpend = state.business.useManualTotalAdSpend
    ? safeAdNumber(state.business.manualTotalAdSpend)
    : budgetFromCampaigns;

  const ordersFromSales = campaigns
    .filter((row) => row.campaignType === 'SALES')
    .reduce((sum, row) => sum + row.calculated.resultCount, 0);

  const totalOrders = state.business.useManualOrderCount
    ? safeAdNumber(state.business.manualOrderCount)
    : Math.round(ordersFromSales);

  const averageOrderValue = safeAdNumber(state.business.averageOrderValue);
  const grossProfitRate = safeAdNumber(state.business.grossProfitRate);

  const revenue = totalOrders * averageOrderValue;
  const grossProfit = revenue * (grossProfitRate / 100);
  const costOfGoods = revenue - grossProfit;
  const profitPerOrder = averageOrderValue * (grossProfitRate / 100);
  const adCostRate = revenue > 0 ? (totalAdSpend / revenue) * 100 : 0;
  const profitBeforeAds = grossProfit;
  const profitAfterAds = grossProfit - totalAdSpend;
  const costPerOrder = totalOrders > 0 ? totalAdSpend / totalOrders : 0;

  let status: AdPerformanceMetrics['status'] = 'break_even';
  if (profitAfterAds > 0) status = 'profit';
  else if (profitAfterAds < 0) status = 'loss';

  const hasInvalidResultRate = state.campaigns.some(
    (row) => !Number.isFinite(row.resultRate) || row.resultRate <= 0,
  );

  return {
    campaigns,
    totalAdSpend: safeAdNumber(totalAdSpend),
    totalOrders: safeAdNumber(totalOrders),
    revenue: safeAdNumber(revenue),
    grossProfit: safeAdNumber(grossProfit),
    costOfGoods: safeAdNumber(costOfGoods),
    profitPerOrder: safeAdNumber(profitPerOrder),
    adCostRate: safeAdNumber(adCostRate),
    profitAfterAds: safeAdNumber(profitAfterAds),
    profitBeforeAds: safeAdNumber(profitBeforeAds),
    costPerOrder: safeAdNumber(costPerOrder),
    status,
    warnings: buildWarnings(
      profitAfterAds,
      adCostRate,
      costPerOrder,
      profitPerOrder,
      hasInvalidResultRate,
    ),
  };
}
