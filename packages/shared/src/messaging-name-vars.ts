/**
 * Tên Facebook / Zalo từ identity (PSID + page scope).
 * Không lấy từ campaign.variables — tránh dùng chung tên giữa các recipient.
 */
export const MESSAGING_NAME_FALLBACK = 'Anh/chị';

const PLACEHOLDER_NAMES = /^(khách(\s+messenger)?|guest|user|psid|unknown|n\/a|null)$/i;

export function resolveMessagingDisplayNames(displayName?: string | null): {
  full_name: string;
  first_name: string;
  customer_name: string;
} {
  const raw = String(displayName || '').trim().replace(/\s+/g, ' ');
  if (!raw || PLACEHOLDER_NAMES.test(raw)) {
    return {
      full_name: MESSAGING_NAME_FALLBACK,
      first_name: MESSAGING_NAME_FALLBACK,
      customer_name: MESSAGING_NAME_FALLBACK,
    };
  }
  const parts = raw.split(' ').filter(Boolean);
  const first = parts[0] || raw;
  return {
    full_name: raw,
    first_name: first,
    customer_name: raw,
  };
}

/** Biến campaign không được đưa vào context render (tránh đè tên / lộ template). */
export const CAMPAIGN_VAR_RENDER_EXCLUDE = new Set([
  'body',
  'message',
  'content',
  'mediaUrl',
  'mediaType',
  'full_name',
  'first_name',
  'customer_name',
]);

export function pickCampaignRenderVariables(
  campaignVariables: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!campaignVariables) return out;
  for (const [k, v] of Object.entries(campaignVariables)) {
    if (CAMPAIGN_VAR_RENDER_EXCLUDE.has(k)) continue;
    if (v == null || String(v).trim() === '') continue;
    out[k] = String(v);
  }
  return out;
}

export const MESSAGING_NAME_FALLBACKS: Record<string, string> = {
  full_name: MESSAGING_NAME_FALLBACK,
  first_name: MESSAGING_NAME_FALLBACK,
  customer_name: MESSAGING_NAME_FALLBACK,
};
