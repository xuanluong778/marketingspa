/** Canonical Customer 360 ingress / display sources (SSOT codes). */
export const CUSTOMER_SOURCE = {
  CRM_MANUAL: 'crm_manual',
  FUNNEL_FORM: 'funnel_form',
  WEBSITE_FORM: 'website_form',
  WEBSITE_CHAT: 'website_chat',
  CHATBOT: 'chatbot',
  ZALO: 'zalo',
  MESSENGER: 'messenger',
  FANPAGE: 'fanpage',
  FACEBOOK_LEAD_ADS: 'facebook_lead_ads',
  BOOKING: 'booking',
  EMAIL_MARKETING: 'email_marketing',
  IMPORT: 'import',
} as const;

export type CustomerSourceCode = (typeof CUSTOMER_SOURCE)[keyof typeof CUSTOMER_SOURCE];

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSourceCode, string> = {
  [CUSTOMER_SOURCE.CRM_MANUAL]: 'CRM nhập tay',
  [CUSTOMER_SOURCE.FUNNEL_FORM]: 'Funnel Form',
  [CUSTOMER_SOURCE.WEBSITE_FORM]: 'Website Form',
  [CUSTOMER_SOURCE.WEBSITE_CHAT]: 'Website Chat',
  [CUSTOMER_SOURCE.CHATBOT]: 'Chatbot',
  [CUSTOMER_SOURCE.ZALO]: 'Zalo',
  [CUSTOMER_SOURCE.MESSENGER]: 'Messenger',
  [CUSTOMER_SOURCE.FANPAGE]: 'Fanpage',
  [CUSTOMER_SOURCE.FACEBOOK_LEAD_ADS]: 'Facebook Lead Ads',
  [CUSTOMER_SOURCE.BOOKING]: 'Booking',
  [CUSTOMER_SOURCE.EMAIL_MARKETING]: 'Email Marketing',
  [CUSTOMER_SOURCE.IMPORT]: 'Import',
};

/** Legacy / alias strings → canonical code. */
const LEGACY_SOURCE_MAP: Record<string, CustomerSourceCode> = {
  crm: CUSTOMER_SOURCE.CRM_MANUAL,
  crm_manual: CUSTOMER_SOURCE.CRM_MANUAL,
  manual: CUSTOMER_SOURCE.CRM_MANUAL,
  funnel: CUSTOMER_SOURCE.FUNNEL_FORM,
  funnel_form: CUSTOMER_SOURCE.FUNNEL_FORM,
  website: CUSTOMER_SOURCE.WEBSITE_FORM,
  website_form: CUSTOMER_SOURCE.WEBSITE_FORM,
  lead_form: CUSTOMER_SOURCE.WEBSITE_FORM,
  website_chat: CUSTOMER_SOURCE.WEBSITE_CHAT,
  chatbot: CUSTOMER_SOURCE.CHATBOT,
  chatbot_website: CUSTOMER_SOURCE.WEBSITE_CHAT,
  chatbot_messenger: CUSTOMER_SOURCE.MESSENGER,
  zalo: CUSTOMER_SOURCE.ZALO,
  messenger: CUSTOMER_SOURCE.MESSENGER,
  messenger_verified_phone: CUSTOMER_SOURCE.MESSENGER,
  messaging_link: CUSTOMER_SOURCE.MESSENGER,
  fanpage: CUSTOMER_SOURCE.FANPAGE,
  facebook: CUSTOMER_SOURCE.FANPAGE,
  lead_ads: CUSTOMER_SOURCE.FACEBOOK_LEAD_ADS,
  facebook_lead_ads: CUSTOMER_SOURCE.FACEBOOK_LEAD_ADS,
  meta_lead: CUSTOMER_SOURCE.FACEBOOK_LEAD_ADS,
  booking: CUSTOMER_SOURCE.BOOKING,
  booking_walkin: CUSTOMER_SOURCE.BOOKING,
  appointment_from_lead: CUSTOMER_SOURCE.BOOKING,
  appointment_create: CUSTOMER_SOURCE.BOOKING,
  appointment_cancel: CUSTOMER_SOURCE.BOOKING,
  email: CUSTOMER_SOURCE.EMAIL_MARKETING,
  email_marketing: CUSTOMER_SOURCE.EMAIL_MARKETING,
  CRM: CUSTOMER_SOURCE.EMAIL_MARKETING,
  import: CUSTOMER_SOURCE.IMPORT,
  excel: CUSTOMER_SOURCE.IMPORT,
  csv: CUSTOMER_SOURCE.IMPORT,
  lead_ingress: CUSTOMER_SOURCE.WEBSITE_FORM,
  lead_convert: CUSTOMER_SOURCE.CRM_MANUAL,
};

export function normalizeCustomerSource(
  raw: string | null | undefined,
): CustomerSourceCode | null {
  if (!raw?.trim()) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (key in CUSTOMER_SOURCE_LABELS) return key as CustomerSourceCode;
  return LEGACY_SOURCE_MAP[key] ?? null;
}

export function customerSourceLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const normalized = normalizeCustomerSource(code);
  if (normalized) return CUSTOMER_SOURCE_LABELS[normalized];
  return code;
}

export function listCustomerSources(): Array<{ code: CustomerSourceCode; label: string }> {
  return (Object.values(CUSTOMER_SOURCE) as CustomerSourceCode[]).map((code) => ({
    code,
    label: CUSTOMER_SOURCE_LABELS[code],
  }));
}

export const CUSTOMER_360_TEST_TAG = '__c360_e2e__';
export const CUSTOMER_TEST_TAG = '__test__';

const TEST_NAME_PATTERNS = [/canvas\s*runtime/i, /e2e\s*tester/i, /^omni\s/i, /^c360\s/i];

export function isCustomerTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith('@example.com') ||
    lower.endsWith('@e2e.local') ||
    lower.includes('@test.') ||
    /^(c360|omni|em-|gate|trial|cred|sub|ops|gift|p0-|em-test)/i.test(lower.split('@')[0] ?? '')
  );
}

export function isCustomerTestRecord(input: {
  name?: string | null;
  email?: string | null;
  tags?: string[] | null;
}): boolean {
  const tags = input.tags ?? [];
  if (tags.includes(CUSTOMER_360_TEST_TAG) || tags.includes(CUSTOMER_TEST_TAG)) return true;
  if (input.name && TEST_NAME_PATTERNS.some((re) => re.test(input.name!))) return true;
  return isCustomerTestEmail(input.email);
}
