import type { FunnelValidatorResult, FunnelValidationCheck } from '@/types/funnel-validator';

const CHECK_FIX: Record<string, string> = {
  graph_invalid: 'Các bước chưa nối đúng. Vào Thiết kế phễu, kéo nối từ bước này sang bước kia.',
  graph_valid: 'Các bước đã nối đúng.',
  no_orphan_nodes: 'Có bước chưa được nối. Nối hết các bước trên thiết kế phễu.',
  traffic_source: 'Thiếu nguồn khách. Thêm bước “Nguồn khách”.',
  lead_capture: 'Thiếu form lấy số điện thoại. Thêm bước Form và bắt buộc SĐT.',
  cta: 'Thiếu nút kêu gọi khách. Thêm bước “Nút kêu gọi” trong Nâng cao.',
  offer: 'Thiếu ưu đãi. Thêm bước “Ưu đãi” trong Nâng cao.',
  follow_up: 'Thiếu tin nhắn chăm sóc sau khi khách để lại SĐT.',
  conversion_goal: 'Thiếu bước chốt đơn. Thêm bước “Mua hàng”.',
  tracking: 'Thiếu cách xem kết quả. Thêm bước “Mua hàng”.',
  path_traffic_goal: 'Chưa nối từ Nguồn khách tới Mua hàng.',
};

export function blockingChecks(result: FunnelValidatorResult | null | undefined): FunnelValidationCheck[] {
  if (!result) return [];
  const fromChecks = (result.checks ?? []).filter((c) => !c.passed && c.severity === 'blocking');
  if (fromChecks.length) return fromChecks;
  return (result.blocking ?? []).map((message, i) => ({
    id: `blocking-${i}`,
    label: 'Cần sửa',
    passed: false,
    severity: 'blocking' as const,
    message,
  }));
}

export function friendlyCheckFix(check: FunnelValidationCheck): string {
  return CHECK_FIX[check.id] ?? check.hint ?? check.message;
}

export function activateBlockedReason(result: FunnelValidatorResult | null | undefined): string | null {
  if (!result) return null;
  if (result.canActivate) return null;
  const blocking = blockingChecks(result);
  if (blocking.length) return null;
  return 'Phễu chưa đủ điều kiện để chạy. Bổ sung form, chăm sóc hoặc bước Mua hàng rồi thử lại.';
}

export function publicStatusLabel(status: string | undefined): string {
  if (status === 'ACTIVE') return 'Đang chạy';
  if (status === 'PAUSED') return 'Tạm dừng';
  if (status === 'ARCHIVED') return 'Lưu trữ';
  return 'Nháp';
}
