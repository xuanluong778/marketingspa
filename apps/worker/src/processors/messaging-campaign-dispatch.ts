import type { Job } from 'bullmq';
import {
  MessagingCampaignRecipientStatus,
  MessagingCampaignStatus,
  prisma,
} from '@marketingspa/database';
import type Redis from 'ioredis';
import {
  MESSAGING_DISPATCH_CHUNK_SIZE,
  MESSAGING_SEND_MAX_ATTEMPTS,
  type MessagingCampaignDispatchJobData,
  buildCampaignDispatchJobId,
} from '@marketingspa/shared';
import { isCampaignDispatchable, emitCampaignRealtime } from '../lib/messaging-campaign-helpers';
import { dispatchQueue, sendQueue } from '../lib/messaging-queues';

export async function processMessagingCampaignDispatch(
  job: Job<MessagingCampaignDispatchJobData>,
  redis: Redis,
) {
  const { organizationId, campaignId, cursor } = job.data;
  const campaign = await prisma.messagingCampaign.findFirst({
    where: { id: campaignId, organizationId },
  });
  if (!campaign) return { skipped: true, reason: 'campaign_not_found' };
  if (campaign.status === MessagingCampaignStatus.CANCELLED) {
    return { skipped: true, reason: 'campaign_cancelled' };
  }
  if (!isCampaignDispatchable(campaign.status)) {
    return { skipped: true, reason: 'campaign_not_running', status: campaign.status };
  }

  const recipients = await prisma.messagingCampaignRecipient.findMany({
    where: {
      campaignId,
      organizationId,
      eligible: true,
      status: MessagingCampaignRecipientStatus.QUEUED,
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: 'asc' },
    take: MESSAGING_DISPATCH_CHUNK_SIZE,
    select: { id: true, idempotencyKey: true },
  });

  if (recipients.length === 0) {
    await emitCampaignRealtime(redis, organizationId, campaignId, { dispatch: 'idle' });
    return { enqueued: 0 };
  }

  const queue = sendQueue();
  for (const recipient of recipients) {
    await queue.add(
      'send-message',
      { organizationId, campaignId, recipientId: recipient.id },
      {
        jobId: recipient.idempotencyKey,
        attempts: MESSAGING_SEND_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 10_000,
        removeOnFail: 50_000,
      },
    );
  }

  const lastId = recipients[recipients.length - 1]!.id;
  if (recipients.length === MESSAGING_DISPATCH_CHUNK_SIZE) {
    await dispatchQueue().add(
      'dispatch-campaign',
      { organizationId, campaignId, cursor: lastId },
      {
        jobId: buildCampaignDispatchJobId(campaignId, lastId),
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  await emitCampaignRealtime(redis, organizationId, campaignId, {
    dispatch: 'chunk_enqueued',
    count: recipients.length,
  });

  return { enqueued: recipients.length, cursor: lastId };
}
