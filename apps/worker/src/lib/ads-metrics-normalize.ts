/**
 * Shared helpers to map provider rows → adsNormalizedMetrics (no Nest deps).
 */
import {
  asFiniteNumber,
  normalizeAdsMetrics,
  type AdsConversionAction,
  type AdsNormalizedMetrics,
} from '@marketingspa/shared';

type ActionRow = { action_type?: string; actionType?: string; value?: string | number };

export function mapMetaActions(actions: ActionRow[] | undefined): AdsConversionAction[] {
  if (!actions?.length) return [];
  const byType = new Map<string, number>();
  for (const a of actions) {
    const type = String(a.action_type ?? a.actionType ?? '').trim();
    if (!type) continue;
    byType.set(type, (byType.get(type) ?? 0) + asFiniteNumber(a.value));
  }
  return [...byType.entries()].map(([type, count]) => ({ type, count }));
}

export function mapMetaActionValues(actionValues: ActionRow[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!actionValues?.length) return map;
  for (const a of actionValues) {
    const type = String(a.action_type ?? a.actionType ?? '').trim();
    if (!type) continue;
    map.set(type, (map.get(type) ?? 0) + asFiniteNumber(a.value));
  }
  return map;
}

const PURCHASE = new Set(['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']);
const LEAD = new Set([
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
]);

export function normalizeMetaInsightRow(
  row: Record<string, unknown>,
  opts: { currency: string; date: string; timezone: string },
): AdsNormalizedMetrics & { conversionActions: AdsConversionAction[] } {
  const actions = mapMetaActions(row.actions as ActionRow[] | undefined);
  const values = mapMetaActionValues(row.action_values as ActionRow[] | undefined);

  let conversions = 0;
  let conversionValue = 0;
  for (const a of actions) {
    if (PURCHASE.has(a.type) || LEAD.has(a.type)) {
      conversions += a.count;
    }
  }
  for (const [type, value] of values) {
    if (PURCHASE.has(type)) conversionValue += value;
  }
  // Fallback: nếu không có purchase value, cộng mọi action_values
  if (conversionValue === 0 && values.size > 0) {
    for (const v of values.values()) conversionValue += v;
  }
  if (conversions === 0) {
    conversions = actions.reduce((s, a) => s + a.count, 0) || asFiniteNumber(row.clicks);
  }

  const withValues: AdsConversionAction[] = actions.map((a) => ({
    ...a,
    value: values.get(a.type),
  }));

  const purchaseRoasRaw = row.purchase_roas as ActionRow[] | undefined;
  const purchaseRoas = purchaseRoasRaw?.length ? asFiniteNumber(purchaseRoasRaw[0]?.value) : null;

  const metrics = normalizeAdsMetrics({
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    spend: row.spend,
    conversions,
    conversionValue:
      conversionValue > 0
        ? conversionValue
        : purchaseRoas != null
          ? asFiniteNumber(row.spend) * purchaseRoas
          : 0,
    currency: opts.currency,
    date: opts.date,
    conversionActions: withValues,
    recomputeRates: true,
  });

  return metrics;
}

export function normalizeGoogleMetricRow(
  row: {
    impressions?: unknown;
    clicks?: unknown;
    costMicros?: unknown;
    conversions?: unknown;
    conversionsValue?: unknown;
    reach?: unknown;
  },
  opts: { currency: string; date: string; conversionActions?: AdsConversionAction[] },
): AdsNormalizedMetrics {
  return normalizeAdsMetrics({
    impressions: row.impressions,
    reach: row.reach ?? 0,
    clicks: row.clicks,
    spend: asFiniteNumber(row.costMicros) / 1_000_000,
    conversions: row.conversions,
    conversionValue: row.conversionsValue,
    currency: opts.currency,
    date: opts.date,
    conversionActions: opts.conversionActions ?? [],
    recomputeRates: true,
  });
}

/** Decimal-safe string for Prisma (no early round). */
export function decimalString(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return String(n);
}
