import type { Prisma } from '@prisma/client';

/** Keep in sync with @marketingspa/shared customer-sources.ts (database has no shared dep). */
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
  const codes = Object.values(CUSTOMER_SOURCE) as string[];
  if (codes.includes(key)) return key as CustomerSourceCode;
  return LEGACY_SOURCE_MAP[key] ?? null;
}

export function applyCustomerSourceFields(
  sourceRaw: string | null | undefined,
  isNew: boolean,
): { source?: string; firstSource?: string; latestSource?: string } {
  const code = normalizeCustomerSource(sourceRaw);
  if (!code) return {};
  if (isNew) {
    return { source: code, firstSource: code, latestSource: code };
  }
  return { source: code, latestSource: code };
}

export const CUSTOMER_360_TEST_TAG = '__c360_e2e__';
export const CUSTOMER_TEST_TAG = '__test__';

const TEST_NAME_PATTERNS = [/canvas\s*runtime/i, /e2e\s*tester/i];

export function isCustomerTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith('@example.com') ||
    lower.endsWith('@e2e.local') ||
    lower.includes('@test.')
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

/** Prisma WHERE fragment — hide test/synthetic customers from live CRM lists. */
export function customerExcludeTestWhere(): Prisma.CustomerWhereInput {
  return {
    NOT: {
      OR: [
        { tags: { has: CUSTOMER_360_TEST_TAG } },
        { tags: { has: CUSTOMER_TEST_TAG } },
        { name: { contains: 'Canvas Runtime', mode: 'insensitive' } },
        { name: { contains: 'E2E Tester', mode: 'insensitive' } },
        { email: { endsWith: '@example.com', mode: 'insensitive' } },
        { email: { endsWith: '@e2e.local', mode: 'insensitive' } },
      ],
    },
  };
}
