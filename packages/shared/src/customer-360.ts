/** Domain events — Customer is Single Source of Truth */
export const CUSTOMER_360_EVENTS = {
  CREATED: 'CUSTOMER_CREATED',
  UPDATED: 'CUSTOMER_UPDATED',
  EMAIL_ADDED: 'CUSTOMER_EMAIL_ADDED',
  PHONE_ADDED: 'CUSTOMER_PHONE_ADDED',
  MERGED: 'CUSTOMER_MERGED',
} as const;

export type Customer360EventType =
  (typeof CUSTOMER_360_EVENTS)[keyof typeof CUSTOMER_360_EVENTS];

export const CUSTOMER_IDENTITY_KIND = {
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  ZALO: 'ZALO',
  FACEBOOK: 'FACEBOOK',
} as const;

export type CustomerIdentityKind =
  (typeof CUSTOMER_IDENTITY_KIND)[keyof typeof CUSTOMER_IDENTITY_KIND];

export function customerOutboxJobId(outboxId: string): string {
  return `customer-outbox:${outboxId}`;
}

export function customerOutboxIdempotencyKey(
  eventType: Customer360EventType,
  parts: string[],
): string {
  return `${eventType}:${parts.join(':')}`;
}
