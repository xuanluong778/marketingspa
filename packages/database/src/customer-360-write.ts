import { CustomerIdentityKind, type Customer, Prisma } from '@prisma/client';
import {
  emailIdentityLock,
  lockCustomer360Identities,
  phoneIdentityLock,
} from './customer-360-lock';
import {
  CustomerEmailPhoneSplitError,
  CustomerIdentityConflictError,
  claimPrimaryEmailPhoneIdentities,
} from './customer-360-identities';
import { normalizeCustomerEmail, normalizeCustomerPhone } from './customer-normalize.util';
import {
  applyCustomerSourceFields,
  normalizeCustomerSource,
} from './customer-source.util';

export type CustomerSsotWriteInput = {
  organizationId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  gender?: Prisma.CustomerCreateInput['gender'];
  birthday?: Date | null;
  note?: string | null;
  tags?: string[];
  source?: string | null;
  leadSourceId?: string | null;
  branchId?: string | null;
};

export type CustomerSsotWriteResult = {
  customer: Customer;
  outcome: 'created' | 'reused' | 'filled';
  emailAdded: boolean;
  phoneAdded: boolean;
};

async function ownerFromIdentity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  kind: CustomerIdentityKind,
  valueNormalized: string | null,
) {
  if (!valueNormalized) return null;
  const ident = await tx.customerIdentity.findUnique({
    where: {
      organizationId_kind_valueNormalized_channelAccountRef: {
        organizationId,
        kind,
        valueNormalized,
        channelAccountRef: '',
      },
    },
  });
  if (!ident) return null;
  const owner = await tx.customer.findFirst({
    where: { id: ident.customerId, organizationId },
  });
  if (!owner) return null;
  if (owner.mergedIntoId) {
    return tx.customer.findFirst({
      where: { id: owner.mergedIntoId, organizationId, isActive: true, mergedIntoId: null },
    });
  }
  return owner.isActive ? owner : null;
}

async function findActiveByNormalized(
  tx: Prisma.TransactionClient,
  organizationId: string,
  emailNormalized: string | null,
  phoneNormalized: string | null,
) {
  const [phoneMatch, emailMatch, phoneIdent, emailIdent] = await Promise.all([
    phoneNormalized
      ? tx.customer.findFirst({
          where: { organizationId, isActive: true, mergedIntoId: null, phoneNormalized },
        })
      : Promise.resolve(null),
    emailNormalized
      ? tx.customer.findFirst({
          where: { organizationId, isActive: true, mergedIntoId: null, emailNormalized },
        })
      : Promise.resolve(null),
    ownerFromIdentity(tx, organizationId, CustomerIdentityKind.PHONE, phoneNormalized),
    ownerFromIdentity(tx, organizationId, CustomerIdentityKind.EMAIL, emailNormalized),
  ]);
  const phoneOwner = phoneMatch || phoneIdent;
  const emailOwner = emailMatch || emailIdent;
  if (phoneOwner && emailOwner && phoneOwner.id !== emailOwner.id) {
    throw new CustomerEmailPhoneSplitError(organizationId, emailOwner.id, phoneOwner.id);
  }
  return phoneOwner || emailOwner;
}

/**
 * Customer write + EMAIL/PHONE identity claim in the same transaction.
 * Callers must enqueue OutboxEvent in this same tx after this returns.
 */
export async function createOrReuseCustomerSsot(
  tx: Prisma.TransactionClient,
  input: CustomerSsotWriteInput,
): Promise<CustomerSsotWriteResult> {
  const phoneNormalized = normalizeCustomerPhone(input.phone);
  const emailNormalized = normalizeCustomerEmail(input.email);

  await lockCustomer360Identities(tx, input.organizationId, [
    emailIdentityLock(emailNormalized),
    phoneIdentityLock(phoneNormalized),
  ]);

  const existing = await findActiveByNormalized(
    tx,
    input.organizationId,
    emailNormalized,
    phoneNormalized,
  );

  if (existing) {
    const fill: Prisma.CustomerUpdateInput = {};
    let emailAdded = false;
    let phoneAdded = false;
    if (!existing.phoneNormalized && phoneNormalized) {
      fill.phone = input.phone?.trim() || existing.phone;
      fill.phoneNormalized = phoneNormalized;
      phoneAdded = true;
    }
    if (!existing.emailNormalized && emailNormalized) {
      fill.email = input.email?.trim() || existing.email;
      fill.emailNormalized = emailNormalized;
      emailAdded = true;
    }

    const sourceFields = applyCustomerSourceFields(input.source, false);
    if (sourceFields.latestSource) {
      Object.assign(fill, sourceFields);
    }

    const row =
      Object.keys(fill).length === 0
        ? existing
        : await tx.customer.update({ where: { id: existing.id }, data: fill });

    await claimPrimaryEmailPhoneIdentities(tx, {
      organizationId: input.organizationId,
      customerId: row.id,
      emailRaw: row.email,
      phoneRaw: row.phone,
      source: 'crm',
      throwOnConflict: true,
    });

    return {
      customer: row,
      outcome: Object.keys(fill).length === 0 ? 'reused' : 'filled',
      emailAdded,
      phoneAdded,
    };
  }

  const sourceFields = applyCustomerSourceFields(input.source, true);

  const created = await tx.customer.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      phoneNormalized,
      emailNormalized,
      gender: input.gender,
      birthday: input.birthday ?? undefined,
      note: input.note,
      tags: input.tags ?? [],
      source: sourceFields.source ?? normalizeCustomerSource(input.source) ?? input.source,
      firstSource: sourceFields.firstSource,
      latestSource: sourceFields.latestSource,
      leadSourceId: input.leadSourceId,
      branchId: input.branchId,
    },
  });

  await claimPrimaryEmailPhoneIdentities(tx, {
    organizationId: input.organizationId,
    customerId: created.id,
    emailRaw: created.email,
    phoneRaw: created.phone,
    source: 'crm',
    throwOnConflict: true,
  });

  return { customer: created, outcome: 'created', emailAdded: Boolean(emailNormalized), phoneAdded: Boolean(phoneNormalized) };
}

export async function applyCustomerSsotUpdate(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    customerId: string;
    currentEmailNormalized: string | null;
    currentPhoneNormalized: string | null;
    nextEmail: string | null;
    nextPhone: string | null;
    data: Prisma.CustomerUpdateInput;
  },
): Promise<Customer> {
  const emailNormalized = normalizeCustomerEmail(input.nextEmail);
  const phoneNormalized = normalizeCustomerPhone(input.nextPhone);

  await lockCustomer360Identities(tx, input.organizationId, [
    emailIdentityLock(input.currentEmailNormalized),
    phoneIdentityLock(input.currentPhoneNormalized),
    emailIdentityLock(emailNormalized),
    phoneIdentityLock(phoneNormalized),
  ]);

  const fresh = await tx.customer.findFirst({
    where: { id: input.customerId, organizationId: input.organizationId },
  });
  if (!fresh || !fresh.isActive) {
    throw new Error('Customer update: hồ sơ không tồn tại hoặc đã merge');
  }

  // Re-lock after fresh read in case normalized fields drifted concurrently.
  await lockCustomer360Identities(tx, input.organizationId, [
    emailIdentityLock(fresh.emailNormalized),
    phoneIdentityLock(fresh.phoneNormalized),
    emailIdentityLock(emailNormalized),
    phoneIdentityLock(phoneNormalized),
  ]);

  if (phoneNormalized && phoneNormalized !== fresh.phoneNormalized) {
    const taken = await tx.customer.findFirst({
      where: {
        organizationId: input.organizationId,
        isActive: true,
        mergedIntoId: null,
        phoneNormalized,
        id: { not: input.customerId },
      },
    });
    if (taken) {
      throw new CustomerIdentityConflictError(
        input.organizationId,
        taken.id,
        'PHONE',
        phoneNormalized,
      );
    }
  }
  if (emailNormalized && emailNormalized !== fresh.emailNormalized) {
    const taken = await tx.customer.findFirst({
      where: {
        organizationId: input.organizationId,
        isActive: true,
        mergedIntoId: null,
        emailNormalized,
        id: { not: input.customerId },
      },
    });
    if (taken) {
      throw new CustomerIdentityConflictError(
        input.organizationId,
        taken.id,
        'EMAIL',
        emailNormalized,
      );
    }
  }

  const row = await tx.customer.update({
    where: { id: input.customerId },
    data: {
      ...input.data,
      phone: input.nextPhone,
      email: input.nextEmail,
      phoneNormalized,
      emailNormalized,
    },
  });

  await claimPrimaryEmailPhoneIdentities(tx, {
    organizationId: input.organizationId,
    customerId: input.customerId,
    emailRaw: row.email,
    phoneRaw: row.phone,
    source: 'crm',
    throwOnConflict: true,
  });

  return row;
}
