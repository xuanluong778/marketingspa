/** Lightweight Meta insight → campaign mapping (mirror API mapper; no Nest deps) */

type Action = { action_type: string; value: string };

function parseNum(value?: string | number | null): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function sumActions(actions: Action[] | undefined, types: Set<string>): number {
  if (!actions?.length) return 0;
  return actions.filter((a) => types.has(a.action_type)).reduce((s, a) => s + parseNum(a.value), 0);
}

const LEAD = new Set([
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
]);
const MESSAGE = new Set([
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
]);
const PURCHASE = new Set(['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']);

export type MappedCampaign = {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  objective: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  cpc: number;
  ctr: number;
  clicks: number;
  results: number;
  costPerResult: number;
  purchaseRoas: number | null;
  resultRate: number;
};

export function mapMetaInsight(row: Record<string, unknown>): MappedCampaign | null {
  const campaignId = String(row.campaign_id ?? '');
  if (!campaignId) return null;
  const actions = row.actions as Action[] | undefined;
  const objective = row.objective ? String(row.objective) : null;
  let campaignType = 'OTHER';
  if (sumActions(actions, PURCHASE) > 0 || (objective ?? '').includes('CONVERSIONS')) {
    campaignType = 'SALES';
  } else if (sumActions(actions, LEAD) + sumActions(actions, MESSAGE) > 0) {
    campaignType = 'MESSAGE_LEAD';
  } else if ((objective ?? '').includes('ENGAGEMENT')) {
    campaignType = 'ENGAGEMENT';
  }

  const results =
    campaignType === 'SALES'
      ? sumActions(actions, PURCHASE) || parseNum(row.clicks as string)
      : campaignType === 'MESSAGE_LEAD'
        ? sumActions(actions, LEAD) + sumActions(actions, MESSAGE) || parseNum(row.clicks as string)
        : parseNum(row.clicks as string);

  const spend = parseNum(row.spend as string);
  const purchaseRoasRaw = row.purchase_roas as Action[] | undefined;
  const purchaseRoas = purchaseRoasRaw?.length ? parseNum(purchaseRoasRaw[0]?.value) : null;

  return {
    campaignId,
    campaignName: String(row.campaign_name ?? campaignId),
    campaignType,
    objective,
    spend,
    impressions: Math.round(parseNum(row.impressions as string)),
    reach: Math.round(parseNum(row.reach as string)),
    frequency: parseNum(row.frequency as string),
    cpm: parseNum(row.cpm as string),
    cpc: parseNum(row.cpc as string),
    ctr: parseNum(row.ctr as string),
    clicks: Math.round(parseNum(row.clicks as string)),
    results,
    costPerResult: results > 0 ? spend / results : 0,
    purchaseRoas,
    resultRate: parseNum(row.impressions as string)
      ? (results / parseNum(row.impressions as string)) * 100
      : 0,
  };
}
