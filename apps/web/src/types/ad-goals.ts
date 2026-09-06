/**
 * Types for tab "Tính mục tiêu quảng cáo" — isolated from business-goal scenarios.
 */

export type AdGoalInput = {
  /** Chi phí cho 1.000 lượt hiển thị (VNĐ) */
  cpm: number;
  /** Tỷ lệ chuyển đổi hiển thị → đơn (%) */
  conversionRate: number;
  /** Doanh thu trung bình một đơn (VNĐ) */
  averageOrderRevenue: number;
  /** Tỷ suất lãi gộp trên doanh thu đơn (%) — chưa trừ QC */
  grossProfitRate: number;
  /** Mục tiêu lợi nhuận ròng / tháng sau khi trừ QC (VNĐ) */
  targetMonthlyProfit: number;
};

export type AdGoalMetrics = {
  /** Lãi gộp / đơn (trước QC) */
  grossProfitPerOrder: number | null;
  /** Chi phí quảng cáo / đơn */
  adCostPerOrder: number | null;
  /** Lãi ròng / đơn (sau QC) */
  netProfitPerOrder: number | null;
  /** Tỷ suất lợi nhuận ròng % = net / AOV */
  netProfitMargin: number | null;
  /** Số đơn cần đạt mục tiêu */
  ordersNeeded: number | null;
  /** Tổng chi phí quảng cáo / tháng */
  totalAdSpend: number | null;
  /** Tổng doanh thu cần đạt */
  totalRevenue: number | null;
  /** Lượt hiển thị cần có */
  impressionsNeeded: number | null;
  /** Ngân sách QC / ngày (chia 30) */
  dailyAdBudget: number | null;
  /** ROAS = doanh thu / chi phí QC */
  roas: number | null;
  /** Có thể tính được mục tiêu không (lãi ròng dương) */
  achievable: boolean;
  errorCode: 'ok' | 'invalid_input' | 'negative_net' | 'zero_conversion';
};

export type AdGoalResultRow = {
  id: string;
  code: string;
  label: string;
  formula: string;
  resultText: string;
  explanation: string;
};

export const defaultAdGoalInput: AdGoalInput = {
  cpm: 35_000,
  conversionRate: 0.15,
  averageOrderRevenue: 500_000,
  grossProfitRate: 38,
  targetMonthlyProfit: 27_000_000,
};

export const sampleAdGoalInput: AdGoalInput = {
  ...defaultAdGoalInput,
};
