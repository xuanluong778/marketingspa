/**
 * Persist Meta Ads hierarchy + daily metrics into org-scoped Ad* tables.
 * Idempotent via findFirst(externalId) / AdDailyStat unique upsert.
 */
import { AdCampaignStatus, AdPlatform, prisma } from '@marketingspa/database';
import type {
  MetaAdAccountDetail,
  MetaAdNode,
  MetaAdSetNode,
  MetaCampaignNode,
} from './meta-graph-ads';
import { mapMetaInsight } from './ads-insight-mapper';
import { decimalString, normalizeMetaInsightRow } from './ads-metrics-normalize';

function mapCampaignStatus(raw?: string): AdCampaignStatus {
  const s = (raw ?? '').toUpperCase();
  if (s === 'ACTIVE') return AdCampaignStatus.ACTIVE;
  if (s === 'PAUSED') return AdCampaignStatus.PAUSED;
  if (s === 'ARCHIVED' || s === 'DELETED') return AdCampaignStatus.ARCHIVED;
  if (s === 'COMPLETED') return AdCampaignStatus.COMPLETED;
  return AdCampaignStatus.DRAFT;
}

function parseNum(value?: string | number | null): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function sumActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: Set<string>,
): number {
  if (!actions?.length) return 0;
  return actions.filter((a) => types.has(a.action_type)).reduce((s, a) => s + parseNum(a.value), 0);
}

const LEAD = new Set([
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
]);
const PURCHASE = new Set(['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']);

export async function upsertMetaAdAccount(organizationId: string, account: MetaAdAccountDetail) {
  const externalId = account.id.startsWith('act_') ? account.id : `act_${account.account_id}`;
  const existing = await prisma.adAccount.findFirst({
    where: { organizationId, platform: AdPlatform.META, externalId },
  });
  const data = {
    name: account.name || externalId,
    currency: account.currency ?? 'VND',
    timezone: account.timezone_name ?? 'UTC',
    isActive: account.account_status === 1 || account.account_status === undefined,
    externalId,
  };
  if (existing) {
    return prisma.adAccount.update({ where: { id: existing.id }, data });
  }
  return prisma.adAccount.create({
    data: {
      organizationId,
      platform: AdPlatform.META,
      ...data,
    },
  });
}

export async function upsertMetaCampaigns(
  organizationId: string,
  adAccountDbId: string,
  campaigns: MetaCampaignNode[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const c of campaigns) {
    const existing = await prisma.adCampaign.findFirst({
      where: { organizationId, platform: AdPlatform.META, externalId: c.id },
    });
    const budgetRaw = c.daily_budget ?? c.lifetime_budget;
    const budget = budgetRaw ? parseNum(budgetRaw) / 100 : null; // Meta budgets often in cents
    const status = mapCampaignStatus(c.effective_status ?? c.status);
    const startDate = c.start_time ? new Date(c.start_time) : null;
    const endDate = c.stop_time ? new Date(c.stop_time) : null;
    const row = existing
      ? await prisma.adCampaign.update({
          where: { id: existing.id },
          data: {
            name: c.name,
            status,
            budget,
            startDate,
            endDate,
            adAccountId: adAccountDbId,
          },
        })
      : await prisma.adCampaign.create({
          data: {
            organizationId,
            adAccountId: adAccountDbId,
            platform: AdPlatform.META,
            name: c.name,
            status,
            budget,
            startDate,
            endDate,
            externalId: c.id,
          },
        });
    map.set(c.id, row.id);
  }
  return map;
}

export async function upsertMetaAdSets(
  organizationId: string,
  adAccountDbId: string,
  campaignIdByExternal: Map<string, string>,
  adsets: MetaAdSetNode[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const a of adsets) {
    const campaignDbId = a.campaign_id ? campaignIdByExternal.get(a.campaign_id) : undefined;
    if (!campaignDbId) continue;
    const existing = await prisma.adSet.findFirst({
      where: { organizationId, externalId: a.id },
    });
    const isActive = (a.effective_status ?? a.status ?? '').toUpperCase() === 'ACTIVE';
    const row = existing
      ? await prisma.adSet.update({
          where: { id: existing.id },
          data: {
            name: a.name,
            isActive,
            adAccountId: adAccountDbId,
            adCampaignId: campaignDbId,
          },
        })
      : await prisma.adSet.create({
          data: {
            organizationId,
            adAccountId: adAccountDbId,
            adCampaignId: campaignDbId,
            name: a.name,
            externalId: a.id,
            isActive,
          },
        });
    map.set(a.id, row.id);
  }
  return map;
}

export async function upsertMetaAds(
  organizationId: string,
  adAccountDbId: string,
  campaignIdByExternal: Map<string, string>,
  adSetIdByExternal: Map<string, string>,
  ads: MetaAdNode[],
): Promise<number> {
  let n = 0;
  for (const ad of ads) {
    const campaignDbId = ad.campaign_id ? campaignIdByExternal.get(ad.campaign_id) : undefined;
    if (!campaignDbId) continue;
    const adSetDbId = ad.adset_id ? adSetIdByExternal.get(ad.adset_id) : null;
    const existing = await prisma.adCreative.findFirst({
      where: { organizationId, externalId: ad.id },
    });
    const isActive = (ad.effective_status ?? ad.status ?? '').toUpperCase() === 'ACTIVE';
    if (existing) {
      await prisma.adCreative.update({
        where: { id: existing.id },
        data: {
          name: ad.name,
          isActive,
          adAccountId: adAccountDbId,
          adCampaignId: campaignDbId,
          adSetId: adSetDbId,
        },
      });
    } else {
      await prisma.adCreative.create({
        data: {
          organizationId,
          adAccountId: adAccountDbId,
          adCampaignId: campaignDbId,
          adSetId: adSetDbId,
          name: ad.name,
          externalId: ad.id,
          isActive,
        },
      });
    }
    n += 1;
  }
  return n;
}

export async function upsertDailyCampaignStats(
  organizationId: string,
  campaignIdByExternal: Map<string, string>,
  dailyRows: Record<string, unknown>[],
  opts: { currency: string; timezone: string },
): Promise<number> {
  let n = 0;
  for (const raw of dailyRows) {
    const campaignExt = String(raw.campaign_id ?? '');
    const campaignDbId = campaignIdByExternal.get(campaignExt);
    if (!campaignDbId) continue;
    const dateStr = String(raw.date_start ?? raw.date_stop ?? '').slice(0, 10);
    if (!dateStr) continue;
    const date = new Date(dateStr + 'T00:00:00.000Z');
    const normalized = normalizeMetaInsightRow(raw, {
      currency: opts.currency,
      date: dateStr,
      timezone: opts.timezone,
    });
    await prisma.adDailyStat.upsert({
      where: {
        adCampaignId_date: { adCampaignId: campaignDbId, date },
      },
      create: {
        organizationId,
        adCampaignId: campaignDbId,
        date,
        impressions: Math.trunc(normalized.impressions),
        reach: Math.trunc(normalized.reach),
        clicks: Math.trunc(normalized.clicks),
        spend: decimalString(normalized.spend) ?? '0',
        conversions: decimalString(normalized.conversions) ?? '0',
        conversionValue: decimalString(normalized.conversionValue) ?? '0',
        leads: 0,
        ctr: decimalString(normalized.ctr),
        cpc: decimalString(normalized.cpc),
        cpm: decimalString(normalized.cpm),
        cpa: decimalString(normalized.cpa),
        roas: decimalString(normalized.roas),
        currency: normalized.currency,
        timezone: opts.timezone,
        conversionActions: normalized.conversionActions,
      },
      update: {
        impressions: Math.trunc(normalized.impressions),
        reach: Math.trunc(normalized.reach),
        clicks: Math.trunc(normalized.clicks),
        spend: decimalString(normalized.spend) ?? '0',
        conversions: decimalString(normalized.conversions) ?? '0',
        conversionValue: decimalString(normalized.conversionValue) ?? '0',
        ctr: decimalString(normalized.ctr),
        cpc: decimalString(normalized.cpc),
        cpm: decimalString(normalized.cpm),
        cpa: decimalString(normalized.cpa),
        roas: decimalString(normalized.roas),
        currency: normalized.currency,
        timezone: opts.timezone,
        conversionActions: normalized.conversionActions,
      },
    });
    n += 1;
  }
  return n;
}

export { mapMetaInsight };
