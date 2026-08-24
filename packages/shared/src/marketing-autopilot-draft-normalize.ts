/**
 * Normalize Autopilot plan + draft confirm payloads before adapters/Prisma.
 * Never pass undefined / broken enums into Content/Funnel/Automation/Campaign creates.
 */
import { MARKETING_AUTOPILOT_DRAFT_TYPES } from './marketing-autopilot-planner';
import type { MarketingAutopilotDraftType } from './marketing-autopilot-nba-v2';

export const AUTOPILOT_DRAFT_EDIT_ROUTES = {
  CONTENT_DRAFT: '/teleprompter',
  FUNNEL_DRAFT: '/funnel',
  AUTOMATION_DRAFT: '/automation?tab=flows',
  CAMPAIGN_DRAFT: '/automation?tab=campaigns',
} as const satisfies Record<MarketingAutopilotDraftType, string>;

export function isAutopilotDraftType(raw: unknown): raw is MarketingAutopilotDraftType {
  return (
    typeof raw === 'string' &&
    (MARKETING_AUTOPILOT_DRAFT_TYPES as readonly string[]).includes(raw.trim())
  );
}

/** Drop null/undefined/non-string; keep only known draft enums. */
export function normalizeConfirmDraftTypesFilter(raw: unknown): MarketingAutopilotDraftType[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: MarketingAutopilotDraftType[] = [];
  for (const item of raw) {
    if (isAutopilotDraftType(item)) out.push(item.trim() as MarketingAutopilotDraftType);
  }
  return out.length ? Array.from(new Set(out)) : null;
}

export function resolveAutopilotDraftEditUrl(
  type: MarketingAutopilotDraftType,
  externalEntityId?: string | null,
): string {
  const base = AUTOPILOT_DRAFT_EDIT_ROUTES[type];
  const id = (externalEntityId ?? '').trim();
  if (!id) return base;
  // Funnel Builder opens real FunnelRecommendation via ?draft= (canvas), not blueprintId
  if (type === 'FUNNEL_DRAFT') return `/funnel?draft=${encodeURIComponent(id)}`;
  if (type === 'CONTENT_DRAFT') return `${base}?contentId=${encodeURIComponent(id)}`;
  if (type === 'AUTOMATION_DRAFT') return `${base}&flowId=${encodeURIComponent(id)}`;
  return `${base}&campaignId=${encodeURIComponent(id)}`;
}

/** Stable dependency order for real asset creation. */
export const AUTOPILOT_ASSET_CREATE_ORDER: MarketingAutopilotDraftType[] = [
  'FUNNEL_DRAFT',
  'CONTENT_DRAFT',
  'AUTOMATION_DRAFT',
  'CAMPAIGN_DRAFT',
];

export function sortDraftTypesByDependency(
  types: MarketingAutopilotDraftType[],
): MarketingAutopilotDraftType[] {
  const rank = new Map(AUTOPILOT_ASSET_CREATE_ORDER.map((t, i) => [t, i]));
  return [...types].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const items = value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
  return items.length ? items : [...fallback];
}

function asStages(
  value: unknown,
): Array<{ name: string; objective: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { name: 'Awareness', objective: 'Thu hút đúng đối tượng' },
      { name: 'Consideration', objective: 'Nuôi dưỡng & tư vấn' },
      { name: 'Conversion', objective: 'Chốt booking / mua' },
    ];
  }
  return value
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        name: asString(r?.name, 'Stage'),
        objective: asString(r?.objective, 'Tiến gần mục tiêu'),
      };
    })
    .filter((s) => s.name)
    .slice(0, 12);
}

/**
 * Produce a draft-safe plan object: all required nested fields present, no undefined.
 */
export function normalizeAutopilotPlanForDraft(
  plan: unknown,
  fallbacks?: {
    productName?: string;
    primaryGoal?: string;
    customerProfile?: string;
    targetArea?: string;
    productPrice?: number;
  },
): {
  customersTarget: { targetProfile: string; personas: string[]; targetArea: string };
  customerProfile: string;
  offer: { productName: string; productPrice: number; primaryGoal: string; valueProps: string[] };
  funnel: { stages: Array<{ name: string; objective: string }> };
  content: { channels: string[]; themes: string[]; formats: string[] };
  ads: { strategy: string; budgetSharePercent: number };
  crm: { leadScoring: string; lifecycle: string[]; segmentation: string[] };
  chatbot: { purpose: string; keyFlows: string[] };
  communications: { email: string[]; messenger: string[]; zalo: string[] };
  emailMessengerZalo: { email: string[]; messenger: string[]; zalo: string[] };
  remarketing: { audiences: string[]; cadence: string; messageTheme: string };
  kpi: { kpis: Array<{ name: string; target: number; unit: string }> };
  budget: { monthlyBudget: number; split: Array<{ channel: string; percent: number }> };
  timeline: { phases: Array<{ phase: string; focus: string; durationWeeks: number }> };
  businessDiagnosis?: { bottlenecks: string[]; strengths: string[]; opportunities: string[] };
  icpProfiles?: Array<{ name: string; description: string; priority: number }>;
  channelStrategy?: Array<{ channel: string; role: string; budgetSharePercent: number }>;
  valueProposition?: string;
  timeline306090?: { days30: string[]; days60: string[]; days90: string[] };
} {
  const p = (plan && typeof plan === 'object' ? plan : {}) as Record<string, unknown>;
  const offer = (p.offer && typeof p.offer === 'object' ? p.offer : {}) as Record<string, unknown>;
  const customersTarget = (
    p.customersTarget && typeof p.customersTarget === 'object' ? p.customersTarget : {}
  ) as Record<string, unknown>;
  const content = (p.content && typeof p.content === 'object' ? p.content : {}) as Record<
    string,
    unknown
  >;
  const crm = (p.crm && typeof p.crm === 'object' ? p.crm : {}) as Record<string, unknown>;
  const chatbot = (p.chatbot && typeof p.chatbot === 'object' ? p.chatbot : {}) as Record<
    string,
    unknown
  >;
  const communications = (
    p.communications && typeof p.communications === 'object' ? p.communications : {}
  ) as Record<string, unknown>;
  const remarketing = (
    p.remarketing && typeof p.remarketing === 'object' ? p.remarketing : {}
  ) as Record<string, unknown>;
  const ads = (p.ads && typeof p.ads === 'object' ? p.ads : {}) as Record<string, unknown>;
  const funnel = (p.funnel && typeof p.funnel === 'object' ? p.funnel : {}) as Record<
    string,
    unknown
  >;
  const budget = (p.budget && typeof p.budget === 'object' ? p.budget : {}) as Record<
    string,
    unknown
  >;
  const kpi = (p.kpi && typeof p.kpi === 'object' ? p.kpi : {}) as Record<string, unknown>;
  const timeline = (p.timeline && typeof p.timeline === 'object' ? p.timeline : {}) as Record<
    string,
    unknown
  >;

  const productName = asString(offer.productName, fallbacks?.productName || 'Sản phẩm');
  const primaryGoal = asString(offer.primaryGoal, fallbacks?.primaryGoal || 'Tăng Booking');
  const targetProfile = asString(
    customersTarget.targetProfile ?? p.customerProfile,
    fallbacks?.customerProfile || 'Khách hàng mục tiêu',
  );
  const targetArea = asString(customersTarget.targetArea, fallbacks?.targetArea || 'Toàn quốc');
  const productPrice =
    typeof offer.productPrice === 'number' && Number.isFinite(offer.productPrice)
      ? Math.max(0, offer.productPrice)
      : Math.max(0, Number(fallbacks?.productPrice) || 0);

  const valueProps = asStringArray(offer.valueProps, [
    `Tập trung mục tiêu: ${primaryGoal}`,
    `Sản phẩm: ${productName}`,
  ]);
  const themes = asStringArray(content.themes, [primaryGoal, productName]);
  const formats = asStringArray(content.formats, ['Reel', 'Bài viết', 'Email']);
  const channels = asStringArray(content.channels, ['Facebook', 'Zalo', 'Email']);
  const lifecycle = asStringArray(crm.lifecycle, ['New', 'MQL', 'SQL', 'Booked']);
  const segmentation = asStringArray(crm.segmentation, ['Hot lead', 'Warm lead']);
  const keyFlows = asStringArray(chatbot.keyFlows, [
    'Chào hỏi & xác định nhu cầu',
    'Tư vấn sản phẩm',
    'Chốt lịch / CTA',
  ]);
  const email = asStringArray(communications.email, ['Email nurture 3 bước']);
  const messenger = asStringArray(communications.messenger, ['Kịch bản Messenger tư vấn']);
  const zalo = asStringArray(communications.zalo, ['Chuỗi Zalo follow-up']);

  const comms = { email, messenger, zalo };

  return {
    customersTarget: {
      targetProfile,
      personas: asStringArray(customersTarget.personas, [targetProfile]).slice(0, 4),
      targetArea,
    },
    customerProfile: asString(p.customerProfile, targetProfile),
    offer: {
      productName,
      productPrice,
      primaryGoal,
      valueProps,
    },
    funnel: { stages: asStages(funnel.stages) },
    content: { channels, themes, formats },
    ads: {
      strategy: asString(ads.strategy, 'Giữ draft — chưa scale Ads live'),
      budgetSharePercent:
        typeof ads.budgetSharePercent === 'number' && Number.isFinite(ads.budgetSharePercent)
          ? Math.min(100, Math.max(0, ads.budgetSharePercent))
          : 20,
    },
    crm: {
      leadScoring: asString(crm.leadScoring, 'Score theo tương tác + nguồn'),
      lifecycle,
      segmentation,
    },
    chatbot: {
      purpose: asString(chatbot.purpose, 'Tư vấn & thu lead'),
      keyFlows,
    },
    communications: comms,
    emailMessengerZalo: comms,
    remarketing: {
      audiences: asStringArray(remarketing.audiences, ['Lead chưa booking', 'Khách cũ']),
      cadence: asString(remarketing.cadence, '2-3 lần / tuần'),
      messageTheme: asString(remarketing.messageTheme, primaryGoal),
    },
    kpi: {
      kpis:
        Array.isArray(kpi.kpis) && kpi.kpis.length
          ? (kpi.kpis as Array<Record<string, unknown>>)
              .map((k) => ({
                name: asString(k.name, 'KPI'),
                target: typeof k.target === 'number' ? k.target : 0,
                unit: asString(k.unit, 'count'),
              }))
              .slice(0, 10)
          : [{ name: 'Booking', target: 10, unit: 'count' }],
    },
    budget: {
      monthlyBudget:
        typeof budget.monthlyBudget === 'number' && Number.isFinite(budget.monthlyBudget)
          ? Math.max(0, budget.monthlyBudget)
          : 0,
      split:
        Array.isArray(budget.split) && budget.split.length
          ? (budget.split as Array<Record<string, unknown>>)
              .map((s) => ({
                channel: asString(s.channel, 'Channel'),
                percent: typeof s.percent === 'number' ? s.percent : 0,
              }))
              .slice(0, 8)
          : [{ channel: 'Content + CRM', percent: 100 }],
    },
    timeline: {
      phases:
        Array.isArray(timeline.phases) && timeline.phases.length
          ? (timeline.phases as Array<Record<string, unknown>>)
              .map((ph) => ({
                phase: asString(ph.phase, 'Phase'),
                focus: asString(ph.focus, primaryGoal),
                durationWeeks: typeof ph.durationWeeks === 'number' ? ph.durationWeeks : 2,
              }))
              .slice(0, 6)
          : [{ phase: '30 ngày', focus: primaryGoal, durationWeeks: 4 }],
    },
    businessDiagnosis:
      p.businessDiagnosis && typeof p.businessDiagnosis === 'object'
        ? {
            bottlenecks: asStringArray(
              (p.businessDiagnosis as Record<string, unknown>).bottlenecks,
              [],
            ),
            strengths: asStringArray(
              (p.businessDiagnosis as Record<string, unknown>).strengths,
              [],
            ),
            opportunities: asStringArray(
              (p.businessDiagnosis as Record<string, unknown>).opportunities,
              [],
            ),
          }
        : { bottlenecks: [], strengths: [], opportunities: [] },
    icpProfiles: Array.isArray(p.icpProfiles)
      ? (p.icpProfiles as Array<Record<string, unknown>>)
          .map((row, i) => ({
            name: asString(row.name, `ICP ${i + 1}`),
            description: asString(row.description, targetProfile),
            priority: typeof row.priority === 'number' ? row.priority : i + 1,
          }))
          .slice(0, 3)
      : [{ name: 'Khách mục tiêu', description: targetProfile, priority: 1 }],
    channelStrategy: Array.isArray(p.channelStrategy)
      ? (p.channelStrategy as Array<Record<string, unknown>>)
          .map((row) => ({
            channel: asString(row.channel, 'Channel'),
            role: asString(row.role, 'support'),
            budgetSharePercent:
              typeof row.budgetSharePercent === 'number' ? row.budgetSharePercent : 0,
          }))
          .slice(0, 8)
      : channels.map((channel, i) => ({
          channel,
          role: i === 0 ? 'primary' : 'support',
          budgetSharePercent: Math.round(100 / Math.max(channels.length, 1)),
        })),
    valueProposition: asString(p.valueProposition, valueProps[0] ?? productName),
    timeline306090:
      p.timeline306090 && typeof p.timeline306090 === 'object'
        ? {
            days30: asStringArray((p.timeline306090 as Record<string, unknown>).days30, [
              'Chuẩn bị draft & nurture',
            ]),
            days60: asStringArray((p.timeline306090 as Record<string, unknown>).days60, [
              'Tối ưu funnel',
            ]),
            days90: asStringArray((p.timeline306090 as Record<string, unknown>).days90, [
              'Mở rộng có kiểm soát',
            ]),
          }
        : undefined,
  };
}
