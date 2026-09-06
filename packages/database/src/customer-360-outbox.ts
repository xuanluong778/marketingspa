import { CustomerOutboxStatus, Prisma, type PrismaClient } from '@prisma/client';
import { projectCustomer360Event } from './customer-360-projector';

const STALE_PROCESSING_MS = 2 * 60 * 1000;

export type CustomerOutboxEnqueueInput = {
  organizationId: string;
  customerId: string;
  eventType: string;
  idempotencyKey: string;
  payload?: Prisma.InputJsonValue;
};

type OutboxWriteClient = {
  customerOutboxEvent: Prisma.TransactionClient['customerOutboxEvent'];
};

type OutboxClient = PrismaClient;

export async function enqueueCustomerOutboxEvent(
  tx: OutboxWriteClient,
  input: CustomerOutboxEnqueueInput,
): Promise<string | null> {
  try {
    const row = await tx.customerOutboxEvent.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload ?? {},
        status: 'PENDING',
      },
    });
    return row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return null;
    }
    throw err;
  }
}

async function reclaimStaleProcessing(prisma: OutboxClient) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  await prisma.customerOutboxEvent.updateMany({
    where: {
      status: CustomerOutboxStatus.PROCESSING,
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: CustomerOutboxStatus.FAILED,
      lastError: 'stale_processing_reclaimed',
    },
  });
}

export async function drainCustomerOutbox(prisma: OutboxClient, limit = 40) {
  await reclaimStaleProcessing(prisma);
  const pending = await prisma.customerOutboxEvent.findMany({
    where: { status: { in: [CustomerOutboxStatus.PENDING, CustomerOutboxStatus.FAILED] } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  const results = [];
  for (const row of pending) {
    results.push(await processCustomerOutboxEvent(prisma, row.id));
  }
  return { drained: results.length, results };
}

export async function processCustomerOutboxEvent(prisma: OutboxClient, outboxId: string) {
  const claimed = await prisma.customerOutboxEvent.updateMany({
    where: {
      id: outboxId,
      status: { in: [CustomerOutboxStatus.PENDING, CustomerOutboxStatus.FAILED] },
    },
    data: {
      status: CustomerOutboxStatus.PROCESSING,
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    const existing = await prisma.customerOutboxEvent.findUnique({ where: { id: outboxId } });
    if (existing?.status === CustomerOutboxStatus.DONE) {
      return { idempotent: true, outboxId };
    }
    if (existing?.status === CustomerOutboxStatus.PROCESSING) {
      const stale = Date.now() - existing.updatedAt.getTime() > STALE_PROCESSING_MS;
      if (!stale) return { skipped: true, reason: 'already_processing', outboxId };
      await prisma.customerOutboxEvent.update({
        where: { id: outboxId },
        data: { status: CustomerOutboxStatus.FAILED, lastError: 'stale_processing_reclaimed' },
      });
      return processCustomerOutboxEvent(prisma, outboxId);
    }
    return { skipped: true, reason: 'not_found', outboxId };
  }

  const event = await prisma.customerOutboxEvent.findUnique({ where: { id: outboxId } });
  if (!event) return { skipped: true, reason: 'not_found', outboxId };

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const projected = await projectCustomer360Event(tx, {
          eventType: event.eventType,
          organizationId: event.organizationId,
          customerId: event.customerId,
          payload: (event.payload || {}) as Record<string, unknown>,
        });
        await tx.customerOutboxEvent.update({
          where: { id: outboxId },
          data: {
            status: CustomerOutboxStatus.DONE,
            processedAt: new Date(),
            lastError: null,
          },
        });
        return projected;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    return { ok: true, outboxId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.customerOutboxEvent.update({
      where: { id: outboxId },
      data: {
        status: CustomerOutboxStatus.FAILED,
        lastError: message.slice(0, 2000),
      },
    });
    throw err;
  }
}
