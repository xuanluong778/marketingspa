import { PrismaClient } from '@prisma/client';
import { applyPrismaPoolEnv } from './prisma-url';

applyPrismaPoolEnv();

/** Singleton Prisma client - dùng chung cho api và worker */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export { withPrismaPoolParams, applyPrismaPoolEnv } from './prisma-url';
export * from '@prisma/client';
export * from './hrm-attendance-calc';
export * from './hrm-leave-calc';
export * from './messaging-phone.util';
export * from './customer-normalize.util';
export * from './customer-source.util';
export { projectCustomer360Event } from './customer-360-projector';
export type { CustomerOutboxPayload, Customer360Client } from './customer-360-projector';
export {
  lockCustomer360Keys,
  lockCustomer360Identities,
  customer360EmailLockKey,
  customer360PhoneLockKey,
  customer360CustomerLockKey,
  emailIdentityLock,
  phoneIdentityLock,
  messagingIdentityLock,
  CUSTOMER_360_LOCK_KIND_ORDER,
} from './customer-360-lock';
export type {
  Customer360LockKind,
  Customer360IdentityLock,
} from './customer-360-lock';
export {
  claimCustomerIdentity,
  claimPrimaryEmailPhoneIdentities,
  CustomerIdentityConflictError,
  CustomerEmailPhoneSplitError,
} from './customer-360-identities';
export type { Customer360Db } from './customer-360-identities';
export {
  createOrReuseCustomerSsot,
  applyCustomerSsotUpdate,
} from './customer-360-write';
export type { CustomerSsotWriteInput, CustomerSsotWriteResult } from './customer-360-write';
export { reassignCustomerForeignKeys, mergeCustomersSsot } from './customer-360-merge';
export {
  enqueueCustomerOutboxEvent,
  processCustomerOutboxEvent,
  drainCustomerOutbox,
} from './customer-360-outbox';
export type { CustomerOutboxEnqueueInput } from './customer-360-outbox';
export {
  resolveCustomerForIngress,
  linkMessagingIdentityToCustomerByPhone,
  backfillLeadCustomerId,
  CUSTOMER_360_TEST_TAG,
  isCustomer360TestTag,
} from './customer-360-ingress';
export type {
  ResolveCustomerIngressInput,
  ResolveCustomerIngressResult,
} from './customer-360-ingress';
export { CreditLedger, CreditError } from './credit-ledger';
export type {
  CreditBalanceSnapshot,
  CreditMutationResult,
  PaidFeatureContext,
  RunPaidFeatureParams,
} from './credit-ledger';
