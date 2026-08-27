import { normalizeMessagingPhone } from './messaging-phone.util';

export function normalizeCustomerEmail(email?: string | null): string | null {
  const v = String(email || '').trim().toLowerCase();
  if (!v || !v.includes('@') || v.length > 320) return null;
  return v;
}

export function normalizeCustomerPhone(phone?: string | null): string | null {
  return normalizeMessagingPhone(phone);
}

export function customerEmailsMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeCustomerEmail(a);
  const nb = normalizeCustomerEmail(b);
  return Boolean(na && nb && na === nb);
}

export function customerPhonesMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeCustomerPhone(a);
  const nb = normalizeCustomerPhone(b);
  return Boolean(na && nb && na === nb);
}
