import type { AdCampaignRow, AdCampaignType } from '@/types/ad-performance';
import type { FacebookSyncedCampaign } from '@/types/facebook-ads';
import { createCampaignRowId } from '@/lib/ad-performance-form';

const TYPE_MAP: Record<string, AdCampaignType> = {
  ENGAGEMENT: 'ENGAGEMENT',
  MESSAGE_LEAD: 'MESSAGE_LEAD',
  SALES: 'SALES',
  REMARKETING: 'REMARKETING',
  OTHER: 'OTHER',
};

export function facebookCampaignsToFormRows(campaigns: FacebookSyncedCampaign[]): AdCampaignRow[] {
  return campaigns.map((c) => ({
    id: createCampaignRowId(),
    name: c.campaignName,
    campaignType: TYPE_MAP[c.campaignType] ?? 'OTHER',
    adBudget: Math.round(c.spend),
    cpm: Math.round(c.cpm),
    resultRate: Math.round(c.resultRate * 100) / 100,
    frequency: Math.round(c.frequency * 100) / 100,
  }));
}

export function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { dateFrom: formatDateInput(from), dateTo: formatDateInput(to) };
}
