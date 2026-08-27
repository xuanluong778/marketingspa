import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { enqueueCustomerOutboxEvent, Prisma } from '@marketingspa/database';
import {
  CUSTOMER_360_EVENTS,
  customerOutboxIdempotencyKey,
  customerOutboxJobId,
  type Customer360EventType,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CUSTOMER_360_QUEUE } from '../queue/queue.constants';

export type CustomerOutboxEnqueue = {
  organizationId: string;
  customerId: string;
  eventType: Customer360EventType;
  idempotencyParts: string[];
  payload?: Prisma.InputJsonValue;
};

@Injectable()
export class CustomerOutboxService {
  private readonly logger = new Logger(CustomerOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CUSTOMER_360_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(
    tx: { customerOutboxEvent: PrismaService['customerOutboxEvent'] },
    input: CustomerOutboxEnqueue,
  ): Promise<string | null> {
    return enqueueCustomerOutboxEvent(tx, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      eventType: input.eventType,
      idempotencyKey: customerOutboxIdempotencyKey(input.eventType, input.idempotencyParts),
      payload: input.payload ?? {},
    });
  }

  async dispatch(outboxIds: Array<string | null | undefined>) {
    const ids = [...new Set(outboxIds.filter((id): id is string => Boolean(id)))];
    for (const id of ids) {
      try {
        await this.queue.add(
          'project',
          { outboxId: id },
          {
            jobId: customerOutboxJobId(id),
            attempts: 8,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 200,
            removeOnFail: 100,
          },
        );
      } catch (err) {
        this.logger.warn(
          `Outbox enqueue BullMQ failed for ${id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  events() {
    return CUSTOMER_360_EVENTS;
  }
}
