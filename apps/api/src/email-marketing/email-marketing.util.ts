export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function renderEmailMerge(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

export function contactMergeVars(contact: {
  name?: string | null;
  email: string;
  customFields?: unknown;
}): Record<string, string> {
  const name = (contact.name || '').trim() || contact.email;
  const firstName = name.split(/\s+/)[0] || name;
  const fields =
    contact.customFields && typeof contact.customFields === 'object' && !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};
  const companyRaw = fields.company ?? fields.companyName ?? '';
  const company = typeof companyRaw === 'string' ? companyRaw.trim() : '';
  return {
    name,
    firstName,
    email: contact.email,
    company,
  };
}

export function publicApiBase(): string {
  const app = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
  return `${app}/api/v1/email-marketing/public`;
}

export function unsubscribePageUrl(recipientId: string): string {
  const app = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
  return `${app}/email-unsubscribe?rid=${encodeURIComponent(recipientId)}`;
}

export type SegmentRules = {
  status?: 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'BOUNCED';
  listId?: string;
};
