import { Inject, Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { EMAIL_CAMPAIGN_PLAN_QUEUE, EMAIL_CAMPAIGN_SEND_QUEUE } from '../queue/queue.constants';
import { EMAIL_SEND_ATTEMPTS, EMAIL_SEND_BACKOFF_MS } from '@marketingspa/shared';

const PLAN_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 500,
  removeOnFail: 2000,
};

const SEND_OPTS: JobsOptions = {
  attempts: EMAIL_SEND_ATTEMPTS,
  backoff: { type: 'exponential', delay: EMAIL_SEND_BACKOFF_MS },
  removeOnComplete: 10_000,
  removeOnFail: 20_000,
};

@Injectable()
export class EmailMarketingQueueService {
  constructor(
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(EMAIL_CAMPAIGN_PLAN_QUEUE) private readonly planQueue: Queue,
    @Inject(EMAIL_CAMPAIGN_SEND_QUEUE) private readonly sendQueue: Queue,
  ) {}

  enqueuePlan(organizationId: string, campaignId: string) {
    return this.queueEnqueue.add(
      this.planQueue,
      'plan-email-campaign',
      { organizationId, campaignId },
      { ...PLAN_OPTS, jobId: `email-plan-${campaignId}` },
    );
  }

  enqueueSend(
    organizationId: string,
    campaignId: string,
    recipientId: string,
    delayMs = 0,
  ) {
    return this.queueEnqueue.add(
      this.sendQueue,
      'send-email',
      { organizationId, campaignId, recipientIds: [recipientId] },
      {
        ...SEND_OPTS,
        jobId: `email-send-${recipientId}`,
        delay: delayMs > 0 ? delayMs : undefined,
      },
    );
  }

  enqueueNotOpenFollowup(
    organizationId: string,
    automationId: string,
    recipientId: string,
    waitDays: number,
  ) {
    const delayMs = Math.max(0, waitDays) * 86_400_000;
    return this.queueEnqueue.add(
      this.sendQueue,
      'email-not-open-followup',
      { organizationId, automationId, recipientId },
      {
        ...SEND_OPTS,
        jobId: `email-notopen-${automationId}-${recipientId}`,
        delay: delayMs > 0 ? delayMs : undefined,
      },
    );
  }
}
