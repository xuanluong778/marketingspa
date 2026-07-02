export type MessageChannel = 'EMAIL' | 'SMS' | 'ZALO' | 'MESSENGER' | 'PUSH';

export type AutomationTriggerType =
  | 'LEAD_CREATED'
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_24H_BEFORE'
  | 'APPOINTMENT_2H_BEFORE'
  | 'APPOINTMENT_REMINDER'
  | 'NO_SHOW'
  | 'BIRTHDAY'
  | 'CUSTOMER_INACTIVE'
  | 'ORDER_COMPLETED'
  | 'MANUAL';

export type AutomationLogStatus = 'PENDING' | 'RUNNING' | 'SENT' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export const CHANNEL_OPTIONS: { value: MessageChannel; label: string }[] = [
  { value: 'ZALO', label: 'Zalo' },
  { value: 'MESSENGER', label: 'Messenger' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
];

export const TRIGGER_OPTIONS: { value: AutomationTriggerType; label: string }[] = [
  { value: 'LEAD_CREATED', label: 'Lead mới tạo' },
  { value: 'APPOINTMENT_CREATED', label: 'Lịch hẹn mới' },
  { value: 'APPOINTMENT_24H_BEFORE', label: 'Trước lịch 24h' },
  { value: 'APPOINTMENT_2H_BEFORE', label: 'Trước lịch 2h' },
  { value: 'NO_SHOW', label: 'Khách không đến' },
  { value: 'BIRTHDAY', label: 'Sinh nhật khách' },
  { value: 'CUSTOMER_INACTIVE', label: 'Khách không hoạt động' },
  { value: 'MANUAL', label: 'Thủ công' },
];

export const LOG_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ gửi',
  RUNNING: 'Đang gửi',
  SENT: 'Đã gửi',
  SUCCESS: 'Đã gửi',
  FAILED: 'Thất bại',
  SKIPPED: 'Bỏ qua',
};

export const TEMPLATE_VARIABLES = [
  { key: 'customer_name', placeholder: '{{customer_name}}', label: 'Tên khách hàng' },
  { key: 'appointment_time', placeholder: '{{appointment_time}}', label: 'Thời gian hẹn' },
  { key: 'branch_name', placeholder: '{{branch_name}}', label: 'Chi nhánh' },
  { key: 'service_name', placeholder: '{{service_name}}', label: 'Dịch vụ' },
] as const;

export interface MessageTemplateDetail {
  id: string;
  name: string;
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  variables: string[];
  isActive: boolean;
}

export interface AutomationFlowDetail {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  channel?: MessageChannel | null;
  delayMinutes: number;
  isActive: boolean;
  messageTemplate?: MessageTemplateDetail | null;
}

export interface AutomationLogDetail {
  id: string;
  channel?: MessageChannel | null;
  renderedContent?: string | null;
  status: AutomationLogStatus;
  executedAt?: string | null;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  lead?: { id: string; name: string } | null;
  automationFlow?: { id: string; name: string } | null;
}

export type IntegrationProvider = 'META_ADS' | 'GOOGLE_ADS' | 'ZALO_OA' | 'SMS' | 'EMAIL';

export type IntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export interface IntegrationItem {
  provider: IntegrationProvider;
  label: string;
  status: IntegrationStatus;
  hasCredentials: boolean;
  maskedHint?: string | null;
  lastTestedAt?: string | null;
  updatedAt?: string | null;
}

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  DISCONNECTED: 'Chưa kết nối',
  CONNECTED: 'Đã kết nối',
  ERROR: 'Lỗi kết nối',
};
