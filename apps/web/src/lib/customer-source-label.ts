/** Display label for canonical Customer.source / latestSource codes (mirrors API). */
export const CUSTOMER_SOURCE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'crm_manual', label: 'CRM nhập tay' },
  { code: 'funnel_form', label: 'Funnel Form' },
  { code: 'website_form', label: 'Website Form' },
  { code: 'website_chat', label: 'Website Chat' },
  { code: 'chatbot', label: 'Chatbot' },
  { code: 'zalo', label: 'Zalo' },
  { code: 'messenger', label: 'Messenger' },
  { code: 'fanpage', label: 'Fanpage' },
  { code: 'facebook_lead_ads', label: 'Facebook Lead Ads' },
  { code: 'booking', label: 'Booking' },
  { code: 'email_marketing', label: 'Email Marketing' },
  { code: 'import', label: 'Import' },
];

const LABELS: Record<string, string> = {
  crm_manual: 'CRM nhập tay',
  funnel_form: 'Funnel Form',
  website_form: 'Website Form',
  website_chat: 'Website Chat',
  chatbot: 'Chatbot',
  zalo: 'Zalo',
  messenger: 'Messenger',
  fanpage: 'Fanpage',
  facebook_lead_ads: 'Facebook Lead Ads',
  booking: 'Booking',
  email_marketing: 'Email Marketing',
  import: 'Import',
};

export function customerSourceDisplay(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (!code) return fallback ?? '—';
  return LABELS[code] ?? fallback ?? code;
}
