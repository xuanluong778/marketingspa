import type { Job } from 'bullmq';
import { MessagingCampaignStatus, prisma } from '@marketingspa/database';
import { QUEUE_NAMES } from '@marketingspa/shared';
import { Queue } from 'bullmq';
import { bullConnection, queuePrefix } from '../config';

/**
 * Cron: tự start các chiến dịch SCHEDULED đã đến giờ.
 * Mirror pattern auto-post scan-due.
 */
export async function processMessagingCampaignScheduledScan(_job?: Job) {
  const due = await prisma.messagingCampaign.findMany({
    where: {
      status: MessagingCampaignStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
    },
    take: 20,
    orderBy: { scheduledAt: 'asc' },
  });

  if (due.length === 0) {
    return { processed: 0 };
  }

  const planQueue = new Queue(QUEUE_NAMES.MESSAGING_CAMPAIGN_PLAN, {
    connection: bullConnection,
    prefix: queuePrefix,
  });

  let processed = 0;
  try {
    for (const campaign of due) {
      const claimed = await prisma.messagingCampaign.updateMany({
        where: {
          id: campaign.id,
          status: MessagingCampaignStatus.SCHEDULED,
        },
        data: {
          status: MessagingCampaignStatus.PLANNING,
          startedAt: new Date(),
        },
      });
      if (claimed.count === 0) continue;

      await planQueue.add(
        'plan-campaign',
        { organizationId: campaign.organizationId, campaignId: campaign.id },
        {
          jobId: `mc-plan-scheduled-${campaign.id}-${Date.now()}`,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
      processed += 1;
    }
  } finally {
    await planQueue.close();
  }

  return { processed, due: due.length };
}
