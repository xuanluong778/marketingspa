/**
 * Persist Google Ads hierarchy + daily metrics (org-scoped Ad* tables).
 */
import { AdCampaignStatus, AdPlatform, prisma } from '@marketingspa/database';
import { decimalString, normalizeGoogleMetricRow } from './ads-metrics-normalize';

function mapStatus(raw?: string): AdCampaignStatus {
  const s = (raw ?? '').toUpperCase();
  if (s === 'ENABLED') return AdCampaignStatus.ACTIVE;
  if (s === 'PAUSED') return AdCampaignStatus.PAUSED;
  if (s === 'REMOVED') return AdCampaignStatus.ARCHIVED;
  return AdCampaignStatus.DRAFT;
}

function parseNum(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export async function upsertGoogleAdAccount(
  organizationId: string,
  customerId: string,
  name: string,
  currency: string,
  timezone = 'UTC',
) {
  const externalId = customerId.replace(/-/g, '');
  const existing = await prisma.adAccount.findFirst({
    where: { organizationId, platform: AdPlatform.GOOGLE, externalId },
  });
  const data = {
    name,
    currency: currency || 'USD',
    timezone: timezone || 'UTC',
    isActive: true,
    externalId,
  };
  if (existing) return prisma.adAccount.update({ where: { id: existing.id }, data });
  return prisma.adAccount.create({
    data: { organizationId, platform: AdPlatform.GOOGLE, ...data },
  });
}

export async function upsertGoogleCampaigns(
  organizationId: string,
  adAccountDbId: string,
  rows: Record<string, unknown>[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const c = row.campaign as {
      id?: string;
      name?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    };
    const budget = row.campaignBudget as { amountMicros?: string } | undefined;
    if (!c?.id) continue;
    const externalId = String(c.id);
    const existing = await prisma.adCampaign.findFirst({
      where: { organizationId, platform: AdPlatform.GOOGLE, externalId },
    });
    const amount = budget?.amountMicros ? parseNum(budget.amountMicros) / 1_000_000 : null;
    const status = mapStatus(c.status);
    const startDate = c.startDate ? new Date(c.startDate + 'T00:00:00.000Z') : null;
    const endDate = c.endDate ? new Date(c.endDate + 'T00:00:00.000Z') : null;
    const saved = existing
      ? await prisma.adCampaign.update({
          where: { id: existing.id },
          data: {
            name: c.name ?? externalId,
            status,
            budget: amount,
            startDate,
            endDate,
            adAccountId: adAccountDbId,
          },
        })
      : await prisma.adCampaign.create({
          data: {
            organizationId,
            adAccountId: adAccountDbId,
            platform: AdPlatform.GOOGLE,
            name: c.name ?? externalId,
            status,
            budget: amount,
            startDate,
            endDate,
            externalId,
          },
        });
    map.set(externalId, saved.id);
  }
  return map;
}

export async function upsertGoogleAdGroups(
  organizationId: string,
  adAccountDbId: string,
  campaignIdByExternal: Map<string, string>,
  rows: Record<string, unknown>[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const ag = row.adGroup as { id?: string; name?: string; status?: string };
    const camp = row.campaign as { id?: string };
    if (!ag?.id || !camp?.id) continue;
    const campaignDbId = campaignIdByExternal.get(String(camp.id));
    if (!campaignDbId) continue;
    const externalId = String(ag.id);
    const existing = await prisma.adSet.findFirst({
      where: { organizationId, externalId },
    });
    const isActive = (ag.status ?? '').toUpperCase() === 'ENABLED';
    const saved = existing
      ? await prisma.adSet.update({
          where: { id: existing.id },
          data: {
            name: ag.name ?? externalId,
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
            name: ag.name ?? externalId,
            externalId,
            isActive,
          },
        });
    map.set(externalId, saved.id);
  }
  return map;
}

export async function upsertGoogleAdsCreatives(
  organizationId: string,
  adAccountDbId: string,
  campaignIdByExternal: Map<string, string>,
  adSetIdByExternal: Map<string, string>,
  rows: Record<string, unknown>[],
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    const adgAd = row.adGroupAd as {
      status?: string;
      ad?: { id?: string; name?: string };
    };
    const ag = row.adGroup as { id?: string };
    const camp = row.campaign as { id?: string };
    const adId = adgAd?.ad?.id;
    if (!adId || !camp?.id) continue;
    const campaignDbId = campaignIdByExternal.get(String(camp.id));
    if (!campaignDbId) continue;
    const adSetDbId = ag?.id ? adSetIdByExternal.get(String(ag.id)) : null;
    const externalId = String(adId);
    const existing = await prisma.adCreative.findFirst({
      where: { organizationId, externalId },
    });
    const isActive = (adgAd?.status ?? '').toUpperCase() === 'ENABLED';
    const name = adgAd?.ad?.name ?? externalId;
    if (existing) {
      await prisma.adCreative.update({
        where: { id: existing.id },
        data: {
          name,
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
          name,
          externalId,
          isActive,
        },
      });
    }
    n += 1;
  }
  return n;
}

export async function upsertGoogleDailyStats(
  organizationId: string,
  campaignIdByExternal: Map<string, string>,
  rows: Record<string, unknown>[],
  opts: { currency: string; timezone: string },
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    const camp = row.campaign as { id?: string };
    const segments = row.segments as { date?: string };
    const metrics = row.metrics as {
      impressions?: string;
      clicks?: string;
      costMicros?: string;
      conversions?: number;
      conversionsValue?: number;
    };
    if (!camp?.id || !segments?.date) continue;
    const campaignDbId = campaignIdByExternal.get(String(camp.id));
    if (!campaignDbId) continue;
    const date = new Date(segments.date + 'T00:00:00.000Z');
    const normalized = normalizeGoogleMetricRow(
      {
        impressions: metrics?.impressions,
        clicks: metrics?.clicks,
        costMicros: metrics?.costMicros,
        conversions: metrics?.conversions,
        conversionsValue: metrics?.conversionsValue,
      },
      {
        currency: opts.currency,
        date: segments.date,
        conversionActions: [
          {
            type: 'google.conversions',
            count: Number(metrics?.conversions ?? 0) || 0,
            value: Number(metrics?.conversionsValue ?? 0) || 0,
          },
        ],
      },
    );
    await prisma.adDailyStat.upsert({
      where: { adCampaignId_date: { adCampaignId: campaignDbId, date } },
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
