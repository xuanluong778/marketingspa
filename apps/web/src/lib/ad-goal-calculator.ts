/**
 * Calculator for "Tính mục tiêu quảng cáo".
 * Pure functions — không phụ thuộc business-goal metrics / ad-performance.
 */
import type { AdGoalInput, AdGoalMetrics, AdGoalResultRow } from '../types/ad-goals';
import { formatVnd } from './format';

function safe(n: number): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return Math.max(0, n);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Core formulas (simplified funnel: hiển thị → đơn):
 * - Lãi gộp/đơn = AOV × (tỷ suất lãi gộp / 100)
 * - CPQC/đơn     = CPM / 1000 / (CR/100) = CPM / (10 × CR)
 * - Lãi ròng/đơn = lãi gộp/đơn − CPQC/đơn
 * - Số đơn       = ceil(mục tiêu LN / lãi ròng/đơn)
 * - Tổng CPQC    = số đơn × CPQC/đơn
 * - Tổng DT      = số đơn × AOV
 * - Impressions  = ceil(số đơn / (CR/100))
 * - NS/ngày      = tổng CPQC / 30
 * - ROAS         = tổng DT / tổng CPQC
 */
export function calculateAdGoalMetrics(input: AdGoalInput): AdGoalMetrics {
  const cpm = safe(input.cpm);
  const cr = safe(input.conversionRate);
  const aov = safe(input.averageOrderRevenue);
  const gpRate = safe(input.grossProfitRate);
  const target = safe(input.targetMonthlyProfit);

  if (cpm <= 0 || aov <= 0 || gpRate <= 0 || target <= 0) {
    return emptyMetrics('invalid_input');
  }
  if (cr <= 0) {
    return emptyMetrics('zero_conversion');
  }

  const grossProfitPerOrder = roundMoney(aov * (gpRate / 100));
  const adCostPerOrder = roundMoney(cpm / (10 * cr));
  const netProfitPerOrder = roundMoney(grossProfitPerOrder - adCostPerOrder);

  if (netProfitPerOrder <= 0) {
    return {
      grossProfitPerOrder,
      adCostPerOrder,
      netProfitPerOrder,
      netProfitMargin: aov > 0 ? roundPct((netProfitPerOrder / aov) * 100) : null,
      ordersNeeded: null,
      totalAdSpend: null,
      totalRevenue: null,
      impressionsNeeded: null,
      dailyAdBudget: null,
      roas: null,
      achievable: false,
      errorCode: 'negative_net',
    };
  }

  const ordersNeeded = Math.ceil(target / netProfitPerOrder);
  const totalAdSpend = roundMoney(ordersNeeded * adCostPerOrder);
  const totalRevenue = roundMoney(ordersNeeded * aov);
  const impressionsNeeded = Math.ceil(ordersNeeded / (cr / 100));
  const dailyAdBudget = roundMoney(totalAdSpend / 30);
  const roas = totalAdSpend > 0 ? roundPct(totalRevenue / totalAdSpend) : null;
  const netProfitMargin = roundPct((netProfitPerOrder / aov) * 100);

  return {
    grossProfitPerOrder,
    adCostPerOrder,
    netProfitPerOrder,
    netProfitMargin,
    ordersNeeded,
    totalAdSpend,
    totalRevenue,
    impressionsNeeded,
    dailyAdBudget,
    roas,
    achievable: true,
    errorCode: 'ok',
  };
}

function emptyMetrics(code: AdGoalMetrics['errorCode']): AdGoalMetrics {
  return {
    grossProfitPerOrder: null,
    adCostPerOrder: null,
    netProfitPerOrder: null,
    netProfitMargin: null,
    ordersNeeded: null,
    totalAdSpend: null,
    totalRevenue: null,
    impressionsNeeded: null,
    dailyAdBudget: null,
    roas: null,
    achievable: false,
    errorCode: code,
  };
}

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return formatVnd(n);
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}

function fmtCount(n: number | null, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')} ${unit}`;
}

function fmtRoas(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}x`;
}

export function buildAdGoalResultTable(
  input: AdGoalInput,
  metrics: AdGoalMetrics,
): AdGoalResultRow[] {
  return [
    {
      id: 'A',
      code: 'A',
      label: 'Lãi gộp / đơn',
      formula: 'DT/đơn × tỷ suất LN',
      resultText: fmtMoney(metrics.grossProfitPerOrder),
      explanation: 'Tiền lãi trên mỗi đơn trước khi trừ chi phí quảng cáo.',
    },
    {
      id: 'B',
      code: 'B',
      label: 'Chi phí quảng cáo / đơn',
      formula: 'CPM ÷ (10 × CR%)',
      resultText: fmtMoney(metrics.adCostPerOrder),
      explanation:
        'Ước tính hết bao nhiêu tiền QC để có được 1 đơn (dựa trên CPM và tỷ lệ chuyển đổi).',
    },
    {
      id: 'C',
      code: 'C',
      label: 'Lãi ròng / đơn',
      formula: 'A − B',
      resultText: fmtMoney(metrics.netProfitPerOrder),
      explanation: 'Lãi còn lại trên mỗi đơn sau khi đã trừ chi phí quảng cáo.',
    },
    {
      id: 'D',
      code: 'D',
      label: 'Tỷ suất lợi nhuận ròng',
      formula: 'C ÷ DT/đơn',
      resultText: fmtPct(metrics.netProfitMargin),
      explanation: 'Cứ 100 đồng doanh thu đơn thì giữ lại bao nhiêu đồng lãi sau QC.',
    },
    {
      id: 'E',
      code: 'E',
      label: 'Số đơn cần đạt mục tiêu',
      formula: 'Mục tiêu LN ÷ C',
      resultText: fmtCount(metrics.ordersNeeded, 'đơn'),
      explanation: 'Cần chốt bao nhiêu đơn trong tháng để đạt lợi nhuận mục tiêu.',
    },
    {
      id: 'F',
      code: 'F',
      label: 'Tổng chi phí quảng cáo',
      formula: 'E × B',
      resultText: fmtMoney(metrics.totalAdSpend),
      explanation: 'Tổng tiền quảng cáo dự kiến cho cả tháng.',
    },
    {
      id: 'G',
      code: 'G',
      label: 'Tổng doanh thu cần đạt',
      formula: 'E × DT/đơn',
      resultText: fmtMoney(metrics.totalRevenue),
      explanation: 'Tổng tiền bán hàng cần mang về từ các đơn mục tiêu.',
    },
    {
      id: 'H',
      code: 'H',
      label: 'Lượt hiển thị cần có',
      formula: 'E ÷ (CR% / 100)',
      resultText: fmtCount(metrics.impressionsNeeded, 'lượt'),
      explanation: 'Cần bao nhiêu lần quảng cáo hiện ra để có đủ đơn (theo % chuyển đổi hiện tại).',
    },
    {
      id: 'I',
      code: 'I',
      label: 'Ngân sách quảng cáo / ngày',
      formula: 'F ÷ 30',
      resultText: fmtMoney(metrics.dailyAdBudget),
      explanation: 'Chia đều chi phí QC tháng cho 30 ngày để dễ theo dõi hàng ngày.',
    },
    {
      id: 'J',
      code: 'J',
      label: 'ROAS dự kiến',
      formula: 'G ÷ F',
      resultText: fmtRoas(metrics.roas),
      explanation: 'Mỗi 1 đồng chi QC thu về bao nhiêu đồng doanh thu (ví dụ 5x = thu 5 đồng).',
    },
    {
      id: 'in1',
      code: '—',
      label: 'CPM (đầu vào)',
      formula: '',
      resultText: fmtMoney(input.cpm),
      explanation: 'Chi phí cho 1.000 lượt hiển thị quảng cáo.',
    },
    {
      id: 'in2',
      code: '—',
      label: 'Tỷ lệ chuyển đổi (đầu vào)',
      formula: '',
      resultText: fmtPct(input.conversionRate),
      explanation: 'Trong 100 lượt hiển thị, khoảng bao nhiêu % thành đơn hàng.',
    },
  ];
}

export function buildAdGoalPlainSummary(input: AdGoalInput, metrics: AdGoalMetrics): string {
  if (metrics.errorCode === 'zero_conversion') {
    return 'Chưa có tỷ lệ chuyển đổi — điền % chuyển đổi để mình tính số đơn và ngân sách QC.';
  }
  if (metrics.errorCode === 'invalid_input') {
    return 'Điền đủ CPM, doanh thu/đơn, tỷ suất lợi nhuận và mục tiêu lợi nhuận để xem kết quả.';
  }
  if (metrics.errorCode === 'negative_net') {
    const a = fmtMoney(metrics.adCostPerOrder);
    const g = fmtMoney(metrics.grossProfitPerOrder);
    return `Với CPM và % chuyển đổi hiện tại, chi phí QC/đơn (${a}) đang ≥ lãi gộp/đơn (${g}). Cần giảm CPM, tăng chuyển đổi hoặc tăng biên lãi trước khi chạy đủ đơn mục tiêu.`;
  }

  const profit = formatVnd(input.targetMonthlyProfit);
  const orders = metrics.ordersNeeded?.toLocaleString('vi-VN') ?? '—';
  const spend = metrics.totalAdSpend != null ? formatVnd(metrics.totalAdSpend) : '—';
  const daily = metrics.dailyAdBudget != null ? formatVnd(metrics.dailyAdBudget) : '—';
  const roas = metrics.roas != null ? `${metrics.roas.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}x` : '—';

  return `Để kiếm khoảng ${profit}/tháng, bạn cần khoảng ${orders} đơn và ngân sách quảng cáo khoảng ${spend} (≈ ${daily}/ngày). ROAS dự kiến khoảng ${roas}.`;
}

export type AdGoalHighlight = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export function buildAdGoalHighlights(metrics: AdGoalMetrics): AdGoalHighlight[] {
  return [
    {
      id: 'orders',
      label: 'Số đơn cần đạt',
      value: fmtCount(metrics.ordersNeeded, 'đơn'),
      hint: 'Để chạm lợi nhuận mục tiêu',
    },
    {
      id: 'spend',
      label: 'Tổng chi phí QC',
      value: fmtMoney(metrics.totalAdSpend),
      hint: 'Ngân sách quảng cáo / tháng',
    },
    {
      id: 'daily',
      label: 'Ngân sách / ngày',
      value: fmtMoney(metrics.dailyAdBudget),
      hint: 'Chia đều 30 ngày',
    },
    {
      id: 'roas',
      label: 'ROAS dự kiến',
      value: fmtRoas(metrics.roas),
      hint: 'Doanh thu ÷ chi phí QC',
    },
  ];
}
