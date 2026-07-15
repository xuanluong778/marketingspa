export type AdConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'ERROR';

export interface AdConnectionItem {
  provider: 'META' | 'GOOGLE' | 'GMAIL';
  status: AdConnectionStatus;
  accountName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  connected: boolean;
}

export interface AdManagerDashboard {
  dateFrom: string;
  dateTo: string;
  totalSpend: number;
  totalRevenue: number;
  roas: number | null;
  cpa: number;
  cpl: number;
  totalConversions: number;
  activeCampaigns: number;
  poorCampaigns: number;
  profit: number;
}

export interface AdManagerCampaignRow {
  id: string;
  insightId: string;
  platform: string;
  name: string;
  status: string;
  budget: number | null;
  externalId: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  leads: number;
  cpa: number;
  cpl: number;
  roas: number | null;
  efficiencyScore: number | null;
  aiSuggestion: string | null;
}

export interface AdManagerSettings {
  autoModeEnabled: boolean;
  dailyBudgetLimit: number | null;
  maxTogglesPerDay: number;
  togglesToday: number;
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
  TOKEN_EXPIRED: 'Token hết hạn',
  INSUFFICIENT_PERMISSIONS: 'Không đủ quyền',
  ERROR: 'Lỗi',
};
