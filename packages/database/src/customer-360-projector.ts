import {
  CustomerIdentityKind,
  EmailContactStatus,
  EmailSuppressionReason,
  MessagingIdentityLinkSource,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { claimCustomerIdentity, claimPrimaryEmailPhoneIdentities } from './customer-360-identities';
import { reassignCustomerForeignKeys } from './customer-360-merge';
import { normalizeCustomerEmail, normalizeCustomerPhone } from './customer-normalize.util';
import {
  emailIdentityLock,
  lockCustomer360Identities,
  messagingIdentityLock,
  phoneIdentityLock,
  type Customer360IdentityLock,
} from './customer-360-lock';

export type Customer360Client = PrismaClient | Prisma.TransactionClient;

export type CustomerOutboxPayload = {
  organizationId: string;
  customerId: string;
  eventType: string;
  previousEmail?: string | null;
  previousPhone?: string | null;
  email?: string | null;
  phone?: string | null;
  secondaryCustomerId?: string | null;
};

/** Never overwrite unsubscribe / bounce / complaint consent from CRM projection. */
const CONSENT_LOCKED = new Set<EmailContactStatus>([
  EmailContactStatus.UNSUBSCRIBED,
  EmailContactStatus.BOUNCED,
]);

function statusFromSuppression(reason: EmailSuppressionReason): EmailContactStatus {
  if (reason === EmailSuppressionReason.BOUNCE) return EmailContactStatus.BOUNCED;
  // COMPLAINT / UNSUBSCRIBE / MANUAL → UNSUBSCRIBED (no COMPLAINED enum on EmailContact)
  return EmailContactStatus.UNSUBSCRIBED;
}

function isConsentLocked(
  status: EmailContactStatus,
  suppression: { reason: EmailSuppressionReason } | null,
): boolean {
  if (CONSENT_LOCKED.has(status)) return true;
  if (!suppression) return false;
  return (
    suppression.reason === EmailSuppressionReason.COMPLAINT ||
    suppression.reason === EmailSuppressionReason.UNSUBSCRIBE ||
    suppression.reason === EmailSuppressionReason.BOUNCE
  );
}

async function projectEmailContact(prisma: Customer360Client, organizationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) return { skipped: 'customer_missing' as const };
  const email = normalizeCustomerEmail(customer.email) || customer.emailNormalized;
  if (!email) return { skipped: 'no_email' as const };

  const suppression = await prisma.emailSuppression.findUnique({
    where: { organizationId_email: { organizationId, email } },
  });
  const suppressedStatus = suppression ? statusFromSuppression(suppression.reason) : null;

  const ownedSameEmail = await prisma.emailContact.findFirst({
    where: { organizationId, customerId, email },
  });
  const byEmail = await prisma.emailContact.findFirst({
    where: { organizationId, email },
  });

  if (byEmail && byEmail.customerId && byEmail.customerId !== customerId) {
    return { skipped: 'email_owned_by_other_customer' as const, otherCustomerId: byEmail.customerId };
  }

  const projectionFields = {
    name: customer.name,
    phone: customer.phone,
    customerId,
    source: 'CRM' as const,
  };

  if (ownedSameEmail) {
    // Never rewrite status (UNSUBSCRIBED/BOUNCED/COMPLAINED) or campaign recipient email snapshots.
    await prisma.emailContact.update({
      where: { id: ownedSameEmail.id },
      data: {
        name: projectionFields.name,
        phone: projectionFields.phone || ownedSameEmail.phone,
        customerId,
        source: ownedSameEmail.source || 'CRM',
      },
    });
    return {
      updated: ownedSameEmail.id,
      consentPreserved: isConsentLocked(ownedSameEmail.status, suppression),
    };
  }

  if (byEmail) {
    const locked = isConsentLocked(byEmail.status, suppression);
    await prisma.emailContact.update({
      where: { id: byEmail.id },
      data: {
        name: projectionFields.name,
        phone: projectionFields.phone || byEmail.phone,
        customerId,
        source: byEmail.source || 'CRM',
        // status intentionally omitted — preserve UNSUBSCRIBED/BOUNCED/complaint mapping
      },
    });
    return { updated: byEmail.id, consentPreserved: locked };
  }

  const created = await prisma.emailContact.create({
    data: {
      organizationId,
      email,
      name: customer.name,
      phone: customer.phone,
      customerId,
      source: 'CRM',
      status: suppressedStatus ?? EmailContactStatus.SUBSCRIBED,
      unsubscribedAt:
        suppressedStatus === EmailContactStatus.UNSUBSCRIBED ? new Date() : undefined,
    },
  });
  return { created: created.id, consentFromSuppression: Boolean(suppressedStatus) };
}

async function projectMessagingLinks(prisma: Customer360Client, organizationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) return { linked: 0 };
  const phone = customer.phoneNormalized || normalizeCustomerPhone(customer.phone);
  if (!phone) return { linked: 0 };

  const identities = await prisma.messagingContactIdentity.findMany({
    where: {
      organizationId,
      phoneNormalized: phone,
      mergedIntoId: null,
      OR: [{ customerId: null }, { customerId }],
    },
  });

  const locks: Customer360IdentityLock[] = [
    emailIdentityLock(customer.emailNormalized),
    phoneIdentityLock(phone),
  ].filter((l): l is Customer360IdentityLock => Boolean(l));
  for (const identity of identities) {
    const isMessenger = identity.channel === 'MESSENGER';
    const isZalo = identity.channel === 'ZALO';
    if (!isMessenger && !isZalo) continue;
    if (isMessenger && !identity.phoneVerifiedAt) continue;
    const kind = isZalo ? 'ZALO' : 'FACEBOOK';
    const ref = identity.integrationScopeKey.split(':').slice(1).join(':') || '';
    const lock = messagingIdentityLock(kind, identity.externalUserId, ref);
    if (lock) locks.push(lock);
  }
  if (typeof (prisma as { $executeRaw?: unknown }).$executeRaw === 'function') {
    await lockCustomer360Identities(
      prisma as { $executeRaw: Prisma.TransactionClient['$executeRaw'] },
      organizationId,
      locks,
    );
  }

  let linked = 0;
  for (const identity of identities) {
    const isMessenger = identity.channel === 'MESSENGER';
    const isZalo = identity.channel === 'ZALO';
    if (!isMessenger && !isZalo) continue;
    if (isMessenger && !identity.phoneVerifiedAt) continue;
    if (identity.customerId && identity.customerId !== customerId) continue;

    if (!identity.customerId) {
      await prisma.messagingContactIdentity.update({
        where: { id: identity.id },
        data: {
          customerId,
          linkSource: identity.phoneVerifiedAt
            ? MessagingIdentityLinkSource.PHONE_VERIFIED
            : MessagingIdentityLinkSource.CUSTOMER_ID,
        },
      });
      linked += 1;
    }

    const kind = isZalo ? CustomerIdentityKind.ZALO : CustomerIdentityKind.FACEBOOK;
    const ref = identity.integrationScopeKey.split(':').slice(1).join(':') || '';
    await claimCustomerIdentity(prisma, {
      organizationId,
      customerId,
      kind,
      valueNormalized: identity.externalUserId,
      valueRaw: identity.externalUserId,
      channelAccountRef: ref,
      verifiedAt: identity.phoneVerifiedAt,
      source: 'messaging_link',
    });
  }
  return { linked };
}

async function projectConvertedLeads(prisma: Customer360Client, organizationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) return { updated: 0 };
  const result = await prisma.lead.updateMany({
    where: { organizationId, customerId },
    data: {
      email: customer.email,
      phone: customer.phone,
    },
  });
  return { updated: result.count };
}

export async function projectCustomer360Event(
  prisma: Customer360Client,
  event: {
    eventType: string;
    organizationId: string;
    customerId: string;
    payload?: CustomerOutboxPayload | Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const { eventType, organizationId, customerId } = event;
  const payload = (event.payload || {}) as CustomerOutboxPayload;

  if (eventType === 'CUSTOMER_MERGED') {
    const secondary = payload.secondaryCustomerId;
    if (secondary) {
      await reassignCustomerForeignKeys(prisma, organizationId, secondary, customerId);
    }
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
  });
  if (!customer) return { skipped: 'customer_missing' };

  if (typeof (prisma as { $executeRaw?: unknown }).$executeRaw === 'function') {
    await lockCustomer360Identities(
      prisma as { $executeRaw: Prisma.TransactionClient['$executeRaw'] },
      organizationId,
      [
        emailIdentityLock(customer.emailNormalized || normalizeCustomerEmail(customer.email)),
        phoneIdentityLock(customer.phoneNormalized || normalizeCustomerPhone(customer.phone)),
      ],
    );
  }

  await claimPrimaryEmailPhoneIdentities(prisma, {
    organizationId,
    customerId,
    emailRaw: customer.email,
    phoneRaw: customer.phone,
    source: 'crm',
    throwOnConflict: false,
  });
  const email = await projectEmailContact(prisma, organizationId, customerId);
  const messaging = await projectMessagingLinks(prisma, organizationId, customerId);
  const leads = await projectConvertedLeads(prisma, organizationId, customerId);
  return { eventType, email, messaging, leads };
}
