import {
  CustomerIdentityKind,
  MessagingIdentityLinkSource,
  type Customer,
  type Prisma,
} from '@prisma/client';
import { createOrReuseCustomerSsot } from './customer-360-write';
import { enqueueCustomerOutboxEvent } from './customer-360-outbox';
import { claimCustomerIdentity } from './customer-360-identities';
import { normalizeCustomerEmail, normalizeCustomerPhone } from './customer-normalize.util';
import {
  CUSTOMER_SOURCE,
  normalizeCustomerSource,
} from './customer-source.util';

/** Tag used by E2E scripts — excluded from live CRM lists / campaign audiences. */
export const CUSTOMER_360_TEST_TAG = '__c360_e2e__';

const EVENTS = {
  CREATED: 'CUSTOMER_CREATED',
  UPDATED: 'CUSTOMER_UPDATED',
  EMAIL_ADDED: 'CUSTOMER_EMAIL_ADDED',
  PHONE_ADDED: 'CUSTOMER_PHONE_ADDED',
} as const;

function outboxKey(eventType: string, parts: string[]) {
  return `${eventType}:${parts.join(':')}`;
}

export function isCustomer360TestTag(tags: string[] | null | undefined): boolean {
  return Boolean(tags?.includes(CUSTOMER_360_TEST_TAG));
}

export type ResolveCustomerIngressInput = {
  organizationId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  source: string;
  tags?: string[];
  branchId?: string | null;
  leadSourceId?: string | null;
  /** When set, also claim ZALO/FACEBOOK identity for this customer (additive). */
  messaging?: {
    kind: 'ZALO' | 'FACEBOOK';
    externalUserId: string;
    channelAccountRef?: string | null;
    verifiedAt?: Date | null;
  };
};

export type ResolveCustomerIngressResult =
  | {
      customer: Customer;
      outcome: 'created' | 'reused' | 'filled';
      outboxIds: Array<string | null>;
    }
  | {
      customer: null;
      outcome: 'skipped';
      outboxIds: [];
    };

/**
 * Omnichannel ingress: Normalize → Identity Resolver → Customer → customerId.
 * Never auto-merges conflicting email/phone owners. Cross-org isolated by organizationId.
 */
export async function resolveCustomerForIngress(
  tx: Prisma.TransactionClient,
  input: ResolveCustomerIngressInput,
): Promise<ResolveCustomerIngressResult> {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim() || null;
  if (!normalizeCustomerPhone(phone) && !normalizeCustomerEmail(email)) {
    return { customer: null, outcome: 'skipped', outboxIds: [] };
  }

  const canonicalSource =
    normalizeCustomerSource(input.source) ?? input.source?.trim() ?? null;

  const result = await createOrReuseCustomerSsot(tx, {
    organizationId: input.organizationId,
    name: input.name?.trim() || 'Khách hàng',
    phone,
    email,
    source: canonicalSource ?? input.source,
    tags: input.tags,
    branchId: input.branchId,
    leadSourceId: input.leadSourceId,
  });

  const outboxIds: Array<string | null> = [];
  const row = result.customer;

  if (result.outcome === 'created') {
    outboxIds.push(
      await enqueueCustomerOutboxEvent(tx, {
        organizationId: input.organizationId,
        customerId: row.id,
        eventType: EVENTS.CREATED,
        idempotencyKey: outboxKey(EVENTS.CREATED, [row.id]),
        payload: { email: row.email, phone: row.phone, source: canonicalSource ?? input.source },
      }),
    );
  } else if (result.outcome === 'filled' || result.outcome === 'reused') {
    if (canonicalSource && result.outcome === 'reused') {
      outboxIds.push(
        await enqueueCustomerOutboxEvent(tx, {
          organizationId: input.organizationId,
          customerId: row.id,
          eventType: EVENTS.UPDATED,
          idempotencyKey: outboxKey(EVENTS.UPDATED, [row.id, String(Date.now())]),
          payload: {
            email: row.email,
            phone: row.phone,
            source: canonicalSource,
            latestSource: canonicalSource,
          },
        }),
      );
    } else if (result.outcome === 'filled') {
      outboxIds.push(
        await enqueueCustomerOutboxEvent(tx, {
          organizationId: input.organizationId,
          customerId: row.id,
          eventType: EVENTS.UPDATED,
          idempotencyKey: outboxKey(EVENTS.UPDATED, [row.id, String(Date.now())]),
          payload: {
            email: row.email,
            phone: row.phone,
            source: canonicalSource ?? input.source,
          },
        }),
      );
    }
  }

  if (result.emailAdded) {
    const emailNormalized = normalizeCustomerEmail(row.email);
    outboxIds.push(
      await enqueueCustomerOutboxEvent(tx, {
        organizationId: input.organizationId,
        customerId: row.id,
        eventType: EVENTS.EMAIL_ADDED,
        idempotencyKey: outboxKey(EVENTS.EMAIL_ADDED, [row.id, String(emailNormalized)]),
        payload: { email: emailNormalized },
      }),
    );
  }
  if (result.phoneAdded) {
    const phoneNormalized = normalizeCustomerPhone(row.phone);
    outboxIds.push(
      await enqueueCustomerOutboxEvent(tx, {
        organizationId: input.organizationId,
        customerId: row.id,
        eventType: EVENTS.PHONE_ADDED,
        idempotencyKey: outboxKey(EVENTS.PHONE_ADDED, [row.id, String(phoneNormalized)]),
        payload: { phone: phoneNormalized },
      }),
    );
  }

  if (input.messaging?.externalUserId) {
    const kind =
      input.messaging.kind === 'ZALO'
        ? CustomerIdentityKind.ZALO
        : CustomerIdentityKind.FACEBOOK;
    await claimCustomerIdentity(tx, {
      organizationId: input.organizationId,
      customerId: row.id,
      kind,
      valueNormalized: input.messaging.externalUserId,
      valueRaw: input.messaging.externalUserId,
      channelAccountRef: input.messaging.channelAccountRef ?? '',
      verifiedAt: input.messaging.verifiedAt ?? undefined,
      source: input.source,
    });
  }

  return { customer: row, outcome: result.outcome, outboxIds };
}

type MessagingLinkClient = {
  messagingContactIdentity: Prisma.TransactionClient['messagingContactIdentity'];
  customer: Prisma.TransactionClient['customer'];
  customerIdentity: Prisma.TransactionClient['customerIdentity'];
  customerOutboxEvent: Prisma.TransactionClient['customerOutboxEvent'];
  $executeRaw: Prisma.TransactionClient['$executeRaw'];
};

/**
 * Additive link: MessagingContactIdentity → Customer by phone.
 * - Messenger: requires phoneVerifiedAt; never creates Customer from PSID alone.
 * - Zalo (or Messenger with verified phone): create/reuse Customer via Identity Resolver when missing.
 */
export async function linkMessagingIdentityToCustomerByPhone(
  prisma: MessagingLinkClient,
  organizationId: string,
  identityId: string,
): Promise<{ linked: boolean; customerId?: string; reason?: string }> {
  const tx = prisma as Prisma.TransactionClient;
  const identity = await prisma.messagingContactIdentity.findFirst({
    where: { id: identityId, organizationId, mergedIntoId: null },
  });
  if (!identity) return { linked: false, reason: 'identity_missing' };
  if (identity.customerId) {
    return { linked: true, customerId: identity.customerId, reason: 'already_linked' };
  }

  const phone = identity.phoneNormalized || normalizeCustomerPhone(identity.phoneRaw);
  if (!phone) return { linked: false, reason: 'no_phone' };

  if (identity.channel === 'MESSENGER' && !identity.phoneVerifiedAt) {
    return { linked: false, reason: 'messenger_phone_unverified' };
  }

  const channelRef = identity.integrationScopeKey.split(':').slice(1).join(':') || '';
  const messagingKind = identity.channel === 'ZALO' ? ('ZALO' as const) : ('FACEBOOK' as const);

  let customer = await prisma.customer.findFirst({
    where: {
      organizationId,
      isActive: true,
      mergedIntoId: null,
      phoneNormalized: phone,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!customer) {
    // Never invent a Customer from PSID-only Messenger traffic (gated above).
    // With a verified phone (Zalo or Messenger), resolve via SSOT ingress.
    const resolved = await resolveCustomerForIngress(tx, {
      organizationId,
      name: identity.displayName?.trim() || (messagingKind === 'ZALO' ? 'Khách Zalo' : 'Khách Messenger'),
      phone: identity.phoneRaw || phone,
      source: messagingKind === 'ZALO' ? CUSTOMER_SOURCE.ZALO : CUSTOMER_SOURCE.MESSENGER,
      messaging: {
        kind: messagingKind,
        externalUserId: identity.externalUserId,
        channelAccountRef: channelRef,
        verifiedAt: identity.phoneVerifiedAt,
      },
    });
    if (!resolved.customer) return { linked: false, reason: 'ingress_skipped' };
    customer = resolved.customer;
  } else {
    await claimCustomerIdentity(prisma, {
      organizationId,
      customerId: customer.id,
      kind:
        identity.channel === 'ZALO' ? CustomerIdentityKind.ZALO : CustomerIdentityKind.FACEBOOK,
      valueNormalized: identity.externalUserId,
      valueRaw: identity.externalUserId,
      channelAccountRef: channelRef,
      verifiedAt: identity.phoneVerifiedAt,
      source: 'messaging_link',
    });
    const touchSource =
      identity.channel === 'ZALO' ? CUSTOMER_SOURCE.ZALO : CUSTOMER_SOURCE.MESSENGER;
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        latestSource: touchSource,
        source: touchSource,
      },
    });
  }

  await prisma.messagingContactIdentity.update({
    where: { id: identity.id },
    data: {
      customerId: customer.id,
      linkSource: identity.phoneVerifiedAt
        ? MessagingIdentityLinkSource.PHONE_VERIFIED
        : MessagingIdentityLinkSource.CUSTOMER_ID,
    },
  });

  return { linked: true, customerId: customer.id };
}

/** Backfill funnel events (and similar) after a lead gains customerId. */
export async function backfillLeadCustomerId(
  tx: { marketingFunnelEvent: Prisma.TransactionClient['marketingFunnelEvent'] },
  organizationId: string,
  leadId: string,
  customerId: string,
): Promise<number> {
  const result = await tx.marketingFunnelEvent.updateMany({
    where: { organizationId, leadId, customerId: null },
    data: { customerId },
  });
  return result.count;
}
