/** Human-readable labels for Marketing Autopilot UI (no raw engine/status codes). */

export type AutopilotAnalysisView = 'overview' | 'todos' | 'budget';

export const ANALYSIS_VIEW_VALUES = new Set<string>([
  'overview',
  'todos',
  'budget',
]);

const MISSION_STATUS_VI: Record<string, string> = {
  PENDING: 'Đang chờ',
  QUEUED: 'Trong hàng đợi',
  RUNNING: 'Đang chạy',
  READY_FOR_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  COMPLETED: 'Hoàn thành',
  FAILED: 'Gặp lỗi',
  CANCELLED: 'Đã hủy',
};

const PROJECT_STATUS_VI: Record<string, string> = {
  DRAFT: 'Bản nháp',
  ANALYZING: 'Đang phân tích',
  READY: 'Sẵn sàng',
  READY_FOR_APPROVAL: 'Chờ duyệt',
  RUNNING: 'Đang chạy',
  APPROVED: 'Đã duyệt',
  COMPLETED: 'Hoàn thành',
  FAILED: 'Gặp lỗi',
  ARCHIVED: 'Đã lưu trữ',
};

const DRAFT_TYPE_VI: Record<string, string> = {
  CONTENT_DRAFT: 'Nội dung',
  FUNNEL_DRAFT: 'Funnel',
  AUTOMATION_DRAFT: 'Tự động hóa',
  CAMPAIGN_DRAFT: 'Chiến dịch',
  EMAIL_DRAFT: 'Email',
  ADS_DRAFT: 'Quảng cáo',
};

const DRAFT_STATUS_VI: Record<string, string> = {
  DRAFT: 'Bản nháp',
  READY: 'Sẵn sàng',
  CONFIRMED: 'Đã xác nhận',
  PUBLISHED: 'Đã xuất bản',
  FAILED: 'Gặp lỗi',
};

export function missionStatusLabel(status?: string | null): string {
  if (!status) return 'Chưa có';
  return MISSION_STATUS_VI[status] ?? 'Đang xử lý';
}

export function projectStatusLabel(status?: string | null): string {
  if (!status) return 'Chưa có';
  return PROJECT_STATUS_VI[status] ?? missionStatusLabel(status);
}

export function draftTypeLabel(type?: string | null): string {
  if (!type) return 'Khác';
  return DRAFT_TYPE_VI[type] ?? 'Tài sản khác';
}

export function draftStatusLabel(status?: string | null): string {
  if (!status) return 'Bản nháp';
  return DRAFT_STATUS_VI[status] ?? 'Bản nháp';
}

/** Prefer mission status when present; otherwise project status. */
export function resolveDisplayStatus(opts: {
  missionStatus?: string | null;
  projectStatus?: string | null;
}): string {
  if (opts.missionStatus) return missionStatusLabel(opts.missionStatus);
  return projectStatusLabel(opts.projectStatus);
}

export function formatVnd(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(n))}đ`;
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
}

export function shortText(text: string | null | undefined, max = 140): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}
