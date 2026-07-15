export type AdCampaignType = 'ENGAGEMENT' | 'MESSAGE_LEAD' | 'SALES' | 'REMARKETING' | 'OTHER';

export interface AdCampaignRow {
  id: string;
  name: string;
  campaignType: AdCampaignType;
  adBudget: number;
  cpm: number;
  resultRate: number;
  frequency: number;
}

export interface AdBusinessInput {
  averageOrderValue: number;
  grossProfitRate: number;
  manualOrderCount: number;
  useManualOrderCount: boolean;
  /** @deprecated giữ tương thích draft cũ */
  manualTotalAdSpend?: number;
  /** @deprecated giữ tương thích draft cũ */
  useManualTotalAdSpend?: boolean;
  otherCost: number;
  leadCloseRate: number;
}

export interface AdPerformanceFormState {
  campaigns: AdCampaignRow[];
  business: AdBusinessInput;
}

export interface AdCampaignCalculated {
  impressions: number;
  resultCount: number;
  costPerResult: number;
  reachPeople: number;
}

export type AdPerformanceStatus = 'profit' | 'loss' | 'break_even';

export interface AdPerformanceWarning {
  id: string;
  message: string;
  tone: 'success' | 'warning' | 'danger';
  priority: number;
}

export interface AdPerformanceInsight {
  id: string;
  label: string;
  value: string;
}

export interface AdPerformanceMetrics {
  campaigns: Array<AdCampaignRow & { calculated: AdCampaignCalculated }>;
  totalAdSpend: number;
  totalOrders: number;
  revenue: number;
  grossProfit: number;
  costOfGoods: number;
  profitPerOrder: number;
  adCostRate: number;
  profitAfterAds: number;
  profitBeforeAds: number;
  costPerOrder: number;
  roas: number;
  breakEvenOrders: number;
  otherCost: number;
  status: AdPerformanceStatus;
  warnings: AdPerformanceWarning[];
  insights: AdPerformanceInsight[];
  hasInput: boolean;
}
