import type { Prisma, PrismaClient } from '@prisma/client';
import {
  emailIdentityLock,
  lockCustomer360Identities,
  messagingIdentityLock,
  phoneIdentityLock,
  type Customer360IdentityLock,
} from './customer-360-lock';
import { claimPrimaryEmailPhoneIdentities } from './customer-360-identities';
import { normalizeCustomerEmail, normalizeCustomerPhone } from './customer-normalize.util';

type MergeClient = PrismaClient | Prisma.TransactionClient;

async function collectCustomerIdentityLocks(
  tx: MergeClient,
  organizationId: string,
  customerIds: string[],
): Promise<Customer360IdentityLock[]> {
  const customers = await tx.customer.findMany({
    where: { organizationId, id: { in: customerIds } },
    select: { emailNormalized: true, phoneNormalized: true },
  });
  const identities = await tx.customerIdentity.findMany({
    where: { organizationId, customerId: { in: customerIds } },
    select: { kind: true, valueNormalized: true, channelAccountRef: true },
  });
  const locks: Array<Customer360IdentityLock | null> = [];
  for (const c of customers) {
    locks.push(emailIdentityLock(c.emailNormalized));
    locks.push(phoneIdentityLock(c.phoneNormalized));
  }
  for (const ident of identities) {
    if (ident.kind === 'EMAIL') locks.push(emailIdentityLock(ident.valueNormalized));
    else if (ident.kind === 'PHONE') locks.push(phoneIdentityLock(ident.valueNormalized));
    else if (ident.kind === 'ZALO') {
      locks.push(messagingIdentityLock('ZALO', ident.valueNormalized, ident.channelAccountRef));
    } else if (ident.kind === 'FACEBOOK') {
      locks.push(
        messagingIdentityLock('FACEBOOK', ident.valueNormalized, ident.channelAccountRef),
      );
    }
  }
  return locks.filter((l): l is Customer360IdentityLock => Boolean(l));
}

/**
 * Reassign every CRM Customer FK from secondary → primary.
 * Google Ads `customerId` columns are Ads account IDs — never touched.
 * ChatbotConversation has no customerId; linkage follows MessagingContactIdentity.
 */
export async function reassignCustomerForeignKeys(
  tx: MergeClient,
  organizationId: string,
  fromId: string,
  toId: string,
): Promise<void> {
  if (fromId === toId) return;

  await tx.lead.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.appointment.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.order.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.crmTask.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.automationLog.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.emailContact.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.messagingContactIdentity.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.messagingCampaignRecipient.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.marketingFunnelEvent.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });
  await tx.customerOutboxEvent.updateMany({
    where: { organizationId, customerId: fromId },
    data: { customerId: toId },
  });

  await reassignCustomerIdentities(tx, organizationId, fromId, toId);
  await reassignCampaignCustomers(tx, fromId, toId);
}

async function reassignCustomerIdentities(
  tx: MergeClient,
  organizationId: string,
  fromId: string,
  toId: string,
) {
  const fromRows = await tx.customerIdentity.findMany({
    where: { organizationId, customerId: fromId },
  });
  for (const ident of fromRows) {
    const clash = await tx.customerIdentity.findUnique({
      where: {
        organizationId_kind_valueNormalized_channelAccountRef: {
          organizationId,
          kind: ident.kind,
          valueNormalized: ident.valueNormalized,
          channelAccountRef: ident.channelAccountRef,
        },
      },
    });
    if (clash && clash.id !== ident.id && clash.customerId === toId) {
      await tx.customerIdentity.delete({ where: { id: ident.id } });
      continue;
    }
    await tx.customerIdentity.update({
      where: { id: ident.id },
      data: { customerId: toId, isPrimary: false },
    });
  }
}

async function reassignCampaignCustomers(
  tx: MergeClient,
  fromId: string,
  toId: string,
) {
  const links = await tx.campaignCustomer.findMany({ where: { customerId: fromId } });
  for (const link of links) {
    const exists = await tx.campaignCustomer.findUnique({
      where: { campaignId_customerId: { campaignId: link.campaignId, customerId: toId } },
    });
    await tx.campaignCustomer.delete({
      where: { campaignId_customerId: { campaignId: link.campaignId, customerId: fromId } },
    });
    if (!exists) {
      await tx.campaignCustomer.create({
        data: { campaignId: link.campaignId, customerId: toId },
      });
    }
  }
}

export async function mergeCustomersSsot(
  tx: MergeClient,
  input: {
    organizationId: string;
    primaryId: string;
    secondaryId: string;
    mergedByUserId?: string | null;
  },
): Promise<{ outboxId: string | null }> {
  const { organizationId, primaryId, secondaryId } = input;
  const [primary, secondary] = await Promise.all([
    tx.customer.findFirst({ where: { id: primaryId, organizationId } }),
    tx.customer.findFirst({ where: { id: secondaryId, organizationId } }),
  ]);
  if (!primary || !secondary) {
    throw new Error('Customer merge: hồ sơ không tồn tại');
  }

  await lockCustomer360Identities(
    tx,
    organizationId,
    await collectCustomerIdentityLocks(tx, organizationId, [primaryId, secondaryId]),
  );

  const [freshPrimary, freshSecondary] = await Promise.all([
    tx.customer.findFirst({ where: { id: primaryId, organizationId } }),
    tx.customer.findFirst({ where: { id: secondaryId, organizationId } }),
  ]);
  if (!freshPrimary || !freshSecondary) {
    throw new Error('Customer merge: hồ sơ không tồn tại');
  }
  if (freshSecondary.mergedIntoId === primaryId && !freshSecondary.isActive) {
    return { outboxId: null };
  }

  // Re-lock after fresh read so EMAIL→PHONE→ZALO→FACEBOOK order includes any newly claimed identities.
  await lockCustomer360Identities(
    tx,
    organizationId,
    await collectCustomerIdentityLocks(tx, organizationId, [primaryId, secondaryId]),
  );

  await reassignCustomerForeignKeys(tx, organizationId, secondaryId, primaryId);

  const nextPhone = freshPrimary.phone || freshSecondary.phone;
  const nextEmail = freshPrimary.email || freshSecondary.email;
  const mergedTags = [...new Set([...(freshPrimary.tags ?? []), ...(freshSecondary.tags ?? [])])];

  await tx.customer.update({
    where: { id: primaryId },
    data: {
      phone: nextPhone,
      email: nextEmail,
      phoneNormalized: normalizeCustomerPhone(nextPhone),
      emailNormalized: normalizeCustomerEmail(nextEmail),
      note:
        [freshPrimary.note, freshSecondary.note].filter(Boolean).join('\n---\n') ||
        freshPrimary.note,
      tags: mergedTags,
      assignedEmployeeId: freshPrimary.assignedEmployeeId || freshSecondary.assignedEmployeeId,
      leadSourceId: freshPrimary.leadSourceId || freshSecondary.leadSourceId,
    },
  });

  await tx.customer.update({
    where: { id: secondaryId },
    data: { isActive: false, mergedIntoId: primaryId },
  });

  await claimPrimaryEmailPhoneIdentities(tx, {
    organizationId,
    customerId: primaryId,
    emailRaw: nextEmail,
    phoneRaw: nextPhone,
    source: 'crm_merge',
    throwOnConflict: false,
  });

  await tx.customerMergeLog.create({
    data: {
      organizationId,
      primaryId,
      secondaryId,
      mergedByUserId: input.mergedByUserId ?? undefined,
      snapshot: {
        secondaryId,
        primaryBefore: { email: primary.email, phone: primary.phone },
      } as Prisma.InputJsonValue,
    },
  });

  const idempotencyKey = `CUSTOMER_MERGED:${primaryId}:${secondaryId}`;
  try {
    const row = await tx.customerOutboxEvent.create({
      data: {
        organizationId,
        customerId: primaryId,
        eventType: 'CUSTOMER_MERGED',
        idempotencyKey,
        payload: {
          secondaryCustomerId: secondaryId,
          email: nextEmail,
          phone: nextPhone,
        },
        status: 'PENDING',
      },
    });
    return { outboxId: row.id };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') return { outboxId: null };
    throw err;
  }
}
