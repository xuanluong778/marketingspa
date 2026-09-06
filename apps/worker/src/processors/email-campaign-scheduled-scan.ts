import type { Job } from 'bullmq';
import { EmailCampaignStatus, prisma } from '@marketingspa/database';
import { QUEUE_NAMES } from '@marketingspa/shared';
import { Queue } from 'bullmq';
import { bullConnection, queuePrefix } from '../config';

export async function processEmailCampaignScheduledScan(_job?: Job) {
  const due = await prisma.emailCampaign.findMany({
    where: {
      status: EmailCampaignStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
    },
    take: 20,
    orderBy: { scheduledAt: 'asc' },
  });
  if (due.length === 0) return { processed: 0 };

  const planQueue = new Queue(QUEUE_NAMES.EMAIL_CAMPAIGN_PLAN, {
    connection: bullConnection,
    prefix: queuePrefix,
  });

  let processed = 0;
  try {
    for (const campaign of due) {
      const claimed = await prisma.emailCampaign.updateMany({
        where: { id: campaign.id, status: EmailCampaignStatus.SCHEDULED },
        data: { status: EmailCampaignStatus.RUNNING, startedAt: new Date() },
      });
      if (claimed.count === 0) continue;
      await planQueue.add(
        'plan-email-campaign',
        { organizationId: campaign.organizationId, campaignId: campaign.id },
        {
          jobId: `email-plan-scheduled-${campaign.id}`,
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
