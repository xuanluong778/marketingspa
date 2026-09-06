import { CustomerIdentityKind, Prisma } from '@prisma/client';
import { normalizeCustomerEmail, normalizeCustomerPhone } from './customer-normalize.util';

export type Customer360Db = Prisma.TransactionClient | {
  customerIdentity: Prisma.TransactionClient['customerIdentity'];
};

export class CustomerIdentityConflictError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly otherCustomerId: string,
    public readonly kind: CustomerIdentityKind,
    public readonly valueNormalized: string,
  ) {
    super(
      `Identity ${kind}=${valueNormalized} already owned by customer ${otherCustomerId} in org ${organizationId}`,
    );
    this.name = 'CustomerIdentityConflictError';
  }
}

export class CustomerEmailPhoneSplitError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly emailCustomerId: string,
    public readonly phoneCustomerId: string,
  ) {
    super(
      `Email and phone belong to different customers (${emailCustomerId} vs ${phoneCustomerId}) — no auto-merge`,
    );
    this.name = 'CustomerEmailPhoneSplitError';
  }
}

export async function claimCustomerIdentity(
  prisma: Customer360Db,
  input: {
    organizationId: string;
    customerId: string;
    kind: CustomerIdentityKind;
    valueNormalized: string;
    valueRaw?: string | null;
    channelAccountRef?: string;
    isPrimary?: boolean;
    verifiedAt?: Date | null;
    source: string;
  },
): Promise<'created' | 'owned' | 'conflict'> {
  // EMAIL/PHONE are org-global; never scope by channel account (DB CHECK enforces '').
  const ref =
    input.kind === CustomerIdentityKind.EMAIL || input.kind === CustomerIdentityKind.PHONE
      ? ''
      : input.channelAccountRef ?? '';
  const existing = await prisma.customerIdentity.findUnique({
    where: {
      organizationId_kind_valueNormalized_channelAccountRef: {
        organizationId: input.organizationId,
        kind: input.kind,
        valueNormalized: input.valueNormalized,
        channelAccountRef: ref,
      },
    },
  });
  if (existing) {
    if (existing.customerId !== input.customerId) return 'conflict';
    await prisma.customerIdentity.update({
      where: { id: existing.id },
      data: {
        isPrimary: input.isPrimary ?? existing.isPrimary,
        valueRaw: input.valueRaw ?? existing.valueRaw,
        verifiedAt: input.verifiedAt ?? existing.verifiedAt,
      },
    });
    return 'owned';
  }
  try {
    await prisma.customerIdentity.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        kind: input.kind,
        valueNormalized: input.valueNormalized,
        valueRaw: input.valueRaw,
        channelAccountRef: ref,
        isPrimary: input.isPrimary ?? false,
        verifiedAt: input.verifiedAt ?? undefined,
        source: input.source,
      },
    });
    return 'created';
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await prisma.customerIdentity.findUnique({
        where: {
          organizationId_kind_valueNormalized_channelAccountRef: {
            organizationId: input.organizationId,
            kind: input.kind,
            valueNormalized: input.valueNormalized,
            channelAccountRef: ref,
          },
        },
      });
      if (raced?.customerId === input.customerId) return 'owned';
      return 'conflict';
    }
    throw err;
  }
}

export async function claimPrimaryEmailPhoneIdentities(
  prisma: Customer360Db,
  input: {
    organizationId: string;
    customerId: string;
    emailRaw?: string | null;
    phoneRaw?: string | null;
    source: string;
    throwOnConflict?: boolean;
  },
): Promise<{ email: 'created' | 'owned' | 'conflict' | 'skipped'; phone: 'created' | 'owned' | 'conflict' | 'skipped' }> {
  const emailNorm = normalizeCustomerEmail(input.emailRaw);
  const phoneNorm = normalizeCustomerPhone(input.phoneRaw);
  let email: 'created' | 'owned' | 'conflict' | 'skipped' = 'skipped';
  let phone: 'created' | 'owned' | 'conflict' | 'skipped' = 'skipped';

  if (emailNorm) {
    email = await claimCustomerIdentity(prisma, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      kind: CustomerIdentityKind.EMAIL,
      valueNormalized: emailNorm,
      valueRaw: input.emailRaw?.trim() || emailNorm,
      isPrimary: true,
      source: input.source,
    });
    if (email === 'conflict' && input.throwOnConflict) {
      const owner = await prisma.customerIdentity.findUnique({
        where: {
          organizationId_kind_valueNormalized_channelAccountRef: {
            organizationId: input.organizationId,
            kind: CustomerIdentityKind.EMAIL,
            valueNormalized: emailNorm,
            channelAccountRef: '',
          },
        },
      });
      throw new CustomerIdentityConflictError(
        input.organizationId,
        owner?.customerId || 'unknown',
        CustomerIdentityKind.EMAIL,
        emailNorm,
      );
    }
    if (email !== 'conflict') {
      await prisma.customerIdentity.updateMany({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          kind: CustomerIdentityKind.EMAIL,
          valueNormalized: { not: emailNorm },
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }
  }

  if (phoneNorm) {
    phone = await claimCustomerIdentity(prisma, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      kind: CustomerIdentityKind.PHONE,
      valueNormalized: phoneNorm,
      valueRaw: input.phoneRaw?.trim() || phoneNorm,
      isPrimary: true,
      source: input.source,
    });
    if (phone === 'conflict' && input.throwOnConflict) {
      const owner = await prisma.customerIdentity.findUnique({
        where: {
          organizationId_kind_valueNormalized_channelAccountRef: {
            organizationId: input.organizationId,
            kind: CustomerIdentityKind.PHONE,
            valueNormalized: phoneNorm,
            channelAccountRef: '',
          },
        },
      });
      throw new CustomerIdentityConflictError(
        input.organizationId,
        owner?.customerId || 'unknown',
        CustomerIdentityKind.PHONE,
        phoneNorm,
      );
    }
    if (phone !== 'conflict') {
      await prisma.customerIdentity.updateMany({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          kind: CustomerIdentityKind.PHONE,
          valueNormalized: { not: phoneNorm },
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }
  }

  return { email, phone };
}
