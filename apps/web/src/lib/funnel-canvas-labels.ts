import type { FunnelNodeType } from '@marketingspa/shared';

export const FUNNEL_SIMPLE_STEPS: Array<{
  type: FunnelNodeType;
  label: string;
  hint: string;
}> = [
  { type: 'TRAFFIC', label: 'Nguồn khách', hint: 'Ads, fanpage, Zalo…' },
  { type: 'FORM', label: 'Form', hint: 'Khách để lại SĐT' },
  { type: 'AUTOMATION', label: 'Chăm sóc', hint: 'Nhắc / follow-up' },
  { type: 'BOOKING', label: 'Đặt lịch', hint: 'Book lịch hẹn' },
  { type: 'GOAL', label: 'Mua hàng', hint: 'Chốt đơn' },
  { type: 'RETARGET', label: 'Remarketing', hint: 'Nhắc khách chưa chốt' },
];

export const FUNNEL_ADVANCED_NODE_TYPES: FunnelNodeType[] = [
  'LANDING',
  'STAGE',
  'OFFER',
  'CONTENT',
  'QUIZ',
  'GAME',
  'CTA',
  'REFERRAL',
];

const NODE_STEP_LABEL: Record<FunnelNodeType, string> = {
  TRAFFIC: 'Nguồn khách',
  LANDING: 'Trang đích',
  FORM: 'Form',
  STAGE: 'Trạng thái CRM',
  BOOKING: 'Đặt lịch',
  OFFER: 'Ưu đãi',
  CONTENT: 'Nội dung',
  QUIZ: 'Quiz',
  GAME: 'Mini game',
  CTA: 'Nút kêu gọi',
  AUTOMATION: 'Chăm sóc',
  GOAL: 'Mua hàng',
  RETARGET: 'Remarketing',
  REFERRAL: 'Giới thiệu bạn',
};

export function canvasStepLabel(type: FunnelNodeType): string {
  return NODE_STEP_LABEL[type] ?? type;
}

export const CANVAS_EVENT_LABEL: Record<string, string> = {
  FORM_SUBMITTED: 'Khách gửi form',
  LEAD_CREATED: 'Lead được tạo',
  CTA_CLICK: 'Khách bấm nút',
  STAGE_CHANGED: 'Đổi trạng thái CRM',
  MQL: 'Đạt MQL',
  SQL: 'Đạt SQL',
  BOOKING_CREATED: 'Vừa đặt lịch',
  BOOKING_CONFIRMED: 'Đã xác nhận lịch',
  BOOKING_COMPLETED: 'Đã hoàn tất lịch',
  BOOKING_CANCELLED: 'Hủy lịch',
  VISIT: 'Khách đến spa',
  PURCHASE: 'Đã mua hàng',
  PURCHASED: 'Đã mua hàng',
  TIMEOUT: 'Hết thời gian chờ',
  SUCCESS: 'Bước thành công',
  FAILURE: 'Bước thất bại',
  LEAD_UNTOUCHED: 'Chưa chăm sóc lead',
  SCORE_CHANGED: 'Điểm thay đổi',
  MESSAGE_RECEIVED: 'Khách nhắn tin',
  NO_REPLY: 'Không phản hồi',
};

export const CANVAS_CONVERSION_LABEL: Record<string, string> = {
  LEAD: 'Có lead mới',
  MQL: 'Lead đủ điều kiện (MQL)',
  SQL: 'Lead sẵn sàng chốt (SQL)',
  BOOKING: 'Đã đặt lịch',
  VISIT: 'Đã đến spa',
  PURCHASE: 'Đã mua hàng',
};

export const CANVAS_BOOKING_LABEL: Record<string, string> = {
  BOOKING_CREATED: 'Khách vừa đặt lịch',
  BOOKING_CONFIRMED: 'Khách xác nhận lịch',
  BOOKING_COMPLETED: 'Khách hoàn tất lịch',
  BOOKING_CANCELLED: 'Khách hủy lịch',
  VISIT: 'Khách đến spa',
};

export const CANVAS_CONDITION_FIELD_LABEL: Record<string, string> = {
  score: 'Điểm lead',
  qualification: 'MQL / SQL',
  stage: 'Trạng thái CRM',
  event: 'Sự kiện',
  conversion: 'Mốc chuyển đổi',
  revenue: 'Doanh thu',
};

export const CANVAS_CONDITION_OP_LABEL: Record<string, string> = {
  eq: 'bằng',
  neq: 'khác',
  gte: 'từ … trở lên',
  lte: 'từ … trở xuống',
  gt: 'lớn hơn',
  lt: 'nhỏ hơn',
  in: 'nằm trong',
  contains: 'chứa',
};

export function canvasEventLabel(code: string | undefined): string {
  if (!code) return 'Khi bước trước xong';
  return CANVAS_EVENT_LABEL[code] ?? code;
}

export function defaultEdgeEvent(sourceType: FunnelNodeType): string | undefined {
  switch (sourceType) {
    case 'FORM':
      return 'FORM_SUBMITTED';
    case 'BOOKING':
      return 'BOOKING_CREATED';
    case 'GOAL':
      return 'PURCHASE';
    case 'AUTOMATION':
      return 'SUCCESS';
    case 'RETARGET':
      return 'LEAD_UNTOUCHED';
    case 'CTA':
      return 'CTA_CLICK';
    case 'STAGE':
      return 'STAGE_CHANGED';
    default:
      return undefined;
  }
}

export function defaultGoalConversion(type: FunnelNodeType): string | undefined {
  return type === 'GOAL' ? 'PURCHASE' : undefined;
}
