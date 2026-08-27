import { z } from 'zod';

/** Legacy LeadPipelineStatus codes — still valid stage.code values for dual-write */
export const LEAD_PIPELINE_STATUS_CODES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'BOOKED',
  'CONFIRMED',
  'VISITED',
  'PURCHASED',
  'LOST',
] as const;

export type LeadPipelineStatusCode = (typeof LEAD_PIPELINE_STATUS_CODES)[number];

export const FUNNEL_STAGE_CATEGORIES = [
  'OPEN',
  'IN_PROGRESS',
  'QUALIFIED',
  'BOOKING',
  'WON',
  'LOST',
  'CUSTOM',
] as const;

export type FunnelStageCategoryCode = (typeof FUNNEL_STAGE_CATEGORIES)[number];

export const AUTOMATION_TRIGGER_CODES = [
  'LEAD_CREATED',
  'LEAD_UNTOUCHED',
  'LEAD_BOOKED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_UNCONFIRMED',
  'APPOINTMENT_24H_BEFORE',
  'APPOINTMENT_2H_BEFORE',
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CANCELLED',
  'NO_SHOW',
  'BIRTHDAY',
  'CUSTOMER_INACTIVE',
  'ORDER_COMPLETED',
  'TREATMENT_EXPIRING',
  'MANUAL',
  'STAGE_CHANGED',
  'SCORE_CHANGED',
  'MESSAGE_RECEIVED',
  'NO_REPLY',
  'BOOKING_CREATED',
  'PURCHASED',
] as const;

export const funnelStageProposalSchema = z.object({
  name: z.string().min(1).max(120),
  /** Free-form within pipeline; legacy NEW/… still supported */
  code: z
    .string()
    .min(1)
    .max(64)
    .transform((v) => v.trim().toUpperCase().replace(/\s+/g, '_')),
  category: z.enum(FUNNEL_STAGE_CATEGORIES).optional(),
  position: z.number().int().min(0).max(50),
  color: z.string().max(32).optional(),
  probability: z.number().min(0).max(100).optional(),
  slaMinutes: z.number().int().min(0).nullable().optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  /** @deprecated use isLost */
  isLostStage: z.boolean().optional(),
});

export const funnelAutomationActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SEND_MESSAGE'),
    templateId: z.string().uuid().optional(),
    bodyHint: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal('SEND_EMAIL'),
    templateId: z.string().uuid().optional(),
    bodyHint: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal('CREATE_TASK'),
    title: z.string().min(1).max(200),
    dueInMinutes: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('ASSIGN_EMPLOYEE'),
    employeeId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('CHANGE_STATUS'),
    pipelineStatus: z.string().min(1).max(64).optional(),
    stageId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('ADD_TAG'),
    tag: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal('CREATE_APPOINTMENT'),
    branchId: z.string().uuid().optional(),
    delayMinutes: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('WAIT'),
    minutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
    delayMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
  }),
  z.object({
    type: z.literal('WEBHOOK'),
    url: z.string().url().max(2000),
    secretHeader: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal('CHANGE_STAGE'),
    pipelineStatus: z.string().min(1).max(64).optional(),
    stageId: z.string().uuid().optional(),
    stageCode: z.string().min(1).max(64).optional(),
  }),
  z.object({
    type: z.literal('ASSIGN_SALE'),
    employeeId: z.string().uuid().optional(),
  }),
]);

export const funnelFlowProposalSchema = z.object({
  name: z.string().min(1).max(160),
  triggerType: z.enum(AUTOMATION_TRIGGER_CODES),
  delayMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
  channel: z.enum(['SMS', 'ZALO', 'EMAIL', 'MESSENGER', 'PUSH']).optional(),
  actions: z.array(funnelAutomationActionSchema).max(12).default([]),
  rationale: z.string().max(400).optional(),
});

export const funnelBlueprintDraftSchema = z.object({
  name: z.string().min(1).max(160),
  summary: z.string().max(800).optional(),
  industryHint: z.string().max(120).optional(),
  stages: z.array(funnelStageProposalSchema).min(1).max(20),
  flows: z.array(funnelFlowProposalSchema).max(20).default([]),
});

export type FunnelStageProposal = z.infer<typeof funnelStageProposalSchema>;
export type FunnelFlowProposal = z.infer<typeof funnelFlowProposalSchema>;
export type FunnelBlueprintDraft = z.infer<typeof funnelBlueprintDraftSchema>;

export const DEFAULT_FUNNEL_STAGE_COLORS: Record<string, string> = {
  NEW: '#3b82f6',
  CONTACTED: '#06b6d4',
  QUALIFIED: '#8b5cf6',
  BOOKED: '#f59e0b',
  CONFIRMED: '#f97316',
  VISITED: '#a855f7',
  PURCHASED: '#22c55e',
  LOST: '#9ca3af',
};

const DEFAULT_STAGE_META: Array<FunnelStageProposal> = [
  {
    name: 'Lead mới',
    code: 'NEW',
    category: 'OPEN',
    position: 0,
    color: '#3b82f6',
    probability: 10,
    slaMinutes: 15,
  },
  {
    name: 'Đã liên hệ',
    code: 'CONTACTED',
    category: 'IN_PROGRESS',
    position: 1,
    color: '#06b6d4',
    probability: 20,
    slaMinutes: 60,
  },
  {
    name: 'Đủ điều kiện',
    code: 'QUALIFIED',
    category: 'QUALIFIED',
    position: 2,
    color: '#8b5cf6',
    probability: 40,
    slaMinutes: 120,
  },
  {
    name: 'Đã đặt lịch',
    code: 'BOOKED',
    category: 'BOOKING',
    position: 3,
    color: '#f59e0b',
    probability: 50,
    slaMinutes: 1440,
  },
  {
    name: 'Đã xác nhận',
    code: 'CONFIRMED',
    category: 'BOOKING',
    position: 4,
    color: '#f97316',
    probability: 60,
    slaMinutes: 720,
  },
  {
    name: 'Đã đến',
    code: 'VISITED',
    category: 'BOOKING',
    position: 5,
    color: '#a855f7',
    probability: 70,
  },
  {
    name: 'Đã mua',
    code: 'PURCHASED',
    category: 'WON',
    position: 6,
    color: '#22c55e',
    probability: 100,
    isWon: true,
  },
  {
    name: 'Mất lead',
    code: 'LOST',
    category: 'LOST',
    position: 7,
    color: '#9ca3af',
    probability: 0,
    isLost: true,
  },
];

/** Deterministic spa/beauty fallback when LLM unavailable */
export function buildDefaultFunnelBlueprintDraft(
  prompt: string,
  overrides?: Partial<FunnelBlueprintDraft>,
): FunnelBlueprintDraft {
  const trimmed = prompt.trim().slice(0, 120) || 'Phễu chăm sóc lead';
  const base: FunnelBlueprintDraft = {
    name: `AI Funnel — ${trimmed}`,
    summary:
      'Phễu chuẩn spa/beauty: tiếp nhận → liên hệ → đủ điều kiện → đặt lịch → xác nhận → đến → mua / mất lead.',
    industryHint: 'spa',
    stages: DEFAULT_STAGE_META,
    flows: [
      {
        name: 'Chào lead mới',
        triggerType: 'LEAD_CREATED',
        delayMinutes: 5,
        actions: [
          { type: 'CREATE_TASK', title: 'Gọi chào lead mới trong 15 phút', dueInMinutes: 15 },
        ],
        rationale: 'Phản hồi nhanh khi lead vừa tạo',
      },
      {
        name: 'Nhắc lead chưa chạm',
        triggerType: 'LEAD_UNTOUCHED',
        delayMinutes: 60,
        actions: [
          { type: 'CREATE_TASK', title: 'Follow-up lead chưa liên hệ', dueInMinutes: 30 },
          { type: 'CHANGE_STATUS', pipelineStatus: 'CONTACTED' },
        ],
        rationale: 'Giảm lead tồn NEW quá lâu',
      },
      {
        name: 'Nhắc lịch hẹn 24h',
        triggerType: 'APPOINTMENT_24H_BEFORE',
        delayMinutes: 0,
        actions: [
          { type: 'CREATE_TASK', title: 'Nhắc khách xác nhận lịch ngày mai', dueInMinutes: 60 },
        ],
        rationale: 'Giảm no-show',
      },
    ],
  };

  return funnelBlueprintDraftSchema.parse({ ...base, ...overrides });
}

export function parseFunnelBlueprintDraft(raw: unknown): FunnelBlueprintDraft {
  return funnelBlueprintDraftSchema.parse(raw);
}

/**
 * Normalize stages: dedupe by code, fill missing legacy codes only when draft
 * looks like a full spa journey (has NEW or ≥5 stages). Custom funnels keep as-is.
 */
export function normalizeFunnelBlueprintDraft(draft: FunnelBlueprintDraft): FunnelBlueprintDraft {
  const byCode = new Map<string, FunnelStageProposal>();
  for (const stage of draft.stages) {
    byCode.set(stage.code, stage);
  }

  const looksLikeLegacy =
    byCode.has('NEW') || draft.stages.length >= 5 || draft.industryHint === 'spa';
  if (looksLikeLegacy) {
    for (const d of DEFAULT_STAGE_META) {
      if (!byCode.has(d.code)) byCode.set(d.code, d);
    }
  }

  const stages = [...byCode.values()]
    .sort((a, b) => a.position - b.position)
    .map((s, i) => ({
      ...s,
      position: i,
      color: s.color ?? DEFAULT_FUNNEL_STAGE_COLORS[s.code] ?? '#94a3b8',
      isLost: s.code === 'LOST' ? true : s.isLost ?? s.isLostStage,
      isWon: s.code === 'PURCHASED' ? true : s.isWon,
      category:
        s.category ??
        (s.code === 'LOST'
          ? 'LOST'
          : s.code === 'PURCHASED'
            ? 'WON'
            : s.code === 'QUALIFIED'
              ? 'QUALIFIED'
              : s.code === 'NEW'
                ? 'OPEN'
                : ['BOOKED', 'CONFIRMED', 'VISITED'].includes(s.code)
                  ? 'BOOKING'
                  : s.code === 'CONTACTED'
                    ? 'IN_PROGRESS'
                    : 'CUSTOM'),
    }));

  return funnelBlueprintDraftSchema.parse({
    ...draft,
    stages,
  });
}
