export type EmailRecipeId =
  | 'new-lead'
  | 'email-opened-score'
  | 'email-clicked-stage'
  | 'not-opened-resend'
  | 'funnel-welcome'
  | 'booking-confirm'
  | 'purchased-thanks';

export type EmailRecipe = {
  id: EmailRecipeId;
  name: string;
  description: string;
  when: string;
  then: string;
  trigger:
    | 'NEW_LEAD'
    | 'EMAIL_OPENED'
    | 'EMAIL_CLICKED'
    | 'EMAIL_NOT_OPENED'
    | 'FUNNEL_SIGNUP'
    | 'BOOKING_CREATED'
    | 'PURCHASED';
  action: 'SEND_EMAIL' | 'ADD_LEAD_SCORE' | 'SET_CRM_STAGE';
  needsTemplate: boolean;
  needsList: boolean;
  needsWaitDays: boolean;
  needsScore: boolean;
  needsStage: boolean;
  defaultTemplateCategory: 'welcome' | 'nurturing' | 'voucher' | 'birthday' | 'reengagement' | null;
  defaultWaitDays: number;
  defaultScoreDelta: number;
  defaultStage: string;
};

export const EMAIL_AUTOMATION_RECIPES: EmailRecipe[] = [
  {
    id: 'new-lead',
    name: 'Lead mới → gửi Email',
    description: 'Khi CRM có lead mới có email, gửi thư giới thiệu.',
    when: 'Lead mới',
    then: 'Gửi email',
    trigger: 'NEW_LEAD',
    action: 'SEND_EMAIL',
    needsTemplate: true,
    needsList: true,
    needsWaitDays: false,
    needsScore: false,
    needsStage: false,
    defaultTemplateCategory: 'welcome',
    defaultWaitDays: 2,
    defaultScoreDelta: 10,
    defaultStage: 'CONTACTED',
  },
  {
    id: 'email-opened-score',
    name: 'Mở Email → cộng Lead Score',
    description: 'Khách mở email thì cộng điểm trên CRM.',
    when: 'Mở email',
    then: 'Cộng điểm lead',
    trigger: 'EMAIL_OPENED',
    action: 'ADD_LEAD_SCORE',
    needsTemplate: false,
    needsList: true,
    needsWaitDays: false,
    needsScore: true,
    needsStage: false,
    defaultTemplateCategory: null,
    defaultWaitDays: 2,
    defaultScoreDelta: 10,
    defaultStage: 'CONTACTED',
  },
  {
    id: 'email-clicked-stage',
    name: 'Click Email → đổi CRM Stage',
    description: 'Khách bấm nút trong email thì chuyển giai đoạn CRM.',
    when: 'Click email',
    then: 'Đổi giai đoạn',
    trigger: 'EMAIL_CLICKED',
    action: 'SET_CRM_STAGE',
    needsTemplate: false,
    needsList: true,
    needsWaitDays: false,
    needsScore: false,
    needsStage: true,
    defaultTemplateCategory: null,
    defaultWaitDays: 2,
    defaultScoreDelta: 10,
    defaultStage: 'CONTACTED',
  },
  {
    id: 'not-opened-resend',
    name: 'Không mở → gửi lại',
    description: 'Nếu chưa mở email, chờ vài ngày rồi gửi thư nhắc.',
    when: 'Không mở email',
    then: 'Gửi lại',
    trigger: 'EMAIL_NOT_OPENED',
    action: 'SEND_EMAIL',
    needsTemplate: true,
    needsList: true,
    needsWaitDays: true,
    needsScore: false,
    needsStage: false,
    defaultTemplateCategory: 'reengagement',
    defaultWaitDays: 2,
    defaultScoreDelta: 10,
    defaultStage: 'CONTACTED',
  },
  {
    id: 'funnel-welcome',
    name: 'Đăng ký Funnel → chào mừng',
    description: 'Khách để lại form trên Funnel thì nhận email chào mừng.',
    when: 'Đăng ký Funnel',
    then: 'Gửi chào mừng',
    trigger: 'FUNNEL_SIGNUP',
    action: 'SEND_EMAIL',
    needsTemplate: true,
    needsList: true,
    needsWaitDays: false,
    needsScore: false,
    needsStage: false,
    defaultTemplateCategory: 'welcome',
    defaultWaitDays: 2,
    defaultScoreDelta: 10,
    defaultStage: 'CONTACTED',
  },
  {
    id: 'booking-confirm',
    name: 'Booking → xác nhận',
    description: 'Khi có lịch hẹn mới, gửi email xác nhận.',
    when: 'Đặt lịch',
    then: 'Gửi xác nhận',
    trigger: 'BOOKING_CREATED',
    action: 'SEND_EMAIL',
    needsTemplate: true,
    needsList: true,
    needsWaitDays: false,
    needsScore: false,
    needsStage: false,
    defaultTemplateCategory: 'nurturing',
    defaultWaitDays: 2,
    defaultScoreDelta: 10,
    defaultStage: 'BOOKED',
  },
  {
    id: 'purchased-thanks',
    name: 'Purchased → cảm ơn',
    description: 'Khách đã mua thì nhận thư cảm ơn.',
    when: 'Đã mua',
    then: 'Gửi cảm ơn',
    trigger: 'PURCHASED',
    action: 'SEND_EMAIL',
    needsTemplate: true,
    needsList: true,
    needsWaitDays: false,
    needsScore: false,
    needsStage: false,
    defaultTemplateCategory: 'voucher',
    defaultWaitDays: 2,
    defaultScoreDelta: 10,
    defaultStage: 'PURCHASED',
  },
];

export function findEmailRecipe(id: string) {
  return EMAIL_AUTOMATION_RECIPES.find((r) => r.id === id) ?? null;
}
