/** Per-funnel lead scoring 0–100 + MQL/SQL (Prompt 10). */

export const FUNNEL_SCORING_EVENTS = [
  'FORM_SUBMITTED',
  'CHATBOT_REPLY',
  'ASK_PRICE',
  'CTA_CLICK',
  'BOOKING_CREATED',
  'NO_REPLY',
  'APPOINTMENT_CANCELLED',
] as const;

export type FunnelScoringEventType = (typeof FUNNEL_SCORING_EVENTS)[number];

export type LeadQualification = 'MQL' | 'SQL';

export type ScoringRuleProposal = {
  key: string;
  label: string;
  eventType: FunnelScoringEventType;
  points: number;
  condition: { once?: boolean; cooldownMinutes?: number };
  isActive: boolean;
  position: number;
};

export type ScoringConfigProposal = {
  maxScore: number;
  mqlThreshold: number;
  sqlThreshold: number;
  rules: ScoringRuleProposal[];
  rationale: string;
};

const PRICE_RE =
  /(bảng\s*giá|báo\s*giá|hỏi\s*giá|giá\s*(tiền|bao|sao)|bao\s*nhiêu\s*(tiền|giá)?|nhiêu\s*tiền|price|cost|pricing|fee)/i;

export function detectAskPrice(text: string | null | undefined): boolean {
  if (!text) return false;
  return PRICE_RE.test(text);
}

export function clampLeadScore(score: number, maxScore = 100): number {
  const max = Math.min(100, Math.max(10, Math.round(maxScore) || 100));
  return Math.min(max, Math.max(0, Math.round(score)));
}

export function applyScoreDelta(
  current: number,
  points: number,
  maxScore = 100,
): { previous: number; next: number; delta: number } {
  const previous = clampLeadScore(current, maxScore);
  const next = clampLeadScore(previous + points, maxScore);
  return { previous, next, delta: next - previous };
}

export function qualificationAfterScore(
  previous: number,
  next: number,
  mqlThreshold: number,
  sqlThreshold: number,
  current?: string | null,
): {
  qualification: LeadQualification | null;
  crossedMql: boolean;
  crossedSql: boolean;
  crossed: LeadQualification | null;
} {
  const mql = Math.min(100, Math.max(0, mqlThreshold));
  const sql = Math.min(100, Math.max(mql, sqlThreshold));
  const alreadySql = current === 'SQL' || previous >= sql;
  const alreadyMql = alreadySql || current === 'MQL' || previous >= mql;
  const crossedSql = !alreadySql && next >= sql;
  const crossedMql = !alreadyMql && !crossedSql && next >= mql;
  let qualification: LeadQualification | null =
    current === 'SQL' || current === 'MQL' ? current : null;
  if (crossedSql || next >= sql) qualification = 'SQL';
  else if (crossedMql || next >= mql) qualification = 'MQL';
  return {
    qualification,
    crossedMql,
    crossedSql,
    crossed: crossedSql ? 'SQL' : crossedMql ? 'MQL' : null,
  };
}

export function scoreTriggerMatches(
  triggerConfig: Record<string, unknown> | null | undefined,
  next: { score?: number; previousScore?: number; crossed?: string | null },
): boolean {
  if (!triggerConfig || Object.keys(triggerConfig).length === 0) return true;
  const min = num(triggerConfig.minScore) ?? num(triggerConfig.gte);
  if (min != null && (next.score ?? 0) < min) return false;
  const want = str(triggerConfig.crossed);
  if (want) {
    const got = (next.crossed ?? '').toUpperCase();
    if (got !== want.toUpperCase()) return false;
  }
  return true;
}

const PIPELINE_ORDER = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'BOOKED',
  'CONFIRMED',
  'VISITED',
  'PURCHASED',
] as const;

export function shouldAdvancePipeline(
  current: string | null | undefined,
  target: string | null | undefined,
): boolean {
  if (!target) return false;
  if (!current || current === 'LOST') return false;
  const from = PIPELINE_ORDER.indexOf(current as (typeof PIPELINE_ORDER)[number]);
  const to = PIPELINE_ORDER.indexOf(target as (typeof PIPELINE_ORDER)[number]);
  if (from < 0 || to < 0) return current !== target;
  return to > from;
}

export function defaultScoringRules(): ScoringRuleProposal[] {
  return [
    {
      key: 'form_submit',
      label: 'Submit form',
      eventType: 'FORM_SUBMITTED',
      points: 20,
      condition: { once: true },
      isActive: true,
      position: 0,
    },
    {
      key: 'chatbot_reply',
      label: 'Reply chatbot',
      eventType: 'CHATBOT_REPLY',
      points: 15,
      condition: { cooldownMinutes: 30 },
      isActive: true,
      position: 1,
    },
    {
      key: 'ask_price',
      label: 'Hỏi giá',
      eventType: 'ASK_PRICE',
      points: 25,
      condition: { cooldownMinutes: 1440 },
      isActive: true,
      position: 2,
    },
    {
      key: 'cta_click',
      label: 'Click CTA',
      eventType: 'CTA_CLICK',
      points: 10,
      condition: { cooldownMinutes: 60 },
      isActive: true,
      position: 3,
    },
    {
      key: 'booking',
      label: 'Booking',
      eventType: 'BOOKING_CREATED',
      points: 30,
      condition: { cooldownMinutes: 1440 },
      isActive: true,
      position: 4,
    },
    {
      key: 'no_reply',
      label: 'Không phản hồi',
      eventType: 'NO_REPLY',
      points: -10,
      condition: { cooldownMinutes: 1440 },
      isActive: true,
      position: 5,
    },
    {
      key: 'cancel_booking',
      label: 'Hủy lịch',
      eventType: 'APPOINTMENT_CANCELLED',
      points: -20,
      condition: { cooldownMinutes: 60 },
      isActive: true,
      position: 6,
    },
  ];
}

export function proposeScoringForFunnel(input: {
  selectedSlug?: string | null;
  prompt?: string | null;
  mode?: string | null;
  completeSpec?: {
    leadScoring?: {
      maxScore?: number;
      hotThreshold?: number;
      mqlThreshold?: number;
      sqlThreshold?: number;
      rules?: Array<{ key?: string; label?: string; points?: number }>;
    } | null;
  } | null;
}): ScoringConfigProposal {
  const rules = defaultScoringRules();
  const blob = `${input.selectedSlug ?? ''} ${input.prompt ?? ''} ${input.mode ?? ''}`.toLowerCase();

  const bump = (eventType: FunnelScoringEventType, delta: number) => {
    const rule = rules.find((r) => r.eventType === eventType);
    if (rule) rule.points = Math.min(40, Math.max(-30, rule.points + delta));
  };

  if (/(book|lịch|calendar|appointment|đặt)/i.test(blob)) {
    bump('BOOKING_CREATED', 5);
    bump('FORM_SUBMITTED', -5);
    bump('APPOINTMENT_CANCELLED', -5);
  }
  if (/(quiz|form|landing|lead.?gen)/i.test(blob)) {
    bump('FORM_SUBMITTED', 5);
    bump('CTA_CLICK', 5);
  }
  if (/(chat|cskh|messenger|zalo|bot)/i.test(blob)) {
    bump('CHATBOT_REPLY', 5);
    bump('ASK_PRICE', 5);
  }

  const spec = input.completeSpec?.leadScoring;
  if (spec?.rules?.length) {
    for (const extra of spec.rules) {
      const mapped = mapCompleteSpecRule(extra.key ?? '');
      if (!mapped) continue;
      const rule = rules.find((r) => r.eventType === mapped);
      if (rule && typeof extra.points === 'number') {
        rule.points = Math.min(40, Math.max(-30, extra.points));
        if (extra.label) rule.label = extra.label.slice(0, 120);
      }
    }
  }

  const maxScore = clampLeadScore(spec?.maxScore ?? 100, 100) || 100;
  let mql = spec?.mqlThreshold ?? spec?.hotThreshold ?? 50;
  let sql = spec?.sqlThreshold ?? Math.min(100, mql + 25);
  mql = Math.min(100, Math.max(10, Math.round(mql)));
  sql = Math.min(100, Math.max(mql + 5, Math.round(sql)));

  return {
    maxScore,
    mqlThreshold: mql,
    sqlThreshold: sql,
    rules,
    rationale:
      'AI đề xuất điểm theo hành vi phễu: form, chatbot, hỏi giá, CTA, booking, không phản hồi, hủy lịch. Chỉnh MQL/SQL rồi lưu.',
  };
}

function mapCompleteSpecRule(key: string): FunnelScoringEventType | null {
  const k = key.toLowerCase();
  if (/(form|submit|phone|has_phone)/.test(k)) return 'FORM_SUBMITTED';
  if (/(chat|reply|inbound)/.test(k)) return 'CHATBOT_REPLY';
  if (/(price|giá|budget)/.test(k)) return 'ASK_PRICE';
  if (/(cta|click)/.test(k)) return 'CTA_CLICK';
  if (/(book|appointment|intent)/.test(k)) return 'BOOKING_CREATED';
  if (/(no.?reply|untouched|silent)/.test(k)) return 'NO_REPLY';
  if (/(cancel|hủy)/.test(k)) return 'APPOINTMENT_CANCELLED';
  return null;
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
