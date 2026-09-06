/** Prompt 12 — Funnel analytics helpers (SaaS dashboard) */

export type FunnelTouchModel = 'first' | 'last';

export type FunnelSaaSStageKey = 'LEAD' | 'MQL' | 'SQL' | 'BOOKING' | 'PURCHASED';

export const FUNNEL_SAAS_STAGES: Array<{ key: FunnelSaaSStageKey; label: string }> = [
  { key: 'LEAD', label: 'Lead' },
  { key: 'MQL', label: 'MQL' },
  { key: 'SQL', label: 'SQL' },
  { key: 'BOOKING', label: 'Booking' },
  { key: 'PURCHASED', label: 'Purchased' },
];

export type ResolvedTouch = {
  channel?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  adCampaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  externalCampaignId?: string | null;
  externalAdSetId?: string | null;
  externalAdId?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
};

export function resolveAttributionTouch(
  row: {
    channel?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    fbclid?: string | null;
    gclid?: string | null;
    adCampaignId?: string | null;
    adSetId?: string | null;
    adId?: string | null;
    externalCampaignId?: string | null;
    externalAdSetId?: string | null;
    externalAdId?: string | null;
    landingPage?: string | null;
    referrer?: string | null;
    firstTouchJson?: unknown;
    lastTouchJson?: unknown;
  },
  touchModel: FunnelTouchModel,
): ResolvedTouch {
  const snap =
    touchModel === 'first'
      ? (row.firstTouchJson as ResolvedTouch | null | undefined)
      : (row.lastTouchJson as ResolvedTouch | null | undefined);

  if (snap && typeof snap === 'object') {
    return {
      channel: snap.channel ?? row.channel ?? null,
      utmSource: snap.utmSource ?? row.utmSource ?? null,
      utmMedium: snap.utmMedium ?? row.utmMedium ?? null,
      utmCampaign: snap.utmCampaign ?? row.utmCampaign ?? null,
      utmContent: snap.utmContent ?? row.utmContent ?? null,
      utmTerm: snap.utmTerm ?? row.utmTerm ?? null,
      fbclid: snap.fbclid ?? row.fbclid ?? null,
      gclid: snap.gclid ?? row.gclid ?? null,
      adCampaignId: snap.adCampaignId ?? row.adCampaignId ?? null,
      adSetId: snap.adSetId ?? row.adSetId ?? null,
      adId: snap.adId ?? row.adId ?? null,
      externalCampaignId: snap.externalCampaignId ?? row.externalCampaignId ?? null,
      externalAdSetId: snap.externalAdSetId ?? row.externalAdSetId ?? null,
      externalAdId: snap.externalAdId ?? row.externalAdId ?? null,
      landingPage: snap.landingPage ?? row.landingPage ?? null,
      referrer: snap.referrer ?? row.referrer ?? null,
    };
  }

  return {
    channel: row.channel ?? null,
    utmSource: row.utmSource ?? null,
    utmMedium: row.utmMedium ?? null,
    utmCampaign: row.utmCampaign ?? null,
    utmContent: row.utmContent ?? null,
    utmTerm: row.utmTerm ?? null,
    fbclid: row.fbclid ?? null,
    gclid: row.gclid ?? null,
    adCampaignId: row.adCampaignId ?? null,
    adSetId: row.adSetId ?? null,
    adId: row.adId ?? null,
    externalCampaignId: row.externalCampaignId ?? null,
    externalAdSetId: row.externalAdSetId ?? null,
    externalAdId: row.externalAdId ?? null,
    landingPage: row.landingPage ?? null,
    referrer: row.referrer ?? null,
  };
}

export function pctRate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

/** Drop-off % lost from previous stage count to current */
export function dropOffFromPrevious(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  const lost = Math.max(0, previous - current);
  return Math.round((lost / previous) * 1000) / 10;
}

export function avgHoursBetween(diffsMs: number[]): number | null {
  if (!diffsMs.length) return null;
  const avg = diffsMs.reduce((a, b) => a + b, 0) / diffsMs.length;
  return Math.round((avg / 3600000) * 10) / 10;
}
