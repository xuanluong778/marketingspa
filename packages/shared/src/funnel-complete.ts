import { z } from 'zod';
import { FUNNEL_NODE_TYPES, FUNNEL_TEMPLATE_SLUGS } from './funnel-templates';
import { funnelStageProposalSchema, funnelFlowProposalSchema } from './funnel-blueprint';
import type { FunnelBriefAnalysis, FunnelRecommendationOption } from './funnel-generator';
import type { FunnelTemplateDefinition } from './funnel-templates';
import { getDefaultFunnelTemplate } from './funnel-templates';

const strictStr = (max: number) => z.string().min(1).max(max);
const optStr = (max: number) => z.string().max(max).optional();

export const funnelCompleteNodeSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(FUNNEL_NODE_TYPES),
    label: strictStr(160),
    description: optStr(400),
    stage: funnelStageProposalSchema.optional(),
    position: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .optional(),
    meta: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })
  .strict();

export const FUNNEL_EDGE_BRANCHES = ['success', 'failure', 'timeout', 'default'] as const;
export type FunnelEdgeBranch = (typeof FUNNEL_EDGE_BRANCHES)[number];

export const funnelEdgeConditionSchema = z
  .object({
    field: z.string().min(1).max(64),
    op: z.enum(['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'contains']),
    value: z.union([z.string().max(160), z.number(), z.boolean()]),
  })
  .strict();

export const funnelCompleteConnectionSchema = z
  .object({
    id: z.string().min(1).max(64),
    from: z.string().min(1).max(64),
    to: z.string().min(1).max(64),
    label: optStr(120),
    event: optStr(64),
    condition: funnelEdgeConditionSchema.optional(),
    delayMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
    timeoutMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
    branch: z.enum(FUNNEL_EDGE_BRANCHES).optional(),
  })
  .strict();

export const funnelLeadFormFieldSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    key: z.string().min(1).max(64),
    label: strictStr(120),
    type: z.enum(['text', 'tel', 'email', 'select', 'radio', 'textarea', 'checkbox', 'number']),
    required: z.boolean(),
    placeholder: optStr(160),
    options: z.array(z.string().max(80)).max(20).optional(),
  })
  .strict();

export const funnelLeadFormSchema = z
  .object({
    title: strictStr(160),
    submitLabel: strictStr(80),
    fields: z.array(funnelLeadFormFieldSchema).min(1).max(20),
    privacyNote: optStr(300),
  })
  .strict();

export const funnelChatbotStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(['message', 'question', 'quick_reply', 'handoff', 'book', 'end']),
    content: strictStr(500),
    nextId: z.string().max(64).nullable().optional(),
    options: z
      .array(
        z
          .object({
            label: strictStr(80),
            nextId: z.string().min(1).max(64),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();

export const funnelChatbotFlowSchema = z
  .object({
    name: strictStr(120),
    entryStepId: z.string().min(1).max(64),
    steps: z.array(funnelChatbotStepSchema).min(2).max(30),
  })
  .strict();

export const funnelFollowUpSchema = z
  .object({
    name: strictStr(120),
    trigger: z.enum([
      'LEAD_CREATED',
      'LEAD_UNTOUCHED',
      'FORM_SUBMITTED',
      'NO_SHOW',
      'AFTER_VISIT',
      'CUSTOM',
    ]),
    delayMinutes: z.number().int().min(0).max(60 * 24 * 30),
    channel: z.enum(['ZALO', 'SMS', 'EMAIL', 'MESSENGER', 'PHONE', 'TASK']),
    message: strictStr(500),
  })
  .strict();

export const funnelLeadScoringRuleSchema = z
  .object({
    key: z.string().min(1).max(64),
    label: strictStr(120),
    points: z.number().int().min(-50).max(100),
    condition: strictStr(240),
  })
  .strict();

export const funnelLeadScoringSchema = z
  .object({
    maxScore: z.number().int().min(10).max(200).default(100),
    hotThreshold: z.number().int().min(1).max(200),
    mqlThreshold: z.number().int().min(0).max(100).optional(),
    sqlThreshold: z.number().int().min(0).max(100).optional(),
    rules: z.array(funnelLeadScoringRuleSchema).min(1).max(20),
  })
  .strict();

export const funnelSalesHandoffSchema = z
  .object({
    trigger: z.enum(['HOT_SCORE', 'FORM_SUBMITTED', 'CHAT_REQUEST', 'BOOKING_INTENT', 'MANUAL']),
    assigneeRole: z.enum(['SALE', 'CONSULTANT', 'RECEPTION', 'OWNER']),
    slaMinutes: z.number().int().min(5).max(1440),
    notes: optStr(400),
  })
  .strict();

export const funnelBookingSchema = z
  .object({
    enabled: z.boolean(),
    serviceName: strictStr(160),
    durationMinutes: z.number().int().min(15).max(480).default(60),
    bufferMinutes: z.number().int().min(0).max(120).default(15),
    confirmationRequired: z.boolean().default(true),
    reminderHoursBefore: z.array(z.number().int().min(1).max(168)).max(5).default([24, 2]),
  })
  .strict();

export const funnelRemarketingSchema = z
  .object({
    audiences: z
      .array(
        z
          .object({
            key: z.string().min(1).max(64),
            label: strictStr(120),
            description: optStr(240),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    channels: z.array(z.enum(['FACEBOOK', 'TIKTOK', 'GOOGLE', 'ZALO'])).min(1).max(6),
    offer: strictStr(240),
    frequencyCapDays: z.number().int().min(1).max(30).default(7),
  })
  .strict();

export const funnelConversionGoalSchema = z
  .object({
    code: z.string().min(1).max(64),
    label: strictStr(160),
    description: optStr(400),
    primaryEvent: z.enum([
      'LEAD_CREATED',
      'FORM_SUBMITTED',
      'BOOKING_CONFIRMED',
      'VISIT',
      'PURCHASE',
      'CHAT_HANDOFF',
    ]),
  })
  .strict();

export const funnelKpiSchema = z
  .object({
    key: z.string().min(1).max(64),
    label: strictStr(120),
    target: z.number().min(0).max(1_000_000),
    unit: z.enum(['percent', 'count', 'currency', 'score', 'minutes']),
    description: optStr(240),
  })
  .strict();

/** Fixed complete funnel JSON — AI must fill this shape only */
export const funnelCompleteSpecSchema = z
  .object({
    schemaVersion: z.literal('funnel-complete.v1'),
    templateSlug: z.enum(FUNNEL_TEMPLATE_SLUGS),
    name: strictStr(160),
    summary: optStr(800),
    strategy: strictStr(800),
    offer: strictStr(300),
    cta: strictStr(160),
    stages: z.array(funnelStageProposalSchema).min(1).max(20),
    nodes: z.array(funnelCompleteNodeSchema).min(1).max(40),
    connections: z.array(funnelCompleteConnectionSchema).max(60),
    leadForm: funnelLeadFormSchema,
    chatbotFlow: funnelChatbotFlowSchema,
    followUp: z.array(funnelFollowUpSchema).min(1).max(12),
    /** Mirror of template recommendedAutomation / follow-up automations */
    automations: z.array(funnelFlowProposalSchema).max(20).default([]),
    leadScoring: funnelLeadScoringSchema,
    salesHandoff: funnelSalesHandoffSchema,
    booking: funnelBookingSchema,
    remarketing: funnelRemarketingSchema,
    conversionGoal: funnelConversionGoalSchema,
    kpis: z.array(funnelKpiSchema).min(2).max(12),
    mode: z.literal('draft'),
    disclaimers: z.array(z.string().max(240)).max(5).default([
      'Funnel hoàn chỉnh ở chế độ draft — chưa apply/deploy vào pipeline live.',
    ]),
  })
  .strict();

export type FunnelCompleteNode = z.infer<typeof funnelCompleteNodeSchema>;
export type FunnelCompleteConnection = z.infer<typeof funnelCompleteConnectionSchema>;
export type FunnelEdgeCondition = z.infer<typeof funnelEdgeConditionSchema>;
export type FunnelCompleteSpec = z.infer<typeof funnelCompleteSpecSchema>;

export function parseFunnelCompleteSpec(raw: unknown): FunnelCompleteSpec {
  return funnelCompleteSpecSchema.parse(raw);
}

/**
 * Force template graph + strip invalid AI extras.
 * Connections must reference existing node ids; stages derived from STAGE nodes when possible.
 */
export function sanitizeFunnelCompleteSpec(
  raw: unknown,
  opts: {
    templateSlug: (typeof FUNNEL_TEMPLATE_SLUGS)[number];
    template: FunnelTemplateDefinition;
    option?: FunnelRecommendationOption;
    analysis?: FunnelBriefAnalysis;
  },
): FunnelCompleteSpec {
  const base = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  // Prefer template graph as source of truth for structure
  const templateNodes = opts.template.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    label: n.label,
    description: n.description,
    stage: n.stage,
    position: n.position,
    meta: undefined as Record<string, string | number | boolean | null> | undefined,
  }));

  const aiNodes = Array.isArray(base.nodes) ? base.nodes : [];
  // Allow AI to override labels/descriptions for template node ids only
  const nodeById = new Map(templateNodes.map((n) => [n.id, { ...n }]));
  for (const rawNode of aiNodes) {
    if (!rawNode || typeof rawNode !== 'object') continue;
    const n = rawNode as Record<string, unknown>;
    const id = typeof n.id === 'string' ? n.id : null;
    if (!id || !nodeById.has(id)) continue;
    const cur = nodeById.get(id)!;
    if (typeof n.label === 'string' && n.label.trim()) cur.label = n.label.slice(0, 160);
    if (typeof n.description === 'string') cur.description = n.description.slice(0, 400);
  }

  const nodes = [...nodeById.values()];
  const nodeIds = new Set(nodes.map((n) => n.id));

  const templateConns = opts.template.connections.filter(
    (c) => nodeIds.has(c.from) && nodeIds.has(c.to),
  );

  const stagesFromNodes = nodes
    .filter((n) => n.type === 'STAGE' && n.stage)
    .map((n, i) => ({
      ...n.stage!,
      position: n.stage!.position ?? i,
      name: n.stage!.name || n.label,
    }));

  const stages =
    stagesFromNodes.length > 0
      ? stagesFromNodes
      : [
          {
            name: 'Lead mới',
            code: 'NEW',
            category: 'OPEN' as const,
            position: 0,
            probability: 10,
          },
          {
            name: 'Đã mua',
            code: 'PURCHASED',
            category: 'WON' as const,
            position: 1,
            probability: 100,
            isWon: true,
          },
        ];

  const service = opts.analysis?.service ?? opts.option?.funnelName ?? opts.template.name;
  const offer =
    (typeof base.offer === 'string' && base.offer.trim()) ||
    opts.option?.offer ||
    opts.analysis?.offer ||
    opts.template.goal.label;
  const cta =
    (typeof base.cta === 'string' && base.cta.trim()) ||
    opts.option?.cta ||
    'Đăng ký ngay';

  const merged = {
    schemaVersion: 'funnel-complete.v1' as const,
    templateSlug: opts.templateSlug,
    name:
      (typeof base.name === 'string' && base.name.trim()) ||
      opts.option?.funnelName ||
      opts.template.name,
    summary:
      (typeof base.summary === 'string' && base.summary) ||
      opts.option?.strategy ||
      opts.template.description,
    strategy:
      (typeof base.strategy === 'string' && base.strategy.trim()) ||
      opts.option?.strategy ||
      opts.template.description ||
      'Chiến lược funnel theo template đã chọn',
    offer,
    cta,
    stages,
    nodes,
    connections: templateConns,
    leadForm: base.leadForm ?? defaultLeadForm(service),
    chatbotFlow: base.chatbotFlow ?? defaultChatbotFlow(service, cta),
    followUp: base.followUp ?? defaultFollowUps(offer),
    automations: opts.template.recommendedAutomation ?? [],
    leadScoring: base.leadScoring ?? defaultLeadScoring(),
    salesHandoff: base.salesHandoff ?? defaultSalesHandoff(),
    booking: base.booking ?? defaultBooking(service),
    remarketing: base.remarketing ?? defaultRemarketing(offer),
    conversionGoal: base.conversionGoal ?? {
      code: opts.template.goal.code,
      label: opts.template.goal.label,
      description: opts.template.goal.description,
      primaryEvent: 'BOOKING_CONFIRMED' as const,
    },
    kpis: base.kpis ?? defaultKpis(),
    mode: 'draft' as const,
    disclaimers: [
      'Funnel hoàn chỉnh ở chế độ draft — chưa apply/deploy vào pipeline live.',
      'Cấu trúc nodes/connections lấy từ Funnel Template Engine; AI chỉ điền nội dung trong schema.',
    ],
  };

  return parseFunnelCompleteSpec(merged);
}

export function buildFallbackFunnelComplete(opts: {
  templateSlug: (typeof FUNNEL_TEMPLATE_SLUGS)[number];
  option?: FunnelRecommendationOption;
  analysis?: FunnelBriefAnalysis;
}): FunnelCompleteSpec {
  const template = getDefaultFunnelTemplate(opts.templateSlug);
  if (!template) {
    throw new Error(`Unknown template slug: ${opts.templateSlug}`);
  }
  return sanitizeFunnelCompleteSpec({}, { ...opts, template });
}

function defaultLeadForm(service: string) {
  return {
    title: `Đăng ký tư vấn ${service}`,
    submitLabel: 'Gửi thông tin',
    fields: [
      { key: 'full_name', label: 'Họ và tên', type: 'text' as const, required: true, placeholder: 'Nguyễn Thị A' },
      { key: 'phone', label: 'Số điện thoại', type: 'tel' as const, required: true, placeholder: '09…' },
      { key: 'email', label: 'Email', type: 'email' as const, required: false, placeholder: 'email@domain.com' },
      { key: 'preferred_time', label: 'Khung giờ thuận tiện', type: 'select' as const, required: false, options: ['Sáng', 'Chiều', 'Tối'] },
      { key: 'contact_via', label: 'Kênh liên hệ', type: 'radio' as const, required: false, options: ['Zalo', 'Điện thoại', 'Email'] },
      { key: 'agree_offer', label: 'Đồng ý nhận ưu đãi', type: 'checkbox' as const, required: false },
      { key: 'note', label: 'Nhu cầu / ghi chú', type: 'textarea' as const, required: false },
    ],
    privacyNote: 'Thông tin chỉ dùng để tư vấn, không chia sẻ bên thứ ba.',
  };
}

function defaultChatbotFlow(service: string, cta: string) {
  return {
    name: `Chatbot ${service}`,
    entryStepId: 's1',
    steps: [
      {
        id: 's1',
        type: 'message' as const,
        content: `Chào bạn! Mình hỗ trợ tư vấn ${service}.`,
        nextId: 's2',
      },
      {
        id: 's2',
        type: 'question' as const,
        content: 'Bạn muốn nhận ưu đãi hay đặt lịch tư vấn?',
        options: [
          { label: 'Nhận ưu đãi', nextId: 's3' },
          { label: 'Đặt lịch', nextId: 's4' },
        ],
      },
      {
        id: 's3',
        type: 'message' as const,
        content: `Tuyệt! ${cta}. Cho mình xin SĐT nhé.`,
        nextId: 's5',
      },
      {
        id: 's4',
        type: 'book' as const,
        content: 'Mình sẽ chuyển bạn sang đặt lịch với tư vấn viên.',
        nextId: 's5',
      },
      {
        id: 's5',
        type: 'handoff' as const,
        content: 'Đang kết nối sale/tư vấn viên…',
        nextId: 's6',
      },
      {
        id: 's6',
        type: 'end' as const,
        content: 'Cảm ơn bạn! Spa sẽ liên hệ sớm.',
        nextId: null,
      },
    ],
  };
}

function defaultFollowUps(offer: string) {
  return [
    {
      name: 'Xác nhận lead mới',
      trigger: 'LEAD_CREATED' as const,
      delayMinutes: 5,
      channel: 'ZALO' as const,
      message: `Cảm ơn bạn đã đăng ký. ${offer}`,
    },
    {
      name: 'Nhắc lead chưa phản hồi',
      trigger: 'LEAD_UNTOUCHED' as const,
      delayMinutes: 1440,
      channel: 'TASK' as const,
      message: 'Gọi follow-up lead chưa liên hệ trong 24h',
    },
  ];
}

function defaultLeadScoring() {
  return {
    maxScore: 100,
    hotThreshold: 70,
    rules: [
      { key: 'has_phone', label: 'Có SĐT', points: 20, condition: 'phone is present' },
      { key: 'booking_intent', label: 'Muốn đặt lịch', points: 30, condition: 'intent=book' },
      { key: 'high_budget', label: 'Quan tâm gói cao', points: 25, condition: 'interest=premium' },
      { key: 'near_branch', label: 'Gần chi nhánh', points: 15, condition: 'distance<=5km' },
    ],
  };
}

function defaultSalesHandoff() {
  return {
    trigger: 'HOT_SCORE' as const,
    assigneeRole: 'SALE' as const,
    slaMinutes: 15,
    notes: 'Ưu tiên gọi lead hot trong 15 phút',
  };
}

function defaultBooking(service: string) {
  return {
    enabled: true,
    serviceName: service,
    durationMinutes: 60,
    bufferMinutes: 15,
    confirmationRequired: true,
    reminderHoursBefore: [24, 2],
  };
}

function defaultRemarketing(offer: string) {
  return {
    audiences: [
      { key: 'form_view_no_submit', label: 'Xem form chưa submit', description: 'Remarketing 7 ngày' },
      { key: 'lead_no_book', label: 'Lead chưa book', description: 'Nhắc ưu đãi' },
    ],
    channels: ['FACEBOOK' as const, 'ZALO' as const],
    offer,
    frequencyCapDays: 7,
  };
}

function defaultKpis() {
  return [
    { key: 'cpl', label: 'Chi phí / lead', target: 80000, unit: 'currency' as const },
    { key: 'form_cvr', label: 'Tỷ lệ submit form', target: 18, unit: 'percent' as const },
    { key: 'book_rate', label: 'Lead → Book', target: 35, unit: 'percent' as const },
    { key: 'show_rate', label: 'Book → Đến', target: 70, unit: 'percent' as const },
    { key: 'purchase_rate', label: 'Đến → Mua', target: 45, unit: 'percent' as const },
  ];
}
