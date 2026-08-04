import { Inject, Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import {
  MESSAGING_SEND_MAX_ATTEMPTS,
  buildCampaignDispatchJobId,
  buildCampaignPlanJobId,
  buildRecipientIdempotencyKey,
} from '@marketingspa/shared';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import {
  MESSAGING_CAMPAIGN_DISPATCH_QUEUE,
  MESSAGING_CAMPAIGN_PLAN_QUEUE,
  MESSAGING_SEND_QUEUE,
} from '../queue/queue.constants';

const PLAN_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 500,
  removeOnFail: 2000,
};

const DISPATCH_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const SEND_OPTS: JobsOptions = {
  attempts: MESSAGING_SEND_MAX_ATTEMPTS,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 10_000,
  removeOnFail: 50_000,
};

@Injectable()
export class MessagingCampaignQueueService {
  constructor(
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(MESSAGING_CAMPAIGN_PLAN_QUEUE) private readonly planQueue: Queue,
    @Inject(MESSAGING_CAMPAIGN_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
    @Inject(MESSAGING_SEND_QUEUE) private readonly sendQueue: Queue,
  ) {}

  enqueuePlan(organizationId: string, campaignId: string) {
    return this.queueEnqueue.add(
      this.planQueue,
      'plan-campaign',
      { organizationId, campaignId },
      { ...PLAN_OPTS, jobId: buildCampaignPlanJobId(campaignId) },
    );
  }

  enqueueDispatch(organizationId: string, campaignId: string, cursor?: string) {
    return this.queueEnqueue.add(
      this.dispatchQueue,
      'dispatch-campaign',
      { organizationId, campaignId, cursor },
      { ...DISPATCH_OPTS, jobId: buildCampaignDispatchJobId(campaignId, cursor) },
    );
  }

  enqueueSend(
    organizationId: string,
    campaignId: string,
    recipientId: string,
    idempotencyKey: string,
  ) {
    return this.queueEnqueue.add(
      this.sendQueue,
      'send-message',
      { organizationId, campaignId, recipientId },
      { ...SEND_OPTS, jobId: idempotencyKey },
    );
  }

  buildRecipientJobId(campaignId: string, identityId: string) {
    return buildRecipientIdempotencyKey(campaignId, identityId);
  }
}
