import type { AdCampaignRow, AdCampaignType, AdPerformanceFormState } from '@/types/ad-performance';

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

export const defaultAdPerformanceFormState: AdPerformanceFormState = {
  campaigns: [createEmptyCampaignRow()],
  business: {
    averageOrderValue: 0,
    grossProfitRate: 0,
    manualOrderCount: 0,
    useManualOrderCount: false,
    manualTotalAdSpend: 0,
    useManualTotalAdSpend: false,
  },
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
  },
};

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
    return JSON.parse(raw) as AdPerformanceFormState;
  } catch {
    return null;
  }
}

export function clearAdPerformanceDraft(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(draftKey(userId));
}
