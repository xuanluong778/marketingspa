/**
 * Google Ads AI Campaign Builder — schemas, validation, deployment plan.
 * LLM only produces StructuredDraft. Mutate/publish is a separate executor.
 */

import { z } from 'zod';
import { normalizeGoogleCustomerId } from './google-ads-saas';

export const GOOGLE_ADS_CAMPAIGN_DRAFT_STATUSES = [
  'DRAFT',
  'PREVIEWED',
  'PENDING_APPROVAL',
  'APPROVED',
  'DEPLOYING',
  'DEPLOYED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
] as const;

export const GOOGLE_ADS_DEPLOY_STATUSES = [
  'PENDING',
  'DEPLOYING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
] as const;

export const googleAdsCampaignBriefSchema = z.object({
  product: z.string().trim().min(2).max(200),
  landingPage: z.string().trim().min(8).max(2000),
  objective: z.string().trim().min(2).max(200),
  location: z.string().trim().min(2).max(200),
  audience: z.string().trim().min(2).max(500),
  dailyBudget: z.number().finite().positive().optional(),
  monthlyBudget: z.number().finite().positive().optional(),
  currency: z.string().trim().min(3).max(8).optional(),
});

export type GoogleAdsCampaignBrief = z.infer<typeof googleAdsCampaignBriefSchema>;

const headlineSchema = z.string().trim().min(1).max(30);
const descriptionSchema = z.string().trim().min(1).max(90);

export const googleAdsStructuredDraftSchema = z.object({
  campaignType: z.enum(['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX']).default('SEARCH'),
  objective: z.string().trim().min(1).max(200),
  campaignName: z.string().trim().min(3).max(120),
  budget: z.object({
    dailyAmount: z.number().finite().positive(),
    currency: z.string().trim().min(3).max(8).default('VND'),
  }),
  locations: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  languages: z.array(z.string().trim().min(2).max(20)).min(1).max(10),
  biddingStrategy: z
    .enum(['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'MANUAL_CPC', 'TARGET_CPA'])
    .default('MAXIMIZE_CLICKS'),
  adGroups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
      }),
    )
    .min(1)
    .max(8),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(80),
  negativeKeywords: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  headlines: z.array(headlineSchema).min(3).max(15),
  descriptions: z.array(descriptionSchema).min(2).max(4),
  finalUrl: z.string().trim().url().max(2000),
});

export type GoogleAdsStructuredDraft = z.infer<typeof googleAdsStructuredDraftSchema>;

export type GoogleAdsBudgetValidation = {
  ok: boolean;
  dailyAmount: number;
  monthlyEstimate: number;
  currency: string;
  errors: string[];
};

export type GoogleAdsPreflightResult = {
  ok: boolean;
  checks: Array<{ id: string; ok: boolean; message: string }>;
};

export type CreatedGoogleAdsResources = {
  budgetResourceName?: string;
  campaignResourceName?: string;
  criterionResourceNames?: string[];
  adGroupResourceNames?: string[];
  keywordResourceNames?: string[];
  negativeKeywordResourceNames?: string[];
  adResourceNames?: string[];
};

export type GoogleAdsDeployStep =
  | 'budget'
  | 'campaign'
  | 'criteria'
  | 'adGroups'
  | 'keywords'
  | 'negativeKeywords'
  | 'ads';

export const GOOGLE_ADS_DEPLOY_STEPS: GoogleAdsDeployStep[] = [
  'budget',
  'campaign',
  'criteria',
  'adGroups',
  'keywords',
  'negativeKeywords',
  'ads',
];

const MONTH_DAYS = 30.4;
const MIN_DAILY_BUDGET = 1;

const GEO_BY_NAME: Record<string, string> = {
  vietnam: '2704',
  'việt nam': '2704',
  vn: '2704',
  'ho chi minh': '1028581',
  'hồ chí minh': '1028581',
  saigon: '1028581',
  'sài gòn': '1028581',
  hanoi: '1028584',
  'hà nội': '1028584',
  danang: '1028582',
  'đà nẵng': '1028582',
};

const LANGUAGE_BY_CODE: Record<string, string> = {
  vi: '1040',
  vietnamese: '1040',
  'tiếng việt': '1040',
  en: '1000',
  english: '1000',
  'tiếng anh': '1000',
};

export function clipAdText(value: string, max: number): string {
  const t = value.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim();
}

export function parsePublicHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1'
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function resolveDailyBudget(brief: GoogleAdsCampaignBrief): GoogleAdsBudgetValidation {
  const errors: string[] = [];
  const currency = (brief.currency ?? 'VND').toUpperCase();
  let daily = brief.dailyBudget;
  if (daily == null && brief.monthlyBudget != null) {
    daily = brief.monthlyBudget / MONTH_DAYS;
  }
  if (daily == null || !Number.isFinite(daily) || daily <= 0) {
    errors.push('Cần ngân sách ngày hoặc tháng lớn hơn 0');
    daily = 0;
  } else if (daily < MIN_DAILY_BUDGET) {
    errors.push(`Ngân sách ngày tối thiểu ${MIN_DAILY_BUDGET} ${currency}`);
  }
  const monthlyEstimate = daily > 0 ? Math.round(daily * MONTH_DAYS * 100) / 100 : 0;
  if (brief.monthlyBudget != null && daily > 0) {
    const implied = brief.monthlyBudget / MONTH_DAYS;
    if (Math.abs(implied - daily) / daily > 0.35) {
      errors.push('Ngân sách ngày và tháng lệch nhau quá nhiều — kiểm tra lại brief');
    }
  }
  return {
    ok: errors.length === 0,
    dailyAmount: Math.round(daily * 100) / 100,
    monthlyEstimate,
    currency,
    errors,
  };
}

export function validateCampaignBudgetLimit(
  dailyAmount: number,
  orgDailyLimit?: number | null,
): string | null {
  if (orgDailyLimit != null && orgDailyLimit > 0 && dailyAmount > orgDailyLimit) {
    return `Ngân sách ngày ${dailyAmount} vượt giới hạn tổ chức ${orgDailyLimit}`;
  }
  return null;
}

export function geoTargetConstantId(location: string): string {
  const key = location.trim().toLowerCase();
  const exact = GEO_BY_NAME[key];
  if (exact) return exact;
  for (const [name, id] of Object.entries(GEO_BY_NAME)) {
    if (key.includes(name)) return id;
  }
  return GEO_BY_NAME.vietnam ?? '2704';
}

export function languageConstantId(language: string): string {
  const key = language.trim().toLowerCase();
  return LANGUAGE_BY_CODE[key] ?? LANGUAGE_BY_CODE.vi ?? '1040';
}

export function amountToMicros(amount: number): string {
  return String(Math.round(amount * 1_000_000));
}

export function campaignBuilderIdempotencyKey(input: {
  organizationId: string;
  customerId: string;
  brief: GoogleAdsCampaignBrief;
}): string {
  const cid = normalizeGoogleCustomerId(input.customerId);
  const raw = [
    input.organizationId,
    cid,
    input.brief.product.trim().toLowerCase(),
    input.brief.landingPage.trim().toLowerCase(),
    input.brief.objective.trim().toLowerCase(),
    input.brief.location.trim().toLowerCase(),
    String(input.brief.dailyBudget ?? ''),
    String(input.brief.monthlyBudget ?? ''),
  ].join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return `gads-campaign:${input.organizationId}:${cid}:${h.toString(16)}`;
}

export function deploymentIdempotencyKey(draftId: string): string {
  return `gads-deploy:${draftId}`;
}

export function buildTemplateStructuredDraft(
  brief: GoogleAdsCampaignBrief,
  budget: GoogleAdsBudgetValidation,
): GoogleAdsStructuredDraft {
  const product = brief.product.trim();
  const loc = brief.location.trim();
  const headlines = [
    clipAdText(`${product} chính hãng`, 30),
    clipAdText(`Đặt lịch ${product}`, 30),
    clipAdText(`Ưu đãi ${loc}`, 30),
    clipAdText('Tư vấn miễn phí hôm nay', 30),
    clipAdText('Cam kết chất lượng', 30),
  ].filter((h, i, arr) => h && arr.indexOf(h) === i);
  while (headlines.length < 3) headlines.push(clipAdText(product || 'Dịch vụ', 30));

  const descriptions = [
    clipAdText(
      `${product} cho ${brief.audience}. Xem chi tiết và đặt lịch trên website.`,
      90,
    ),
    clipAdText(`Phục vụ khu vực ${loc}. Mục tiêu: ${brief.objective}.`, 90),
  ];

  const seedKeywords = [
    product,
    `${product} ${loc}`,
    `đặt lịch ${product}`,
    `${product} giá tốt`,
    `${product} uy tín`,
  ].map((k) => clipAdText(k, 80));

  const url = parsePublicHttpUrl(brief.landingPage);
  const finalUrl = url?.toString() ?? brief.landingPage;

  return googleAdsStructuredDraftSchema.parse({
    campaignType: 'SEARCH',
    objective: brief.objective,
    campaignName: clipAdText(`${product} — Search ${loc}`, 120),
    budget: { dailyAmount: budget.dailyAmount, currency: budget.currency },
    locations: [loc],
    languages: ['vi'],
    biddingStrategy: /lead|bán|doanh|conversion|chuyển đổi/i.test(brief.objective)
      ? 'MAXIMIZE_CONVERSIONS'
      : 'MAXIMIZE_CLICKS',
    adGroups: [{ name: clipAdText(product, 120), keywords: seedKeywords }],
    keywords: seedKeywords,
    negativeKeywords: ['free', 'miễn phí 100%', 'crack', 'tải lậu'],
    headlines,
    descriptions,
    finalUrl,
  });
}

export function mergeStructuredDraft(
  brief: GoogleAdsCampaignBrief,
  budget: GoogleAdsBudgetValidation,
  ai: Partial<GoogleAdsStructuredDraft> | null | undefined,
): GoogleAdsStructuredDraft {
  const fallback = buildTemplateStructuredDraft(brief, budget);
  if (!ai) return fallback;
  const headlines = (ai.headlines?.length ? ai.headlines : fallback.headlines).map((h) =>
    clipAdText(h, 30),
  );
  const descriptions = (ai.descriptions?.length ? ai.descriptions : fallback.descriptions).map(
    (d) => clipAdText(d, 90),
  );
  const keywords = (ai.keywords?.length ? ai.keywords : fallback.keywords).map((k) =>
    clipAdText(k, 80),
  );
  const adGroups =
    ai.adGroups?.length && ai.adGroups.every((g) => g.keywords?.length)
      ? ai.adGroups.map((g) => ({
          name: clipAdText(g.name, 120),
          keywords: g.keywords.map((k) => clipAdText(k, 80)),
        }))
      : fallback.adGroups;
  const url = parsePublicHttpUrl(ai.finalUrl ?? brief.landingPage);
  return googleAdsStructuredDraftSchema.parse({
    campaignType: ai.campaignType ?? fallback.campaignType,
    objective: ai.objective || fallback.objective,
    campaignName: clipAdText(ai.campaignName || fallback.campaignName, 120),
    budget: {
      dailyAmount: ai.budget?.dailyAmount || fallback.budget.dailyAmount,
      currency: ai.budget?.currency || fallback.budget.currency,
    },
    locations: ai.locations?.length ? ai.locations : fallback.locations,
    languages: ai.languages?.length ? ai.languages : fallback.languages,
    biddingStrategy: ai.biddingStrategy ?? fallback.biddingStrategy,
    adGroups,
    keywords,
    negativeKeywords: ai.negativeKeywords ?? fallback.negativeKeywords,
    headlines: headlines.slice(0, 15),
    descriptions: descriptions.slice(0, 4),
    finalUrl: url?.toString() ?? fallback.finalUrl,
  });
}

export function validateStructuredDraftForPublish(
  draft: GoogleAdsStructuredDraft,
  brief: GoogleAdsCampaignBrief,
  orgDailyLimit?: number | null,
): GoogleAdsPreflightResult {
  const checks: GoogleAdsPreflightResult['checks'] = [];
  const url = parsePublicHttpUrl(draft.finalUrl) ?? parsePublicHttpUrl(brief.landingPage);
  checks.push({
    id: 'url',
    ok: Boolean(url),
    message: url
      ? `Landing page hợp lệ: ${url.origin}`
      : 'Landing page phải là URL http(s) công khai (không localhost)',
  });
  const budget = resolveDailyBudget({
    ...brief,
    dailyBudget: draft.budget.dailyAmount,
    currency: draft.budget.currency,
  });
  const limitError = validateCampaignBudgetLimit(draft.budget.dailyAmount, orgDailyLimit);
  checks.push({
    id: 'budget',
    ok: budget.ok && !limitError,
    message: limitError ?? (budget.ok ? `Ngày ${budget.dailyAmount} ${budget.currency} · tháng ~${budget.monthlyEstimate}` : budget.errors.join('; ')),
  });
  checks.push({
    id: 'rsa',
    ok: draft.headlines.length >= 3 && draft.descriptions.length >= 2,
    message:
      draft.headlines.length >= 3 && draft.descriptions.length >= 2
        ? `${draft.headlines.length} tiêu đề · ${draft.descriptions.length} mô tả`
        : 'Responsive Search Ad cần ≥3 headlines và ≥2 descriptions',
  });
  checks.push({
    id: 'keywords',
    ok: draft.keywords.length >= 1 && draft.adGroups.length >= 1,
    message: `${draft.adGroups.length} nhóm · ${draft.keywords.length} từ khóa`,
  });
  return { ok: checks.every((c) => c.ok), checks };
}

export type GoogleAdsMutatePort = {
  createBudget(input: {
    name: string;
    amountMicros: string;
  }): Promise<string>;
  createCampaign(input: {
    name: string;
    budgetResourceName: string;
    channelType: 'SEARCH' | 'DISPLAY' | 'PERFORMANCE_MAX';
    biddingStrategy: GoogleAdsStructuredDraft['biddingStrategy'];
    status: 'ENABLED' | 'PAUSED';
  }): Promise<string>;
  createCampaignCriteria(input: {
    campaignResourceName: string;
    geoIds: string[];
    languageIds: string[];
  }): Promise<string[]>;
  createAdGroup(input: { campaignResourceName: string; name: string }): Promise<string>;
  createKeywords(input: {
    adGroupResourceName: string;
    keywords: string[];
    negative?: boolean;
  }): Promise<string[]>;
  createResponsiveSearchAd(input: {
    adGroupResourceName: string;
    headlines: string[];
    descriptions: string[];
    finalUrl: string;
  }): Promise<string>;
};

export function createDryRunMutatePort(customerId: string): GoogleAdsMutatePort {
  const cid = normalizeGoogleCustomerId(customerId) || '0';
  let n = 0;
  const next = (kind: string) => `customers/${cid}/${kind}/dry${++n}`;
  return {
    async createBudget() {
      return next('campaignBudgets');
    },
    async createCampaign() {
      return next('campaigns');
    },
    async createCampaignCriteria(input) {
      return [...input.geoIds, ...input.languageIds].map(() => next('campaignCriteria'));
    },
    async createAdGroup() {
      return next('adGroups');
    },
    async createKeywords(input) {
      return input.keywords.map(() => next('adGroupCriteria'));
    },
    async createResponsiveSearchAd() {
      return next('adGroupAds');
    },
  };
}

export function nextMissingDeployStep(resources: CreatedGoogleAdsResources): GoogleAdsDeployStep | null {
  if (!resources.budgetResourceName) return 'budget';
  if (!resources.campaignResourceName) return 'campaign';
  if (!resources.criterionResourceNames?.length) return 'criteria';
  if (!resources.adGroupResourceNames?.length) return 'adGroups';
  if (!resources.keywordResourceNames?.length) return 'keywords';
  if (!resources.negativeKeywordResourceNames) return 'negativeKeywords';
  if (!resources.adResourceNames?.length) return 'ads';
  return null;
}

export async function executeGoogleAdsCampaignPlan(input: {
  draft: GoogleAdsStructuredDraft;
  resources: CreatedGoogleAdsResources;
  mutate: GoogleAdsMutatePort;
  onProgress?: (resources: CreatedGoogleAdsResources, step: GoogleAdsDeployStep) => Promise<void> | void;
}): Promise<{
  resources: CreatedGoogleAdsResources;
  completed: boolean;
  failedStep?: GoogleAdsDeployStep;
  error?: string;
}> {
  const resources: CreatedGoogleAdsResources = { ...input.resources };
  const d = input.draft;

  const run = async (step: GoogleAdsDeployStep, fn: () => Promise<void>) => {
    try {
      await fn();
      await input.onProgress?.(resources, step);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { resources, completed: false, failedStep: step, error };
    }
    return null;
  };

  if (!resources.budgetResourceName) {
    const fail = await run('budget', async () => {
      resources.budgetResourceName = await input.mutate.createBudget({
        name: `Budget ${d.campaignName}`.slice(0, 120),
        amountMicros: amountToMicros(d.budget.dailyAmount),
      });
    });
    if (fail) return fail;
  }

  if (!resources.campaignResourceName) {
    const fail = await run('campaign', async () => {
      resources.campaignResourceName = await input.mutate.createCampaign({
        name: d.campaignName,
        budgetResourceName: resources.budgetResourceName!,
        channelType: d.campaignType,
        biddingStrategy: d.biddingStrategy,
        status: 'ENABLED',
      });
    });
    if (fail) return fail;
  }

  if (!resources.criterionResourceNames?.length) {
    const fail = await run('criteria', async () => {
      resources.criterionResourceNames = await input.mutate.createCampaignCriteria({
        campaignResourceName: resources.campaignResourceName!,
        geoIds: d.locations.map(geoTargetConstantId),
        languageIds: d.languages.map(languageConstantId),
      });
    });
    if (fail) return fail;
  }

  if (!resources.adGroupResourceNames?.length) {
    const fail = await run('adGroups', async () => {
      const names: string[] = [];
      for (const g of d.adGroups) {
        names.push(
          await input.mutate.createAdGroup({
            campaignResourceName: resources.campaignResourceName!,
            name: g.name,
          }),
        );
      }
      resources.adGroupResourceNames = names;
    });
    if (fail) return fail;
  }

  if (!resources.keywordResourceNames?.length) {
    const fail = await run('keywords', async () => {
      const out: string[] = [];
      for (let i = 0; i < d.adGroups.length; i += 1) {
        const ag = resources.adGroupResourceNames![i];
        const kws = d.adGroups[i]?.keywords?.length ? d.adGroups[i]!.keywords : d.keywords;
        if (!ag) continue;
        out.push(
          ...(await input.mutate.createKeywords({
            adGroupResourceName: ag,
            keywords: kws,
          })),
        );
      }
      resources.keywordResourceNames = out;
    });
    if (fail) return fail;
  }

  if (!resources.negativeKeywordResourceNames) {
    const fail = await run('negativeKeywords', async () => {
      if (!d.negativeKeywords.length) {
        resources.negativeKeywordResourceNames = [];
        return;
      }
      const first = resources.adGroupResourceNames![0];
      resources.negativeKeywordResourceNames = first
        ? await input.mutate.createKeywords({
            adGroupResourceName: first,
            keywords: d.negativeKeywords,
            negative: true,
          })
        : [];
    });
    if (fail) return fail;
  }

  if (!resources.adResourceNames?.length) {
    const fail = await run('ads', async () => {
      const out: string[] = [];
      for (const ag of resources.adGroupResourceNames ?? []) {
        out.push(
          await input.mutate.createResponsiveSearchAd({
            adGroupResourceName: ag,
            headlines: d.headlines,
            descriptions: d.descriptions,
            finalUrl: d.finalUrl,
          }),
        );
      }
      resources.adResourceNames = out;
    });
    if (fail) return fail;
  }

  return { resources, completed: nextMissingDeployStep(resources) === null };
}

/** Guard used by tests — builder/LLM modules must not call mutate endpoints. */
export const GOOGLE_ADS_MUTATE_PATH_MARKERS = [
  'campaignBudgets:mutate',
  'campaigns:mutate',
  'adGroups:mutate',
  'adGroupAds:mutate',
  'adGroupCriteria:mutate',
];
