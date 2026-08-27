/**
 * Prompt 15 — AI Funnel Consultant
 * Rule-based patches + schema gate. Never invent KPIs. Never auto-apply.
 */
import { assertFunnelCompleteDraft, createFunnelCanvasNode } from './funnel-canvas';
import type { FunnelCompleteSpec } from './funnel-complete';
import { parseFunnelCompleteSpec } from './funnel-complete';
import { validateFunnelCompleteSpec, type FunnelValidatorResult } from './funnel-validator';

export const FUNNEL_CONSULTANT_INTENTS = [
  'ADD_MINI_GAME',
  'CHANGE_OFFER',
  'NO_DISCOUNT',
  'ADD_MESSENGER',
  'ADD_REMARKETING',
  'OPTIMIZE_FOLLOW_UP',
  'OPTIMIZE_FROM_DATA',
  'CUSTOM',
] as const;

export type FunnelConsultantIntent = (typeof FUNNEL_CONSULTANT_INTENTS)[number];

export const FUNNEL_CONSULTANT_INTENT_LABELS: Record<FunnelConsultantIntent, string> = {
  ADD_MINI_GAME: 'Thêm mini game',
  CHANGE_OFFER: 'Đổi offer',
  NO_DISCOUNT: 'Không giảm giá',
  ADD_MESSENGER: 'Thêm Messenger',
  ADD_REMARKETING: 'Thêm remarketing',
  OPTIMIZE_FOLLOW_UP: 'Tối ưu follow-up',
  OPTIMIZE_FROM_DATA: 'Tối ưu theo dữ liệu',
  CUSTOM: 'Yêu cầu tùy chỉnh',
};

export type FunnelConsultantDiffItem = {
  path: string;
  before: string;
  after: string;
};

export type FunnelConsultantInsight = {
  topic: 'drop-off' | 'cpl' | 'booking' | 'sla' | 'conversion' | 'data';
  message: string;
  suggestedIntent?: FunnelConsultantIntent;
};

export type FunnelConsultantMetrics = {
  hasRealData: boolean;
  scope: 'funnel' | 'none';
  leads: number;
  booking: number;
  purchased: number;
  conversionRate: number | null;
  bookingRate: number | null;
  cpl: number | null;
  spend: number | null;
  slaBreached: number;
  slaRate: number | null;
  avgConversionTimeHours: number | null;
  dropOff: Array<{
    stage: string;
    count: number;
    dropOffFromPrevious: number | null;
  }>;
};

export type FunnelConsultantProposal = {
  applied: false;
  deployable: false;
  budgetChanged: false;
  requiresConfirmation: true;
  source: 'ai' | 'rules';
  intents: FunnelConsultantIntent[];
  rationale: string;
  changes: string[];
  diff: FunnelConsultantDiffItem[];
  proposed: FunnelCompleteSpec;
  validation: FunnelValidatorResult;
  insights: FunnelConsultantInsight[];
  specHash: string;
};

const DISCOUNT_RE =
  /(\d+\s*%|\d+\s*(k|đ|vnd|vnđ)?\s*(off|giảm)|giảm\s*giá|sale\s*off|voucher\s*\d+|flash\s*sale|-%|km\s*\d+)/gi;

export function detectConsultantIntents(prompt: string): FunnelConsultantIntent[] {
  const p = prompt.toLowerCase();
  const found: FunnelConsultantIntent[] = [];
  if (/mini\s*game|minigame|game\s*quay|lucky\s*draw|spin/.test(p)) found.push('ADD_MINI_GAME');
  if (/đổi\s*offer|doi\s*offer|thay\s*offer|đổi\s*ưu\s*đãi|offer\s*mới/.test(p)) {
    found.push('CHANGE_OFFER');
  }
  if (/không\s*giảm\s*giá|khong\s*giam\s*gia|no\s*discount|bỏ\s*giảm\s*giá|không\s*% /.test(p) || /không giảm giá/.test(p)) {
    found.push('NO_DISCOUNT');
  }
  if (/messenger|facebook\s*msg|inbox\s*fb/.test(p)) found.push('ADD_MESSENGER');
  if (/remarket|retarget|tiếp\s*thị\s*lại|tiep\s*thi\s*lai/.test(p)) found.push('ADD_REMARKETING');
  if (/follow[-\s]?up|nhắc\s*lead|nurture|chăm\s*sóc\s*lead/.test(p)) {
    found.push('OPTIMIZE_FOLLOW_UP');
  }
  if (/tối ưu|toi uu|optimize|drop[-\s]?off|cpl|sla/.test(p) && found.length === 0) {
    found.push('OPTIMIZE_FROM_DATA');
  }
  return found.length ? found : ['CUSTOM'];
}

export function hashFunnelSpec(spec: FunnelCompleteSpec): string {
  const s = JSON.stringify(spec);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fc_${(h >>> 0).toString(16)}`;
}

export function cloneFunnelSpec(spec: FunnelCompleteSpec): FunnelCompleteSpec {
  return JSON.parse(JSON.stringify(spec)) as FunnelCompleteSpec;
}

const PATCH_KEYS = [
  'name',
  'summary',
  'strategy',
  'offer',
  'cta',
  'stages',
  'nodes',
  'connections',
  'leadForm',
  'chatbotFlow',
  'followUp',
  'automations',
  'leadScoring',
  'salesHandoff',
  'booking',
  'remarketing',
  'conversionGoal',
  'kpis',
] as const;

export function mergeConsultantPatch(
  current: FunnelCompleteSpec,
  patch: Record<string, unknown>,
): FunnelCompleteSpec {
  const merged: Record<string, unknown> = { ...cloneFunnelSpec(current) };
  for (const key of PATCH_KEYS) {
    if (patch[key] !== undefined) merged[key] = patch[key];
  }
  merged.schemaVersion = 'funnel-complete.v1';
  merged.mode = 'draft';
  merged.templateSlug = current.templateSlug;
  return parseFunnelCompleteSpec(merged);
}

function addNodeIfMissing(
  spec: FunnelCompleteSpec,
  type: FunnelCompleteSpec['nodes'][number]['type'],
  id: string,
  label: string,
  attachFrom?: string,
  attachTo?: string,
): string[] {
  const changes: string[] = [];
  if (spec.nodes.some((n) => n.type === type || n.id === id)) {
    return changes;
  }
  if (spec.nodes.length >= 40) return changes;
  const node = createFunnelCanvasNode({
    type,
    label,
    existingIds: new Set([...spec.nodes.map((n) => n.id), id]),
    position: { x: 240, y: type === 'GAME' ? 160 : 80 },
  });
  node.id = spec.nodes.some((n) => n.id === id) ? node.id : id;
  spec.nodes.push(node);
  changes.push(`Thêm node ${type}: ${label}`);

  const from = attachFrom && spec.nodes.some((n) => n.id === attachFrom) ? attachFrom : undefined;
  const to = attachTo && spec.nodes.some((n) => n.id === attachTo) ? attachTo : undefined;
  if (from && spec.connections.length < 60) {
    spec.connections.push({
      id: `consult_${node.id}_in`,
      from,
      to: node.id,
    });
  }
  if (to && spec.connections.length < 60) {
    spec.connections.push({
      id: `consult_${node.id}_out`,
      from: node.id,
      to,
    });
  }
  return changes;
}

function stripDiscount(text: string, fallback: string): string {
  const cleaned = text
    .replace(DISCOUNT_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .trim();
  if (cleaned.length >= 8) return cleaned.slice(0, 300);
  return fallback;
}

function extractQuotedOrRest(prompt: string, intentPhrase: RegExp): string | null {
  const quoted = prompt.match(/[«"“']([^"'”»]{8,280})[»"”']/);
  if (quoted?.[1]) return quoted[1].trim().slice(0, 300);
  const rest = prompt.replace(intentPhrase, '').replace(/^[:\-–]\s*/, '').trim();
  return rest.length >= 8 ? rest.slice(0, 300) : null;
}

function upsertFollowUp(
  spec: FunnelCompleteSpec,
  item: FunnelCompleteSpec['followUp'][number],
): boolean {
  const exists = spec.followUp.some(
    (f) => f.channel === item.channel && f.trigger === item.trigger,
  );
  if (exists) return false;
  if (spec.followUp.length >= 12) return false;
  spec.followUp.push(item);
  return true;
}

export function applyConsultantIntent(
  input: FunnelCompleteSpec,
  intent: FunnelConsultantIntent,
  prompt = '',
): { spec: FunnelCompleteSpec; changes: string[] } {
  const spec = cloneFunnelSpec(input);
  const changes: string[] = [];
  const landing = spec.nodes.find((n) => n.type === 'LANDING') ?? spec.nodes.find((n) => n.type === 'TRAFFIC');
  const form = spec.nodes.find((n) => n.type === 'FORM');

  switch (intent) {
    case 'ADD_MINI_GAME': {
      changes.push(
        ...addNodeIfMissing(
          spec,
          'GAME',
          'consult_game',
          'Mini game quay thưởng',
          landing?.id,
          form?.id,
        ),
      );
      if (!changes.length) changes.push('Mini game đã có trên canvas');
      break;
    }
    case 'CHANGE_OFFER': {
      const next =
        extractQuotedOrRest(prompt, /đổi\s*offer|doi\s*offer|thay\s*offer|đổi\s*ưu\s*đãi/i) ??
        `${spec.offer.replace(/\s+$/, '')} — kèm buổi tư vấn lộ trình cá nhân hóa`.slice(0, 300);
      if (next !== spec.offer) {
        changes.push(`Offer: "${spec.offer.slice(0, 48)}" → "${next.slice(0, 48)}"`);
        spec.offer = next;
        const offerNode = spec.nodes.find((n) => n.type === 'OFFER');
        if (offerNode) offerNode.label = next.slice(0, 160);
      }
      break;
    }
    case 'NO_DISCOUNT': {
      const fallback = 'Tặng buổi tư vấn chuyên sâu và lộ trình chăm sóc cá nhân hóa';
      const nextOffer = stripDiscount(spec.offer, fallback);
      if (nextOffer !== spec.offer) {
        changes.push('Offer bỏ ngôn ngữ giảm giá/%');
        spec.offer = nextOffer;
      }
      const nextCta = stripDiscount(spec.cta, 'Đặt lịch tư vấn miễn phí');
      if (nextCta !== spec.cta) {
        changes.push('CTA bỏ giảm giá');
        spec.cta = nextCta;
      }
      if (spec.remarketing?.offer) {
        const rm = stripDiscount(spec.remarketing.offer, fallback);
        if (rm !== spec.remarketing.offer) {
          spec.remarketing.offer = rm;
          changes.push('Remarketing offer bỏ giảm giá');
        }
      }
      if (!changes.length) changes.push('Offer hiện không dùng %/giảm giá');
      break;
    }
    case 'ADD_MESSENGER': {
      const added = upsertFollowUp(spec, {
        name: 'Chào lead trên Messenger',
        trigger: 'LEAD_CREATED',
        delayMinutes: 10,
        channel: 'MESSENGER',
        message: `Chào bạn, mình hỗ trợ tư vấn qua Messenger. ${spec.cta}`,
      });
      if (added) changes.push('Thêm follow-up kênh Messenger');
      const hasAuto = spec.automations?.some((a) => a.channel === 'MESSENGER');
      if (!hasAuto && (spec.automations?.length ?? 0) < 20) {
        spec.automations = [
          ...(spec.automations ?? []),
          {
            name: 'Messenger nurture',
            triggerType: 'LEAD_CREATED',
            delayMinutes: 10,
            channel: 'MESSENGER',
            actions: [{ type: 'SEND_MESSAGE', bodyHint: spec.cta.slice(0, 200) }],
            rationale: 'Chăm sóc lead mới trên Messenger',
          },
        ];
        changes.push('Thêm automation Messenger');
      }
      const traffic = spec.nodes.find((n) => n.type === 'TRAFFIC');
      if (traffic && !String(traffic.meta?.channel ?? '').toLowerCase().includes('messenger')) {
        traffic.meta = { ...(traffic.meta ?? {}), channel: 'messenger' };
        changes.push('Gắn kênh Messenger trên node TRAFFIC');
      }
      if (!changes.length) changes.push('Messenger đã có trong follow-up/automation');
      break;
    }
    case 'ADD_REMARKETING': {
      const rm = spec.remarketing ?? {
        audiences: [],
        channels: ['FACEBOOK' as const],
        offer: spec.offer.slice(0, 240),
        frequencyCapDays: 7,
      };
      if (!rm.audiences.some((a) => a.key === 'lead_no_book')) {
        rm.audiences = [
          ...rm.audiences,
          { key: 'lead_no_book', label: 'Lead chưa book', description: 'Remarketing 7 ngày' },
        ].slice(0, 10);
        changes.push('Thêm audience lead chưa book');
      }
      if (!rm.channels.includes('FACEBOOK')) {
        rm.channels = [...rm.channels, 'FACEBOOK' as const].slice(0, 6);
        changes.push('Thêm kênh remarketing Facebook');
      }
      spec.remarketing = rm;
      const goal = spec.nodes.find((n) => n.type === 'GOAL') ?? form;
      changes.push(
        ...addNodeIfMissing(
          spec,
          'RETARGET',
          'consult_retarget',
          'Remarketing ads',
          goal?.id,
        ),
      );
      if (!changes.length) changes.push('Remarketing đã cấu hình');
      break;
    }
    case 'OPTIMIZE_FOLLOW_UP': {
      const seeds: FunnelCompleteSpec['followUp'] = [
        {
          name: 'Xác nhận lead mới',
          trigger: 'LEAD_CREATED',
          delayMinutes: 5,
          channel: 'ZALO',
          message: `Cảm ơn bạn đã đăng ký. ${spec.offer}`.slice(0, 500),
        },
        {
          name: 'Nhắc lead chưa chạm',
          trigger: 'LEAD_UNTOUCHED',
          delayMinutes: 1440,
          channel: 'SMS',
          message: 'Bạn còn quan tâm ưu đãi? Inbox để được tư vấn trong ngày.',
        },
        {
          name: 'Follow-up no-show',
          trigger: 'NO_SHOW',
          delayMinutes: 60,
          channel: 'TASK',
          message: 'Gọi lại khách no-show, book lịch mới trong 24h',
        },
      ];
      for (const s of seeds) {
        if (upsertFollowUp(spec, s)) changes.push(`Thêm follow-up ${s.name}`);
      }
      if (!changes.length) changes.push('Follow-up đã đủ 3 nhịp chính');
      break;
    }
    case 'OPTIMIZE_FROM_DATA':
    case 'CUSTOM': {
      if (intent === 'CUSTOM' && prompt.trim().length >= 8) {
        const maybeOffer = extractQuotedOrRest(prompt, /^/);
        if (maybeOffer && /offer|ưu đãi|uu dai/.test(prompt.toLowerCase())) {
          spec.offer = maybeOffer;
          changes.push('Cập nhật offer theo yêu cầu');
        }
      }
      break;
    }
  }

  spec.mode = 'draft';
  spec.schemaVersion = 'funnel-complete.v1';
  return { spec, changes };
}

export function applyConsultantIntents(
  spec: FunnelCompleteSpec,
  intents: FunnelConsultantIntent[],
  prompt = '',
): { spec: FunnelCompleteSpec; changes: string[] } {
  let current = spec;
  const changes: string[] = [];
  const unique = [...new Set(intents)];
  for (const intent of unique) {
    if (intent === 'OPTIMIZE_FROM_DATA') continue;
    const next = applyConsultantIntent(current, intent, prompt);
    current = next.spec;
    changes.push(...next.changes);
  }
  return { spec: current, changes };
}

export function diffFunnelSpecs(
  before: FunnelCompleteSpec,
  after: FunnelCompleteSpec,
): FunnelConsultantDiffItem[] {
  const items: FunnelConsultantDiffItem[] = [];
  const scalar = ['name', 'offer', 'cta', 'strategy', 'summary'] as const;
  for (const k of scalar) {
    if (before[k] !== after[k]) {
      items.push({
        path: k,
        before: String(before[k] ?? '').slice(0, 160),
        after: String(after[k] ?? '').slice(0, 160),
      });
    }
  }
  if (before.nodes.length !== after.nodes.length) {
    items.push({
      path: 'nodes',
      before: `${before.nodes.length} nodes`,
      after: `${after.nodes.length} nodes`,
    });
  }
  const beforeTypes = before.nodes.map((n) => n.type).join(',');
  const afterTypes = after.nodes.map((n) => n.type).join(',');
  if (beforeTypes !== afterTypes && before.nodes.length === after.nodes.length) {
    items.push({ path: 'nodes.types', before: beforeTypes, after: afterTypes });
  }
  if (before.followUp.length !== after.followUp.length) {
    items.push({
      path: 'followUp',
      before: `${before.followUp.length} rules`,
      after: `${after.followUp.length} rules`,
    });
  }
  const beforeCh = before.followUp.map((f) => f.channel).join(',');
  const afterCh = after.followUp.map((f) => f.channel).join(',');
  if (beforeCh !== afterCh) {
    items.push({ path: 'followUp.channels', before: beforeCh, after: afterCh });
  }
  if ((before.automations?.length ?? 0) !== (after.automations?.length ?? 0)) {
    items.push({
      path: 'automations',
      before: `${before.automations?.length ?? 0}`,
      after: `${after.automations?.length ?? 0}`,
    });
  }
  const rmBefore = (before.remarketing?.audiences ?? []).map((a) => a.key).join(',');
  const rmAfter = (after.remarketing?.audiences ?? []).map((a) => a.key).join(',');
  if (rmBefore !== rmAfter) {
    items.push({ path: 'remarketing.audiences', before: rmBefore || '—', after: rmAfter || '—' });
  }
  return items.slice(0, 20);
}

export function buildConsultantInsights(
  metrics: FunnelConsultantMetrics | null,
): FunnelConsultantInsight[] {
  if (!metrics?.hasRealData) {
    return [
      {
        topic: 'data',
        message:
          'Funnel chưa có dữ liệu thật — chỉ đề xuất chỉnh draft theo yêu cầu. Không bịa drop-off/CPL/conversion.',
      },
    ];
  }

  const insights: FunnelConsultantInsight[] = [];
  const worst = [...metrics.dropOff]
    .filter((d) => d.dropOffFromPrevious != null && d.dropOffFromPrevious > 0)
    .sort((a, b) => (b.dropOffFromPrevious ?? 0) - (a.dropOffFromPrevious ?? 0))[0];
  if (worst) {
    insights.push({
      topic: 'drop-off',
      message: `Drop-off lớn nhất tại ${worst.stage}: ${worst.dropOffFromPrevious}% (${worst.count} còn lại).`,
      suggestedIntent:
        worst.stage === 'MQL' || worst.stage === 'LEAD'
          ? 'ADD_MINI_GAME'
          : worst.stage === 'BOOKING'
            ? 'ADD_MESSENGER'
            : 'ADD_REMARKETING',
    });
  }
  if (metrics.cpl != null) {
    insights.push({
      topic: 'cpl',
      message: `CPL quan sát được (org 30 ngày): ${Math.round(metrics.cpl)}. Không đề xuất tăng ngân sách ads.`,
      suggestedIntent: 'CHANGE_OFFER',
    });
  }
  if (metrics.bookingRate != null) {
    insights.push({
      topic: 'booking',
      message: `Lead → Booking: ${metrics.bookingRate}%.`,
      suggestedIntent: metrics.bookingRate < 25 ? 'OPTIMIZE_FOLLOW_UP' : 'ADD_MESSENGER',
    });
  }
  if (metrics.slaRate != null) {
    insights.push({
      topic: 'sla',
      message: `SLA breach: ${metrics.slaBreached}/${metrics.leads} lead (${metrics.slaRate}%).`,
      suggestedIntent: 'OPTIMIZE_FOLLOW_UP',
    });
  }
  if (metrics.conversionRate != null) {
    insights.push({
      topic: 'conversion',
      message: `Lead → Purchase: ${metrics.conversionRate}%.`,
      suggestedIntent: metrics.conversionRate < 8 ? 'ADD_REMARKETING' : undefined,
    });
  }
  return insights;
}

export function intentsFromInsights(insights: FunnelConsultantInsight[]): FunnelConsultantIntent[] {
  const intents = insights
    .map((i) => i.suggestedIntent)
    .filter((x): x is FunnelConsultantIntent => Boolean(x));
  return [...new Set(intents)].slice(0, 3);
}

export function validateConsultantDraft(raw: unknown): {
  spec: FunnelCompleteSpec;
  validation: FunnelValidatorResult;
} {
  const spec = assertFunnelCompleteDraft(raw);
  const validation = validateFunnelCompleteSpec(spec);
  return { spec, validation };
}

export function buildConsultantProposal(input: {
  current: FunnelCompleteSpec;
  intents: FunnelConsultantIntent[];
  prompt?: string;
  source: 'ai' | 'rules';
  rationale?: string;
  metrics?: FunnelConsultantMetrics | null;
  patched?: FunnelCompleteSpec;
}): FunnelConsultantProposal {
  const insights = buildConsultantInsights(input.metrics ?? null);
  let working = input.patched ?? input.current;
  let changes: string[] = [];

  const applyList =
    input.intents.includes('OPTIMIZE_FROM_DATA') && input.intents.length === 1
      ? intentsFromInsights(insights)
      : input.intents;

  if (!input.patched) {
    const applied = applyConsultantIntents(input.current, applyList, input.prompt ?? '');
    working = applied.spec;
    changes = applied.changes;
  } else {
    changes = diffFunnelSpecs(input.current, working).map(
      (d) => `${d.path}: ${d.before} → ${d.after}`,
    );
  }

  const { spec, validation } = validateConsultantDraft(working);
  const diff = diffFunnelSpecs(input.current, spec);
  const rationale =
    input.rationale?.trim() ||
    [
      applyList.length
        ? `Đề xuất: ${applyList.map((i) => FUNNEL_CONSULTANT_INTENT_LABELS[i]).join(', ')}.`
        : 'Không có thay đổi cấu hình.',
      'Chỉ sửa Funnel draft — chưa apply pipeline/ads/ngân sách.',
      insights[0]?.message,
    ]
      .filter(Boolean)
      .join(' ');

  return {
    applied: false,
    deployable: false,
    budgetChanged: false,
    requiresConfirmation: true,
    source: input.source,
    intents: applyList.length ? applyList : input.intents,
    rationale,
    changes: changes.length ? changes : diff.map((d) => `${d.path} thay đổi`),
    diff,
    proposed: spec,
    validation,
    insights,
    specHash: hashFunnelSpec(spec),
  };
}

export function compactSpecForAi(spec: FunnelCompleteSpec) {
  return {
    name: spec.name,
    offer: spec.offer,
    cta: spec.cta,
    strategy: spec.strategy.slice(0, 400),
    nodes: spec.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
    connections: spec.connections.map((c) => ({ from: c.from, to: c.to })),
    followUp: spec.followUp.map((f) => ({
      name: f.name,
      trigger: f.trigger,
      channel: f.channel,
      delayMinutes: f.delayMinutes,
    })),
    automations: (spec.automations ?? []).map((a) => ({
      name: a.name,
      triggerType: a.triggerType,
      channel: a.channel,
    })),
    remarketing: spec.remarketing,
    conversionGoal: spec.conversionGoal,
    booking: spec.booking,
    salesHandoff: spec.salesHandoff,
  };
}
