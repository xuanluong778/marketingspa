import { z } from 'zod';
import {
  funnelBlueprintDraftSchema,
  funnelFlowProposalSchema,
  funnelStageProposalSchema,
  type FunnelBlueprintDraft,
  type FunnelFlowProposal,
  type FunnelStageProposal,
} from './funnel-blueprint';

export const FUNNEL_TEMPLATE_SLUGS = [
  'voucher',
  'giveaway',
  'quiz',
  'consultation',
  'booking',
  'content',
  'flash-sale',
  'retargeting',
  'referral',
  'reactivation',
] as const;

export type FunnelTemplateSlug = (typeof FUNNEL_TEMPLATE_SLUGS)[number];

export const FUNNEL_NODE_TYPES = [
  'TRAFFIC',
  'LANDING',
  'FORM',
  'STAGE',
  'BOOKING',
  'OFFER',
  'CONTENT',
  'QUIZ',
  'GAME',
  'CTA',
  'AUTOMATION',
  'GOAL',
  'RETARGET',
  'REFERRAL',
] as const;

export type FunnelNodeType = (typeof FUNNEL_NODE_TYPES)[number];

export const funnelTemplateInputSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  type: z.enum(['text', 'number', 'url', 'boolean', 'select', 'textarea']),
  required: z.boolean().default(true),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string()).optional(),
  helpText: z.string().max(400).optional(),
});

export const funnelTemplateGoalSchema = z.object({
  code: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  description: z.string().max(800).optional(),
  primaryMetric: z.string().max(80).optional(),
});

export const funnelTemplateNodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(FUNNEL_NODE_TYPES),
  label: z.string().min(1).max(160),
  description: z.string().max(400).optional(),
  /** When type=STAGE — maps to FunnelStage proposal */
  stage: funnelStageProposalSchema.optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  meta: z.record(z.unknown()).optional(),
});

export const funnelTemplateConnectionSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  label: z.string().max(120).optional(),
});

export const funnelTemplateDefinitionSchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(160),
  description: z.string().max(800).optional(),
  category: z.string().max(64).optional(),
  tags: z.array(z.string()).max(20).default([]),
  goal: funnelTemplateGoalSchema,
  requiredInputs: z.array(funnelTemplateInputSchema).max(30).default([]),
  nodes: z.array(funnelTemplateNodeSchema).min(1).max(40),
  connections: z.array(funnelTemplateConnectionSchema).max(60).default([]),
  recommendedAutomation: z.array(funnelFlowProposalSchema).max(20).default([]),
});

export type FunnelTemplateInput = z.infer<typeof funnelTemplateInputSchema>;
export type FunnelTemplateGoal = z.infer<typeof funnelTemplateGoalSchema>;
export type FunnelTemplateNode = z.infer<typeof funnelTemplateNodeSchema>;
export type FunnelTemplateConnection = z.infer<typeof funnelTemplateConnectionSchema>;
export type FunnelTemplateDefinition = z.infer<typeof funnelTemplateDefinitionSchema>;

export function parseFunnelTemplateDefinition(raw: unknown): FunnelTemplateDefinition {
  return funnelTemplateDefinitionSchema.parse(raw);
}

/** Map STAGE nodes → blueprint stages; recommendedAutomation → flows */
export function templateDefinitionToBlueprintDraft(
  def: FunnelTemplateDefinition,
  overrides?: {
    name?: string;
    summary?: string;
    industryHint?: string;
    includeAutomations?: boolean;
  },
): FunnelBlueprintDraft {
  const stageNodes = def.nodes.filter((n) => n.type === 'STAGE' && n.stage);
  const stages: FunnelStageProposal[] = stageNodes.map((n, i) => ({
    ...n.stage!,
    position: n.stage!.position ?? i,
    name: n.stage!.name || n.label,
  }));

  const flows: FunnelFlowProposal[] =
    overrides?.includeAutomations === false ? [] : def.recommendedAutomation;

  return funnelBlueprintDraftSchema.parse({
    name: overrides?.name ?? def.name,
    summary: overrides?.summary ?? def.description ?? def.goal.label,
    industryHint: overrides?.industryHint,
    stages:
      stages.length > 0
        ? stages
        : [
            {
              name: 'Lead mới',
              code: 'NEW',
              category: 'OPEN',
              position: 0,
              probability: 10,
            },
            {
              name: 'Đã mua / hoàn thành',
              code: 'PURCHASED',
              category: 'WON',
              position: 1,
              probability: 100,
              isWon: true,
            },
          ],
    flows,
  });
}

function stageNode(
  id: string,
  label: string,
  stage: FunnelStageProposal,
  x: number,
  y: number,
): FunnelTemplateNode {
  return {
    id,
    type: 'STAGE',
    label,
    stage,
    position: { x, y },
  };
}

function conn(id: string, from: string, to: string, label?: string): FunnelTemplateConnection {
  return { id, from, to, label };
}

function node(
  id: string,
  type: FunnelNodeType,
  label: string,
  x: number,
  y: number,
  description?: string,
): FunnelTemplateNode {
  return { id, type, label, description, position: { x, y } };
}

/** 10 system templates for AI Funnel Builder */
export const DEFAULT_FUNNEL_TEMPLATES: FunnelTemplateDefinition[] = [
  parseFunnelTemplateDefinition({
    slug: 'voucher',
    name: 'Voucher Funnel',
    description: 'Thu lead bằng voucher/ưu đãi → qualify → đặt lịch / mua.',
    category: 'acquisition',
    tags: ['voucher', 'offer', 'leadgen'],
    goal: {
      code: 'REDEEM_VOUCHER',
      label: 'Đổi voucher & chuyển thành khách',
      primaryMetric: 'redemption_rate',
    },
    requiredInputs: [
      { key: 'voucherCode', label: 'Mã voucher', type: 'text', required: true },
      { key: 'discountValue', label: 'Giá trị ưu đãi', type: 'text', required: true },
      { key: 'landingUrl', label: 'URL landing', type: 'url', required: false },
      { key: 'expiryDays', label: 'Hạn dùng (ngày)', type: 'number', required: false },
    ],
    nodes: [
      node('n_traffic', 'TRAFFIC', 'Ads / Social', 0, 0),
      node('n_landing', 'LANDING', 'Landing voucher', 180, 0, 'Form nhận ưu đãi'),
      node('n_form', 'FORM', 'Form nhận voucher', 270, 0),
      node('n_offer', 'OFFER', 'Voucher', 360, 0),
      stageNode(
        'n_new',
        'Lead mới',
        {
          name: 'Lead voucher',
          code: 'NEW',
          category: 'OPEN',
          position: 0,
          color: '#3b82f6',
          probability: 15,
          slaMinutes: 30,
        },
        540,
        0,
      ),
      stageNode(
        'n_contacted',
        'Đã liên hệ',
        {
          name: 'Đã tư vấn voucher',
          code: 'CONTACTED',
          category: 'IN_PROGRESS',
          position: 1,
          color: '#06b6d4',
          probability: 35,
          slaMinutes: 60,
        },
        720,
        0,
      ),
      stageNode(
        'n_booked',
        'Đặt lịch',
        {
          name: 'Đổi voucher / đặt lịch',
          code: 'BOOKED',
          category: 'BOOKING',
          position: 2,
          color: '#f59e0b',
          probability: 55,
        },
        900,
        0,
      ),
      stageNode(
        'n_won',
        'Đã mua',
        {
          name: 'Đã sử dụng / mua',
          code: 'PURCHASED',
          category: 'WON',
          position: 3,
          color: '#22c55e',
          probability: 100,
          isWon: true,
        },
        1080,
        0,
      ),
      node('n_goal', 'GOAL', 'Goal: đổi voucher', 1260, 0),
    ],
    connections: [
      conn('c1', 'n_traffic', 'n_landing'),
      conn('c2', 'n_landing', 'n_form'),
      conn('c2b', 'n_form', 'n_offer'),
      conn('c3', 'n_offer', 'n_new'),
      conn('c4', 'n_new', 'n_contacted'),
      conn('c5', 'n_contacted', 'n_booked'),
      conn('c6', 'n_booked', 'n_won'),
      conn('c7', 'n_won', 'n_goal'),
    ],
    recommendedAutomation: [
      {
        name: 'Gửi voucher ngay khi lead tạo',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 2,
        actions: [
          { type: 'CREATE_TASK', title: 'Gửi mã voucher + hướng dẫn đổi', dueInMinutes: 15 },
        ],
        rationale: 'Tăng tỷ lệ mở & redeem',
      },
      {
        name: 'Nhắc lead chưa dùng voucher',
        triggerType: 'LEAD_UNTOUCHED',
        delayMinutes: 1440,
        actions: [
          { type: 'CREATE_TASK', title: 'Nhắc hạn voucher / follow-up', dueInMinutes: 60 },
        ],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'giveaway',
    name: 'Giveaway / Mini Game Funnel',
    description: 'Mini game / giveaway viral → thu lead → nurture → chuyển đổi.',
    category: 'acquisition',
    tags: ['giveaway', 'game', 'viral'],
    goal: {
      code: 'GAME_CONVERT',
      label: 'Thu lead từ mini game & nurture',
      primaryMetric: 'entries_to_purchase',
    },
    requiredInputs: [
      { key: 'prizeName', label: 'Giải thưởng', type: 'text', required: true },
      { key: 'gameType', label: 'Loại game', type: 'select', required: true, options: ['spin', 'scratch', 'quiz', 'checkin'] },
      { key: 'endAt', label: 'Ngày kết thúc', type: 'text', required: false },
    ],
    nodes: [
      node('g_traffic', 'TRAFFIC', 'Viral / Ads', 0, 0),
      node('g_game', 'GAME', 'Mini game', 180, 0),
      node('g_form', 'FORM', 'Form đăng ký', 360, 0),
      stageNode(
        'g_new',
        'Lead mới',
        { name: 'Lead giveaway', code: 'NEW', category: 'OPEN', position: 0, probability: 10, color: '#3b82f6' },
        540,
        0,
      ),
      stageNode(
        'g_qual',
        'Qualify',
        { name: 'Đủ điều kiện', code: 'QUALIFIED', category: 'QUALIFIED', position: 1, probability: 40, color: '#8b5cf6' },
        720,
        0,
      ),
      stageNode(
        'g_won',
        'Chuyển đổi',
        { name: 'Đã mua', code: 'PURCHASED', category: 'WON', position: 2, probability: 100, isWon: true, color: '#22c55e' },
        900,
        0,
      ),
      node('g_goal', 'GOAL', 'Goal: convert entry', 1080, 0),
    ],
    connections: [
      conn('gc1', 'g_traffic', 'g_game'),
      conn('gc2', 'g_game', 'g_form'),
      conn('gc3', 'g_form', 'g_new'),
      conn('gc4', 'g_new', 'g_qual'),
      conn('gc5', 'g_qual', 'g_won'),
      conn('gc6', 'g_won', 'g_goal'),
    ],
    recommendedAutomation: [
      {
        name: 'Xác nhận tham gia game',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 1,
        actions: [{ type: 'CREATE_TASK', title: 'Gửi xác nhận + luật chơi', dueInMinutes: 10 }],
      },
      {
        name: 'Nurture sau giveaway',
        triggerType: 'LEAD_UNTOUCHED',
        delayMinutes: 2880,
        actions: [
          { type: 'ADD_TAG', tag: 'giveaway-nurture' },
          { type: 'CREATE_TASK', title: 'Offer ưu đãi cho người chơi', dueInMinutes: 120 },
        ],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'quiz',
    name: 'Quiz Funnel',
    description: 'Quiz phân loại nhu cầu → score lead → tư vấn / book.',
    category: 'acquisition',
    tags: ['quiz', 'segment'],
    goal: {
      code: 'QUIZ_BOOK',
      label: 'Hoàn quiz & đặt lịch tư vấn',
      primaryMetric: 'quiz_completion_to_book',
    },
    requiredInputs: [
      { key: 'quizTopic', label: 'Chủ đề quiz', type: 'text', required: true },
      { key: 'resultCount', label: 'Số nhóm kết quả', type: 'number', required: false },
    ],
    nodes: [
      node('q_traffic', 'TRAFFIC', 'Traffic', 0, 0),
      node('q_quiz', 'QUIZ', 'Quiz', 180, 0),
      node('q_result', 'CONTENT', 'Kết quả cá nhân hóa', 360, 0),
      node('q_form', 'FORM', 'Form nhận kết quả', 450, 0),
      stageNode(
        'q_new',
        'Lead mới',
        { name: 'Lead quiz', code: 'NEW', category: 'OPEN', position: 0, probability: 20, color: '#3b82f6' },
        540,
        0,
      ),
      stageNode(
        'q_qual',
        'Qualified',
        { name: 'Đã phân loại', code: 'QUALIFIED', category: 'QUALIFIED', position: 1, probability: 50, color: '#8b5cf6' },
        720,
        0,
      ),
      stageNode(
        'q_book',
        'Book',
        { name: 'Đặt lịch tư vấn', code: 'BOOKED', category: 'BOOKING', position: 2, probability: 65, color: '#f59e0b' },
        900,
        0,
      ),
      node('q_goal', 'GOAL', 'Goal: book từ quiz', 1080, 0),
    ],
    connections: [
      conn('qc1', 'q_traffic', 'q_quiz'),
      conn('qc2', 'q_quiz', 'q_result'),
      conn('qc3', 'q_result', 'q_form'),
      conn('qc3b', 'q_form', 'q_new'),
      conn('qc4', 'q_new', 'q_qual'),
      conn('qc5', 'q_qual', 'q_book'),
      conn('qc6', 'q_book', 'q_goal'),
    ],
    recommendedAutomation: [
      {
        name: 'Gửi kết quả quiz',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Gửi kết quả + CTA đặt lịch', dueInMinutes: 15 }],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'consultation',
    name: 'Consultation Funnel',
    description: 'Phễu tư vấn: form → qualify → tư vấn → đề xuất liệu trình.',
    category: 'sales',
    tags: ['consult', 'spa'],
    goal: {
      code: 'CONSULT_CLOSE',
      label: 'Hoàn tư vấn & chốt liệu trình',
      primaryMetric: 'consult_to_purchase',
    },
    requiredInputs: [
      { key: 'serviceFocus', label: 'Dịch vụ tư vấn', type: 'text', required: true },
      { key: 'consultChannel', label: 'Kênh tư vấn', type: 'select', required: false, options: ['phone', 'zalo', 'onsite', 'video'] },
    ],
    nodes: [
      node('c_form', 'FORM', 'Form nhu cầu', 0, 0),
      stageNode(
        'c_new',
        'Lead mới',
        { name: 'Lead tư vấn', code: 'NEW', category: 'OPEN', position: 0, probability: 15, slaMinutes: 15, color: '#3b82f6' },
        180,
        0,
      ),
      stageNode(
        'c_contact',
        'Liên hệ',
        { name: 'Đã liên hệ', code: 'CONTACTED', category: 'IN_PROGRESS', position: 1, probability: 30, color: '#06b6d4' },
        360,
        0,
      ),
      stageNode(
        'c_qual',
        'Qualified',
        { name: 'Đủ điều kiện', code: 'QUALIFIED', category: 'QUALIFIED', position: 2, probability: 50, color: '#8b5cf6' },
        540,
        0,
      ),
      stageNode(
        'c_visit',
        'Tư vấn / đến',
        { name: 'Đã đến tư vấn', code: 'VISITED', category: 'BOOKING', position: 3, probability: 70, color: '#a855f7' },
        720,
        0,
      ),
      stageNode(
        'c_won',
        'Chốt',
        { name: 'Đã mua liệu trình', code: 'PURCHASED', category: 'WON', position: 4, probability: 100, isWon: true, color: '#22c55e' },
        900,
        0,
      ),
      node('c_goal', 'GOAL', 'Goal: chốt sau tư vấn', 1080, 0),
    ],
    connections: [
      conn('cc1', 'c_form', 'c_new'),
      conn('cc2', 'c_new', 'c_contact'),
      conn('cc3', 'c_contact', 'c_qual'),
      conn('cc4', 'c_qual', 'c_visit'),
      conn('cc5', 'c_visit', 'c_won'),
      conn('cc6', 'c_won', 'c_goal'),
    ],
    recommendedAutomation: [
      {
        name: 'Gọi tư vấn trong 15 phút',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Gọi tư vấn lead mới', dueInMinutes: 15 }],
      },
      {
        name: 'Follow lead sau tư vấn',
        triggerType: 'LEAD_UNTOUCHED',
        delayMinutes: 720,
        actions: [{ type: 'CREATE_TASK', title: 'Nhắc đề xuất liệu trình', dueInMinutes: 60 }],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'booking',
    name: 'Booking Funnel',
    description: 'Phễu đặt lịch chuẩn spa: lead → book → confirm → visit → purchase.',
    category: 'operations',
    tags: ['booking', 'appointment'],
    goal: {
      code: 'SHOW_RATE',
      label: 'Tăng tỷ lệ đến lịch & mua',
      primaryMetric: 'booking_to_visit',
    },
    requiredInputs: [
      { key: 'branchName', label: 'Chi nhánh mặc định', type: 'text', required: false },
      { key: 'serviceName', label: 'Dịch vụ book', type: 'text', required: true },
    ],
    nodes: [
      node('b_traffic', 'TRAFFIC', 'Nguồn lead', 0, 0),
      node('b_form', 'FORM', 'Form đặt lịch', 80, 0),
      stageNode('b_new', 'NEW', { name: 'Lead mới', code: 'NEW', category: 'OPEN', position: 0, probability: 10, color: '#3b82f6' }, 160, 0),
      stageNode('b_contact', 'CONTACTED', { name: 'Đã liên hệ', code: 'CONTACTED', category: 'IN_PROGRESS', position: 1, probability: 25, color: '#06b6d4' }, 320, 0),
      stageNode('b_book', 'BOOKED', { name: 'Đã đặt lịch', code: 'BOOKED', category: 'BOOKING', position: 2, probability: 50, color: '#f59e0b' }, 480, 0),
      stageNode('b_confirm', 'CONFIRMED', { name: 'Đã xác nhận', code: 'CONFIRMED', category: 'BOOKING', position: 3, probability: 60, color: '#f97316' }, 640, 0),
      stageNode('b_visit', 'VISITED', { name: 'Đã đến', code: 'VISITED', category: 'BOOKING', position: 4, probability: 75, color: '#a855f7' }, 800, 0),
      stageNode('b_won', 'PURCHASED', { name: 'Đã mua', code: 'PURCHASED', category: 'WON', position: 5, probability: 100, isWon: true, color: '#22c55e' }, 960, 0),
      stageNode('b_lost', 'LOST', { name: 'Mất lead', code: 'LOST', category: 'LOST', position: 6, probability: 0, isLost: true, color: '#9ca3af' }, 480, 160),
      node('b_goal', 'GOAL', 'Goal: show + purchase', 1120, 0),
    ],
    connections: [
      conn('bc1', 'b_traffic', 'b_form'),
      conn('bc1b', 'b_form', 'b_new'),
      conn('bc2', 'b_new', 'b_contact'),
      conn('bc3', 'b_contact', 'b_book'),
      conn('bc4', 'b_book', 'b_confirm'),
      conn('bc5', 'b_confirm', 'b_visit'),
      conn('bc6', 'b_visit', 'b_won'),
      conn('bc7', 'b_won', 'b_goal'),
      conn('bc8', 'b_book', 'b_lost', 'no-show / cancel'),
    ],
    recommendedAutomation: [
      {
        name: 'Nhắc lịch 24h',
        triggerType: 'APPOINTMENT_24H_BEFORE',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Nhắc khách xác nhận lịch', dueInMinutes: 60 }],
      },
      {
        name: 'Nhắc lịch 2h',
        triggerType: 'APPOINTMENT_2H_BEFORE',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Nhắc sắp đến giờ hẹn', dueInMinutes: 30 }],
      },
      {
        name: 'Xử lý no-show',
        triggerType: 'NO_SHOW',
        delayMinutes: 30,
        actions: [
          { type: 'CHANGE_STATUS', pipelineStatus: 'CONTACTED' },
          { type: 'CREATE_TASK', title: 'Gọi lại no-show, book lại', dueInMinutes: 60 },
        ],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'content',
    name: 'Content Funnel',
    description: 'Content → lead magnet → nurture → CTA mua / book.',
    category: 'nurture',
    tags: ['content', 'nurture'],
    goal: {
      code: 'CONTENT_CONVERT',
      label: 'Chuyển độc giả thành khách',
      primaryMetric: 'content_to_lead_to_purchase',
    },
    requiredInputs: [
      { key: 'magnetTitle', label: 'Lead magnet', type: 'text', required: true },
      { key: 'ctaUrl', label: 'CTA URL', type: 'url', required: false },
    ],
    nodes: [
      node('ct_content', 'CONTENT', 'Content / Video', 0, 0),
      node('ct_magnet', 'OFFER', 'Lead magnet', 180, 0),
      node('ct_form', 'FORM', 'Opt-in', 360, 0),
      stageNode('ct_new', 'NEW', { name: 'Lead content', code: 'NEW', category: 'OPEN', position: 0, probability: 10, color: '#3b82f6' }, 540, 0),
      stageNode('ct_contact', 'Nurture', { name: 'Đang nurture', code: 'CONTACTED', category: 'IN_PROGRESS', position: 1, probability: 25, color: '#06b6d4' }, 720, 0),
      node('ct_cta', 'CTA', 'CTA book/mua', 900, 0),
      stageNode('ct_won', 'WON', { name: 'Đã mua', code: 'PURCHASED', category: 'WON', position: 2, probability: 100, isWon: true, color: '#22c55e' }, 1080, 0),
      node('ct_goal', 'GOAL', 'Goal: convert reader', 1260, 0),
    ],
    connections: [
      conn('ctc1', 'ct_content', 'ct_magnet'),
      conn('ctc2', 'ct_magnet', 'ct_form'),
      conn('ctc3', 'ct_form', 'ct_new'),
      conn('ctc4', 'ct_new', 'ct_contact'),
      conn('ctc5', 'ct_contact', 'ct_cta'),
      conn('ctc6', 'ct_cta', 'ct_won'),
      conn('ctc7', 'ct_won', 'ct_goal'),
    ],
    recommendedAutomation: [
      {
        name: 'Gửi lead magnet',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 1,
        actions: [{ type: 'CREATE_TASK', title: 'Gửi tài liệu / video magnet', dueInMinutes: 10 }],
      },
      {
        name: 'Nurture ngày 3',
        triggerType: 'LEAD_UNTOUCHED',
        delayMinutes: 4320,
        actions: [{ type: 'CREATE_TASK', title: 'Gửi case study + CTA', dueInMinutes: 120 }],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'flash-sale',
    name: 'Flash Sale Funnel',
    description: 'Flash sale có hạn → urgency → checkout / book nhanh.',
    category: 'promotion',
    tags: ['flash-sale', 'urgency'],
    goal: {
      code: 'FLASH_CLOSE',
      label: 'Chốt đơn trong khung giờ sale',
      primaryMetric: 'sale_conversion',
    },
    requiredInputs: [
      { key: 'saleName', label: 'Tên chương trình', type: 'text', required: true },
      { key: 'saleEndAt', label: 'Hết hạn', type: 'text', required: true },
      { key: 'dealPrice', label: 'Giá deal', type: 'text', required: true },
    ],
    nodes: [
      node('f_ads', 'TRAFFIC', 'Ads flash', 0, 0),
      node('f_landing', 'LANDING', 'Landing countdown', 180, 0),
      node('f_form', 'FORM', 'Form giữ chỗ', 270, 0),
      node('f_offer', 'OFFER', 'Deal', 360, 0),
      stageNode('f_new', 'NEW', { name: 'Lead flash sale', code: 'NEW', category: 'OPEN', position: 0, probability: 25, slaMinutes: 10, color: '#3b82f6' }, 540, 0),
      stageNode('f_book', 'BOOKED', { name: 'Giữ chỗ / đặt', code: 'BOOKED', category: 'BOOKING', position: 1, probability: 60, color: '#f59e0b' }, 720, 0),
      stageNode('f_won', 'WON', { name: 'Đã thanh toán', code: 'PURCHASED', category: 'WON', position: 2, probability: 100, isWon: true, color: '#22c55e' }, 900, 0),
      stageNode('f_lost', 'LOST', { name: 'Hết hạn / bỏ', code: 'LOST', category: 'LOST', position: 3, probability: 0, isLost: true, color: '#9ca3af' }, 720, 140),
      node('f_goal', 'GOAL', 'Goal: chốt sale', 1080, 0),
    ],
    connections: [
      conn('fc1', 'f_ads', 'f_landing'),
      conn('fc2', 'f_landing', 'f_form'),
      conn('fc2b', 'f_form', 'f_offer'),
      conn('fc3', 'f_offer', 'f_new'),
      conn('fc4', 'f_new', 'f_book'),
      conn('fc5', 'f_book', 'f_won'),
      conn('fc6', 'f_won', 'f_goal'),
      conn('fc7', 'f_new', 'f_lost', 'timeout'),
    ],
    recommendedAutomation: [
      {
        name: 'Nhắc deal sắp hết',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 30,
        actions: [{ type: 'CREATE_TASK', title: 'Nhắc countdown flash sale', dueInMinutes: 15 }],
      },
      {
        name: 'Escalate lead nóng',
        triggerType: 'LEAD_UNTOUCHED',
        delayMinutes: 60,
        actions: [
          { type: 'CHANGE_STATUS', pipelineStatus: 'CONTACTED' },
          { type: 'CREATE_TASK', title: 'Gọi chốt deal ngay', dueInMinutes: 10 },
        ],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'retargeting',
    name: 'Retargeting Funnel',
    description: 'Retarget khách đã xem / bỏ giỏ / không book → offer → convert.',
    category: 'retention',
    tags: ['retarget', 'ads'],
    goal: {
      code: 'RETARGET_CONVERT',
      label: 'Thu hồi traffic đã tương tác',
      primaryMetric: 'retarget_roas',
    },
    requiredInputs: [
      { key: 'audienceSource', label: 'Nguồn audience', type: 'select', required: true, options: ['site_visitors', 'video_viewers', 'cart_abandon', 'lead_open'] },
      { key: 'retargetOffer', label: 'Offer retarget', type: 'text', required: true },
    ],
    nodes: [
      node('r_audience', 'RETARGET', 'Audience ấm', 0, 0),
      node('r_ads', 'TRAFFIC', 'Retarget ads', 180, 0),
      node('r_offer', 'OFFER', 'Offer cá nhân hóa', 360, 0),
      node('r_form', 'FORM', 'Form nhận offer', 450, 0),
      stageNode('r_new', 'Re-engage', { name: 'Lead retarget', code: 'CONTACTED', category: 'IN_PROGRESS', position: 0, probability: 30, color: '#06b6d4' }, 540, 0),
      stageNode('r_book', 'Book', { name: 'Đặt lịch lại', code: 'BOOKED', category: 'BOOKING', position: 1, probability: 55, color: '#f59e0b' }, 720, 0),
      stageNode('r_won', 'Won', { name: 'Đã mua', code: 'PURCHASED', category: 'WON', position: 2, probability: 100, isWon: true, color: '#22c55e' }, 900, 0),
      node('r_goal', 'GOAL', 'Goal: recover', 1080, 0),
    ],
    connections: [
      conn('rc1', 'r_audience', 'r_ads'),
      conn('rc2', 'r_ads', 'r_offer'),
      conn('rc3', 'r_offer', 'r_form'),
      conn('rc3b', 'r_form', 'r_new'),
      conn('rc4', 'r_new', 'r_book'),
      conn('rc5', 'r_book', 'r_won'),
      conn('rc6', 'r_won', 'r_goal'),
    ],
    recommendedAutomation: [
      {
        name: 'Ưu đãi retarget',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 5,
        actions: [{ type: 'CREATE_TASK', title: 'Gửi offer retarget + CTA', dueInMinutes: 20 }],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'referral',
    name: 'Referral Funnel',
    description: 'Khách giới thiệu bạn → thưởng → lead mới vào phễu.',
    category: 'growth',
    tags: ['referral', 'viral'],
    goal: {
      code: 'REFERRAL_ACQUIRE',
      label: 'Tăng lead từ giới thiệu',
      primaryMetric: 'referral_leads',
    },
    requiredInputs: [
      { key: 'rewardReferrer', label: 'Thưởng người giới thiệu', type: 'text', required: true },
      { key: 'rewardFriend', label: 'Thưởng bạn được giới thiệu', type: 'text', required: true },
    ],
    nodes: [
      node('rf_advocate', 'REFERRAL', 'Khách advocate', 0, 0),
      node('rf_share', 'CTA', 'Share link', 180, 0),
      node('rf_friend', 'FORM', 'Bạn đăng ký', 360, 0),
      stageNode('rf_new', 'NEW', { name: 'Lead referral', code: 'NEW', category: 'OPEN', position: 0, probability: 20, color: '#3b82f6' }, 540, 0),
      stageNode('rf_book', 'BOOKED', { name: 'Bạn đặt lịch', code: 'BOOKED', category: 'BOOKING', position: 1, probability: 55, color: '#f59e0b' }, 720, 0),
      stageNode('rf_won', 'WON', { name: 'Bạn đã mua', code: 'PURCHASED', category: 'WON', position: 2, probability: 100, isWon: true, color: '#22c55e' }, 900, 0),
      node('rf_reward', 'OFFER', 'Trả thưởng', 1080, 0),
      node('rf_goal', 'GOAL', 'Goal: referral loop', 1260, 0),
    ],
    connections: [
      conn('rfc1', 'rf_advocate', 'rf_share'),
      conn('rfc2', 'rf_share', 'rf_friend'),
      conn('rfc3', 'rf_friend', 'rf_new'),
      conn('rfc4', 'rf_new', 'rf_book'),
      conn('rfc5', 'rf_book', 'rf_won'),
      conn('rfc6', 'rf_won', 'rf_reward'),
      conn('rfc7', 'rf_reward', 'rf_goal'),
    ],
    recommendedAutomation: [
      {
        name: 'Welcome referral',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 2,
        actions: [
          { type: 'ADD_TAG', tag: 'referral' },
          { type: 'CREATE_TASK', title: 'Gửi ưu đãi bạn được giới thiệu', dueInMinutes: 15 },
        ],
      },
      {
        name: 'Thưởng khi bạn mua',
        triggerType: 'ORDER_COMPLETED',
        delayMinutes: 10,
        actions: [{ type: 'CREATE_TASK', title: 'Xác nhận thưởng cho người giới thiệu', dueInMinutes: 60 }],
      },
    ],
  }),

  parseFunnelTemplateDefinition({
    slug: 'reactivation',
    name: 'Reactivation Funnel',
    description: 'Đánh thức khách/lead ngủ đông bằng offer + chuỗi chăm sóc.',
    category: 'retention',
    tags: ['reactivation', 'winback'],
    goal: {
      code: 'WINBACK',
      label: 'Đánh thức khách inactive',
      primaryMetric: 'reactivation_rate',
    },
    requiredInputs: [
      { key: 'inactiveDays', label: 'Số ngày inactive', type: 'number', required: true },
      { key: 'winbackOffer', label: 'Offer win-back', type: 'text', required: true },
    ],
    nodes: [
      node('ra_segment', 'RETARGET', 'Segment inactive', 0, 0),
      node('ra_offer', 'OFFER', 'Win-back offer', 180, 0),
      node('ra_form', 'FORM', 'Form nhận ưu đãi', 270, 0),
      stageNode('ra_contact', 'Re-engage', { name: 'Đang đánh thức', code: 'CONTACTED', category: 'IN_PROGRESS', position: 0, probability: 25, color: '#06b6d4' }, 360, 0),
      stageNode('ra_book', 'Book lại', { name: 'Đặt lịch trở lại', code: 'BOOKED', category: 'BOOKING', position: 1, probability: 50, color: '#f59e0b' }, 540, 0),
      stageNode('ra_won', 'Won', { name: 'Đã mua lại', code: 'PURCHASED', category: 'WON', position: 2, probability: 100, isWon: true, color: '#22c55e' }, 720, 0),
      stageNode('ra_lost', 'Lost', { name: 'Không phản hồi', code: 'LOST', category: 'LOST', position: 3, probability: 0, isLost: true, color: '#9ca3af' }, 540, 140),
      node('ra_goal', 'GOAL', 'Goal: win-back', 900, 0),
    ],
    connections: [
      conn('rac1', 'ra_segment', 'ra_offer'),
      conn('rac2', 'ra_offer', 'ra_form'),
      conn('rac2b', 'ra_form', 'ra_contact'),
      conn('rac3', 'ra_contact', 'ra_book'),
      conn('rac4', 'ra_book', 'ra_won'),
      conn('rac5', 'ra_won', 'ra_goal'),
      conn('rac6', 'ra_contact', 'ra_lost', 'no reply'),
    ],
    recommendedAutomation: [
      {
        name: 'Win-back khách inactive',
        triggerType: 'CUSTOMER_INACTIVE',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Gửi offer đánh thức + gọi lại', dueInMinutes: 120 }],
      },
      {
        name: 'Birthday reactivation',
        triggerType: 'BIRTHDAY',
        delayMinutes: 0,
        actions: [{ type: 'CREATE_TASK', title: 'Gửi ưu đãi sinh nhật', dueInMinutes: 60 }],
      },
    ],
  }),
];

export function getDefaultFunnelTemplate(slug: string): FunnelTemplateDefinition | undefined {
  return DEFAULT_FUNNEL_TEMPLATES.find((t) => t.slug === slug);
}
