import type {
  AdCampaignRow,
  AdCampaignType,
  AdBusinessInput,
  AdPerformanceFormState,
} from '@/types/ad-performance';

export const AD_CAMPAIGN_TYPE_OPTIONS: { value: AdCampaignType; label: string }[] = [
  { value: 'ENGAGEMENT', label: 'Quảng cáo tương tác' },
  { value: 'MESSAGE_LEAD', label: 'Quảng cáo tin nhắn / lead' },
  { value: 'SALES', label: 'Quảng cáo bán hàng' },
  { value: 'REMARKETING', label: 'Remarketing' },
  { value: 'OTHER', label: 'Khác' },
];

export function createCampaignRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyCampaignRow(): AdCampaignRow {
  return {
    id: createCampaignRowId(),
    name: '',
    campaignType: 'ENGAGEMENT',
    adBudget: 0,
    cpm: 0,
    resultRate: 0,
    frequency: 1,
  };
}

const defaultBusiness: AdBusinessInput = {
  averageOrderValue: 0,
  grossProfitRate: 0,
  manualOrderCount: 0,
  useManualOrderCount: false,
  manualTotalAdSpend: 0,
  useManualTotalAdSpend: false,
  otherCost: 0,
  leadCloseRate: 0,
};

export const defaultAdPerformanceFormState: AdPerformanceFormState = {
  campaigns: [createEmptyCampaignRow()],
  business: { ...defaultBusiness },
};

export const sampleAdPerformanceFormState: AdPerformanceFormState = {
  campaigns: [
    {
      id: createCampaignRowId(),
      name: 'Quảng cáo tương tác',
      campaignType: 'ENGAGEMENT',
      adBudget: 150_000_000,
      cpm: 20_000,
      resultRate: 30,
      frequency: 1.5,
    },
    {
      id: createCampaignRowId(),
      name: 'Quảng cáo tin nhắn / lead',
      campaignType: 'MESSAGE_LEAD',
      adBudget: 135_000_000,
      cpm: 30_000,
      resultRate: 25,
      frequency: 3,
    },
    {
      id: createCampaignRowId(),
      name: 'Quảng cáo bán hàng',
      campaignType: 'SALES',
      adBudget: 42_600_000,
      cpm: 80_000,
      resultRate: 0.3,
      frequency: 1.42,
    },
  ],
  business: {
    averageOrderValue: 2_000_000,
    grossProfitRate: 50,
    manualOrderCount: 0,
    useManualOrderCount: false,
    manualTotalAdSpend: 0,
    useManualTotalAdSpend: false,
    otherCost: 0,
    leadCloseRate: 0,
  },
};

function normalizeCampaign(row: Partial<AdCampaignRow>): AdCampaignRow {
  return {
    id: row.id ?? createCampaignRowId(),
    name: row.name ?? '',
    campaignType: row.campaignType ?? 'ENGAGEMENT',
    adBudget: Number.isFinite(row.adBudget) ? Math.max(0, row.adBudget!) : 0,
    cpm: Number.isFinite(row.cpm) ? Math.max(0, row.cpm!) : 0,
    resultRate: Number.isFinite(row.resultRate) ? Math.max(0, row.resultRate!) : 0,
    frequency: Number.isFinite(row.frequency) && row.frequency! > 0 ? row.frequency! : 1,
  };
}

/** Giữ tương thích draft cũ, bổ sung field mới */
export function normalizeAdPerformanceFormState(
  raw: Partial<AdPerformanceFormState> | null | undefined,
): AdPerformanceFormState {
  if (!raw) return defaultAdPerformanceFormState;

  const business: Partial<AdBusinessInput> = raw.business ?? {};
  return {
    campaigns:
      raw.campaigns && raw.campaigns.length > 0
        ? raw.campaigns.map(normalizeCampaign)
        : [createEmptyCampaignRow()],
    business: {
      averageOrderValue: business.averageOrderValue ?? 0,
      grossProfitRate: business.grossProfitRate ?? 0,
      manualOrderCount: business.manualOrderCount ?? 0,
      useManualOrderCount: business.useManualOrderCount ?? false,
      manualTotalAdSpend: business.manualTotalAdSpend ?? 0,
      useManualTotalAdSpend: business.useManualTotalAdSpend ?? false,
      otherCost: business.otherCost ?? 0,
      leadCloseRate: business.leadCloseRate ?? 0,
    },
  };
}

function draftKey(userId?: string | null): string {
  const suffix = userId?.trim() ? userId : 'guest';
  return `ms_ad_performance_draft_${suffix}`;
}

export function saveAdPerformanceDraft(
  state: AdPerformanceFormState,
  userId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(draftKey(userId), JSON.stringify(state));
}

export function loadAdPerformanceDraft(userId?: string | null): AdPerformanceFormState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    return normalizeAdPerformanceFormState(JSON.parse(raw) as Partial<AdPerformanceFormState>);
  } catch {
    return null;
  }
}

export function clearAdPerformanceDraft(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(draftKey(userId));
}
