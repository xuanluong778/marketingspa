export type AdConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'ERROR'
  | 'PENDING_ACCOUNT';

export interface AdConnectionReadiness {
  mcpReady: boolean;
  pendingCustomerSelection: boolean;
  dataFreshnessMinutes: number | null;
  stale: boolean;
}

export interface AdConnectionItem {
  provider: 'META' | 'GOOGLE' | 'GMAIL';
  status: AdConnectionStatus | string;
  accountName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  connected: boolean;
  readiness?: AdConnectionReadiness | null;
}

export interface AdManagerDashboard {
  dateFrom: string;
  dateTo: string;
  totalSpend: number;
  totalRevenue: number;
  conversionValue: number;
  roas: number | null;
  cpa: number | null;
  cpl: number | null;
  totalConversions: number;
  activeCampaigns: number;
  poorCampaigns: number;
  profit: number;
  source?: string;
}

export interface AdConversionAction {
  type: string;
  count: number;
  value?: number;
}

export interface AdManagerCampaignRow {
  id: string;
  insightId: string;
  organizationId: string;
  platform: string;
  name: string;
  campaignName: string;
  status: string;
  budget: number | null;
  externalCampaignId: string;
  dateFrom: string;
  dateTo: string;
  date: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
  currency: string;
  timezone: string;
  conversionActions: AdConversionAction[];
  efficiencyScore: number | null;
  aiSuggestion: string | null;
  /** legacy alias */
  leads?: number;
  externalId?: string;
}

export interface AdManagerCampaignsPage {
  total: number;
  page: number;
  pageSize: number;
  items: AdManagerCampaignRow[];
}

export type AdsPlatformFilter = 'ALL' | 'META' | 'GOOGLE';
export type AdsStatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED' | 'OTHER';

export interface AdsCampaignFilters {
  dateFrom: string;
  dateTo: string;
  platform?: AdsPlatformFilter;
  /** accountKey = provider META|GOOGLE (map từ connection) */
  account?: string;
  status?: AdsStatusFilter;
  page?: number;
  pageSize?: number;
}

export interface AdManagerSettings {
  autoModeEnabled: boolean;
  mcpMode?: 'OBSERVE' | 'SUGGEST' | 'AUTO';
  dailyBudgetLimit: number | null;
  maxTogglesPerDay: number;
  togglesToday: number;
  maxBudgetChangePercent?: number;
  ruleLookbackDays?: number;
  ruleCooldownMinutes?: number;
  minSpendForAction?: number | null;
  emergencyStop: boolean;
}

export interface AutomationRule {
  id: string;
  name: string;
  ruleType: string;
  platform: string | null;
  enabled: boolean;
  threshold: number | null;
  spendThreshold: number | null;
}

export interface AutomationLog {
  id: string;
  platform: string;
  campaignName: string | null;
  action: string;
  autoMode: boolean;
  reason: string;
  createdAt: string;
  rule?: { name: string; ruleType: string } | null;
}

export interface AdDraft {
  id: string;
  platform: string;
  status: string;
  objective: string | null;
  budget: number | null;
  audience: string | null;
  content: string | null;
  headline: string | null;
  cta: string | null;
  landingPage: string | null;
  aiGenerated: boolean;
  createdAt: string;
}

export interface EmailReportConfig {
  id: string;
  enabled: boolean;
  schedule: string;
  recipientEmail: string;
  reportOnLoss: boolean;
  reportOnLowRoas: boolean;
  reportOnAutoPause: boolean;
  lastSentAt: string | null;
}

export const RULE_TYPE_OPTIONS = [
  { value: 'PAUSE_SPEND_NO_CONVERSION', label: 'Tạm dừng nếu chi tiêu cao không có conversion' },
  { value: 'PAUSE_CPA_THRESHOLD', label: 'Tạm dừng nếu CPA/CPL vượt ngưỡng' },
  { value: 'PAUSE_ROAS_THRESHOLD', label: 'Tạm dừng nếu ROAS dưới ngưỡng' },
  { value: 'ALERT_CTR_LOW', label: 'Cảnh báo CTR thấp' },
  { value: 'ALERT_CPM_HIGH', label: 'Cảnh báo CPM cao' },
  { value: 'ALERT_CPA_INCREASE', label: 'Cảnh báo CPA tăng' },
  { value: 'ALERT_ROAS_DROP', label: 'Cảnh báo ROAS giảm' },
] as const;

export const CONNECTION_STATUS_LABEL: Record<AdConnectionStatus, string> = {
  DISCONNECTED: 'Chưa kết nối',
  CONNECTED: 'Đã kết nối',
  PENDING_ACCOUNT: 'Chọn tài khoản',
  TOKEN_EXPIRED: 'Token hết hạn',
  INSUFFICIENT_PERMISSIONS: 'Không đủ quyền',
  ERROR: 'Lỗi',
};
