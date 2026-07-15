import type {
  AdCampaignRow,
  AdPerformanceFormState,
  AdPerformanceInsight,
  AdPerformanceMetrics,
  AdPerformanceWarning,
} from '@/types/ad-performance';

export function safeAdNumber(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  return Math.max(0, value);
}

export function calculateCampaignMetrics(row: AdCampaignRow) {
  const adBudget = safeAdNumber(row.adBudget);
  const cpm = safeAdNumber(row.cpm);
  const resultRate = safeAdNumber(row.resultRate);
  const frequency = safeAdNumber(row.frequency);

  const impressions = cpm > 0 ? (adBudget / cpm) * 1000 : 0;
  const resultCount = impressions * (resultRate / 100);
  const costPerResult = resultCount > 0 ? adBudget / resultCount : 0;
  const reachPeople = frequency > 0 ? impressions / frequency : 0;

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
    | 'business.otherCost'
    | 'business.leadCloseRate',
    string
  >
>;

export function validateAdPerformanceInput(
  state: AdPerformanceFormState,
): AdPerformanceFieldErrors {
  const errors: AdPerformanceFieldErrors = {};

  state.campaigns.forEach((row, index) => {
    if (row.adBudget > 0 || row.cpm > 0 || row.name.trim()) {
      if (!row.name.trim()) {
        errors[`campaign.${index}.name`] = 'Nhập tên chiến dịch';
      }
      if (row.cpm <= 0 && row.adBudget > 0) {
        errors[`campaign.${index}.cpm`] = 'CPM phải lớn hơn 0';
      }
      if (row.frequency <= 0 && row.adBudget > 0) {
        errors[`campaign.${index}.frequency`] = 'Tần suất phải lớn hơn 0';
      }
    }

    (['adBudget', 'cpm', 'resultRate', 'frequency'] as const).forEach((field) => {
      const value = row[field];
      if (!Number.isFinite(value) || value < 0) {
        errors[`campaign.${index}.${field}`] = 'Giá trị không hợp lệ';
      }
    });
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
  if (!Number.isFinite(business.otherCost) || business.otherCost < 0) {
    errors['business.otherCost'] = 'Chi phí khác không hợp lệ';
  }
  if (
    !Number.isFinite(business.leadCloseRate) ||
    business.leadCloseRate < 0 ||
    business.leadCloseRate > 100
  ) {
    errors['business.leadCloseRate'] = 'Tỷ lệ chốt lead từ 0–100%';
  }

  return errors;
}

function buildWarnings(
  profitAfterAds: number,
  adCostRate: number,
  costPerOrder: number,
  profitPerOrder: number,
  roas: number,
): AdPerformanceWarning[] {
  const all: AdPerformanceWarning[] = [];

  if (profitAfterAds < 0) {
    all.push({
      id: 'loss',
      message: 'Chiến dịch đang lỗ, cần tăng đơn hàng hoặc giảm chi phí quảng cáo.',
      tone: 'danger',
      priority: 1,
    });
  }
  if (costPerOrder > profitPerOrder && profitPerOrder > 0) {
    all.push({
      id: 'cpo-vs-profit',
      message: 'Chi phí quảng cáo/đơn cao hơn lãi/đơn, càng chạy càng dễ lỗ.',
      tone: 'danger',
      priority: 2,
    });
  }
  if (roas > 0 && roas < 1) {
    all.push({
      id: 'low-roas',
      message: 'ROAS thấp, doanh thu chưa đủ bù chi phí quảng cáo.',
      tone: 'danger',
      priority: 3,
    });
  }
  if (adCostRate > 30) {
    all.push({
      id: 'high-ad-rate',
      message: 'Tỷ lệ chi phí quảng cáo đang cao.',
      tone: 'warning',
      priority: 4,
    });
  }
  if (profitAfterAds > 0 && roas >= 3) {
    all.push({
      id: 'scale-up',
      message: 'Chiến dịch đang hiệu quả, có thể cân nhắc tăng ngân sách.',
      tone: 'success',
      priority: 5,
    });
  }

  return all.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function buildInsights(
  metrics: Omit<AdPerformanceMetrics, 'insights' | 'warnings' | 'hasInput'>,
  formatVnd: (n: number) => string,
  formatPercent: (n: number) => string,
  formatCount: (n: number) => string,
): AdPerformanceInsight[] {
  const profitLabel =
    metrics.profitAfterAds > 0
      ? `lãi ${formatVnd(metrics.profitAfterAds)}`
      : metrics.profitAfterAds < 0
        ? `lỗ ${formatVnd(Math.abs(metrics.profitAfterAds))}`
        : 'hòa vốn';

  return [
    {
      id: 'profit-summary',
      label: 'Kết quả sau quảng cáo',
      value: `Bạn đang ${profitLabel} sau quảng cáo`,
    },
    {
      id: 'roas',
      label: 'ROAS',
      value: `ROAS hiện tại là ${metrics.totalAdSpend > 0 ? formatCount(metrics.roas) : '—'}`,
    },
    {
      id: 'profit-per-order',
      label: 'Lãi gộp/đơn',
      value: `Mỗi đơn hàng đang lời gộp ${formatVnd(metrics.profitPerOrder)}`,
    },
    {
      id: 'cost-per-order',
      label: 'Chi phí QC/đơn',
      value: `Chi phí quảng cáo/đơn là ${formatVnd(metrics.costPerOrder)}`,
    },
    {
      id: 'break-even',
      label: 'Hòa vốn',
      value: `Cần tối thiểu ${formatCount(metrics.breakEvenOrders)} đơn hàng để hòa vốn`,
    },
    {
      id: 'ad-rate',
      label: 'Tỷ lệ chi QC',
      value: `Chi phí quảng cáo chiếm ${formatPercent(metrics.adCostRate)} doanh thu`,
    },
  ];
}

function resolveTotalOrders(
  state: AdPerformanceFormState,
  campaigns: Array<AdCampaignRow & { calculated: ReturnType<typeof calculateCampaignMetrics> }>,
): number {
  if (state.business.useManualOrderCount) {
    return safeAdNumber(state.business.manualOrderCount);
  }

  const ordersFromSales = campaigns
    .filter((row) => row.campaignType === 'SALES')
    .reduce((sum, row) => sum + row.calculated.resultCount, 0);

  if (ordersFromSales > 0) {
    return Math.round(ordersFromSales);
  }

  const leadsFromCampaigns = campaigns
    .filter((row) => row.campaignType === 'MESSAGE_LEAD')
    .reduce((sum, row) => sum + row.calculated.resultCount, 0);

  const leadCloseRate = safeAdNumber(state.business.leadCloseRate);
  if (leadsFromCampaigns > 0 && leadCloseRate > 0) {
    return Math.round(leadsFromCampaigns * (leadCloseRate / 100));
  }

  return 0;
}

export function calculateAdPerformanceMetrics(state: AdPerformanceFormState): AdPerformanceMetrics {
  const campaigns = state.campaigns.map((row) => ({
    ...row,
    calculated: calculateCampaignMetrics(row),
  }));

  const budgetFromCampaigns = campaigns.reduce((sum, row) => sum + safeAdNumber(row.adBudget), 0);
  const totalAdSpend =
    state.business.useManualTotalAdSpend && state.business.manualTotalAdSpend
      ? safeAdNumber(state.business.manualTotalAdSpend)
      : budgetFromCampaigns;

  const otherCost = safeAdNumber(state.business.otherCost);
  const totalOrders = resolveTotalOrders(state, campaigns);
  const averageOrderValue = safeAdNumber(state.business.averageOrderValue);
  const grossProfitRate = safeAdNumber(state.business.grossProfitRate);

  const revenue = totalOrders * averageOrderValue;
  const grossProfit = revenue * (grossProfitRate / 100);
  const costOfGoods = revenue - grossProfit;
  const profitPerOrder = averageOrderValue * (grossProfitRate / 100);
  const adCostRate = revenue > 0 ? (totalAdSpend / revenue) * 100 : 0;
  const profitBeforeAds = grossProfit;
  const profitAfterAds = grossProfit - totalAdSpend - otherCost;
  const costPerOrder = totalOrders > 0 ? totalAdSpend / totalOrders : 0;
  const roas = totalAdSpend > 0 ? revenue / totalAdSpend : 0;
  const breakEvenOrders =
    profitPerOrder > 0 ? Math.ceil((totalAdSpend + otherCost) / profitPerOrder) : 0;

  let status: AdPerformanceMetrics['status'] = 'break_even';
  if (profitAfterAds > 0) status = 'profit';
  else if (profitAfterAds < 0) status = 'loss';

  const hasInput =
    budgetFromCampaigns > 0 ||
    averageOrderValue > 0 ||
    totalOrders > 0 ||
    state.campaigns.some((c) => c.name.trim() !== '');

  const core = {
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
    roas: safeAdNumber(roas),
    breakEvenOrders: safeAdNumber(breakEvenOrders),
    otherCost,
    status,
  };

  const fmtVnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))}đ`;
  const fmtPct = (n: number) =>
    `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n)}%`;
  const fmtCount = (n: number) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);

  return {
    ...core,
    warnings: buildWarnings(profitAfterAds, adCostRate, costPerOrder, profitPerOrder, roas),
    insights: buildInsights(core, fmtVnd, fmtPct, fmtCount),
    hasInput,
  };
}
