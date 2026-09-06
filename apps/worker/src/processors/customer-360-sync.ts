import { Job } from 'bullmq';
import { drainCustomerOutbox, prisma, processCustomerOutboxEvent } from '@marketingspa/database';

export async function processCustomer360Sync(job: Job<{ outboxId?: string; drain?: boolean }>) {
  if (job.name === 'drain-pending' || job.data?.drain) {
    return drainCustomerOutbox(prisma, 40);
  }
  const outboxId = job.data?.outboxId;
  if (!outboxId) return { skipped: true, reason: 'missing_outbox_id' };
  return processCustomerOutboxEvent(prisma, outboxId);
}
