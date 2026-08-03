import type { MetaCampaignInsight } from './meta-graph-api.service';

const LEAD_ACTIONS = new Set([
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
]);

const MESSAGE_ACTIONS = new Set([
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'onsite_conversion.messaging_block',
]);

const PURCHASE_ACTIONS = new Set([
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
]);

const ENGAGEMENT_ACTIONS = new Set([
  'post_engagement',
  'page_engagement',
  'link_click',
  'post_reaction',
  'comment',
  'like',
]);

export type MappedCampaignType = 'ENGAGEMENT' | 'MESSAGE_LEAD' | 'SALES' | 'REMARKETING' | 'OTHER';

export interface MappedFacebookCampaign {
  campaignId: string;
  campaignName: string;
  campaignType: MappedCampaignType;
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
}

function parseNum(value?: string | number | null): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function sumActions(
  actions: { action_type: string; value: string }[] | undefined,
  types: Set<string>,
): number {
  if (!actions?.length) return 0;
  return actions
    .filter((a) => types.has(a.action_type))
    .reduce((sum, a) => sum + parseNum(a.value), 0);
}

function pickPrimaryResult(
  actions: { action_type: string; value: string }[] | undefined,
  campaignType: MappedCampaignType,
): number {
  if (!actions?.length) return 0;

  if (campaignType === 'SALES') {
    const purchase = sumActions(actions, PURCHASE_ACTIONS);
    if (purchase > 0) return purchase;
  }
  if (campaignType === 'MESSAGE_LEAD') {
    const leads = sumActions(actions, LEAD_ACTIONS);
    const messages = sumActions(actions, MESSAGE_ACTIONS);
    if (leads > 0) return leads;
    if (messages > 0) return messages;
  }
  if (campaignType === 'ENGAGEMENT') {
    const engagement = sumActions(actions, ENGAGEMENT_ACTIONS);
    if (engagement > 0) return engagement;
  }

  const linkClicks = actions.find((a) => a.action_type === 'link_click');
  if (linkClicks) return parseNum(linkClicks.value);

  return parseNum(actions[0]?.value);
}

function mapObjective(objective?: string, name?: string): MappedCampaignType {
  const obj = (objective ?? '').toUpperCase();
  const n = (name ?? '').toLowerCase();

  if (
    obj.includes('LEAD') ||
    obj.includes('MESSAGING') ||
    n.includes('lead') ||
    n.includes('tin nhắn')
  ) {
    return 'MESSAGE_LEAD';
  }
  if (
    obj.includes('SALES') ||
    obj.includes('CONVERSION') ||
    obj.includes('PURCHASE') ||
    n.includes('bán hàng')
  ) {
    return 'SALES';
  }
  if (obj.includes('ENGAGEMENT') || obj.includes('AWARENESS') || obj.includes('TRAFFIC')) {
    return 'ENGAGEMENT';
  }
  if (n.includes('remarketing') || n.includes('retarget')) {
    return 'REMARKETING';
  }
  return 'OTHER';
}

function pickCostPerResult(
  costPerAction: { action_type: string; value: string }[] | undefined,
  campaignType: MappedCampaignType,
  spend: number,
  results: number,
): number {
  if (costPerAction?.length) {
    const typeSets: Record<MappedCampaignType, Set<string>> = {
      SALES: PURCHASE_ACTIONS,
      MESSAGE_LEAD: new Set([...LEAD_ACTIONS, ...MESSAGE_ACTIONS]),
      ENGAGEMENT: ENGAGEMENT_ACTIONS,
      REMARKETING: PURCHASE_ACTIONS,
      OTHER: new Set<string>(),
    };
    const match = costPerAction.find((a) => typeSets[campaignType].has(a.action_type));
    if (match) return parseNum(match.value);
    if (costPerAction[0]) return parseNum(costPerAction[0].value);
  }
  return results > 0 ? spend / results : 0;
}

function pickPurchaseRoas(roas?: { action_type: string; value: string }[]): number | null {
  if (!roas?.length) return null;
  const purchase = roas.find((r) => PURCHASE_ACTIONS.has(r.action_type)) ?? roas[0];
  const val = parseNum(purchase?.value);
  return val > 0 ? val : null;
}

export function mapMetaInsightToCampaign(row: MetaCampaignInsight): MappedFacebookCampaign {
  const spend = parseNum(row.spend);
  const impressions = Math.round(parseNum(row.impressions));
  const reach = Math.round(parseNum(row.reach));
  const frequency = parseNum(row.frequency);
  const cpm = parseNum(row.cpm);
  const cpc = parseNum(row.cpc);
  const ctr = parseNum(row.ctr);
  const clicks = Math.round(parseNum(row.clicks));
  const campaignType = mapObjective(row.objective, row.campaign_name);
  const results = pickPrimaryResult(row.actions, campaignType);
  const costPerResult = pickCostPerResult(row.cost_per_action_type, campaignType, spend, results);
  const purchaseRoas = pickPurchaseRoas(row.purchase_roas);
  const resultRate = impressions > 0 ? (results / impressions) * 100 : 0;

  return {
    campaignId: row.campaign_id ?? '',
    campaignName: row.campaign_name ?? 'Chiến dịch không tên',
    campaignType,
    objective: row.objective ?? null,
    spend,
    impressions,
    reach,
    frequency,
    cpm,
    cpc,
    ctr,
    clicks,
    results,
    costPerResult,
    purchaseRoas,
    resultRate,
  };
}
