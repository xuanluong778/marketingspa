import type { Job } from 'bullmq';
import {
  EmailCampaignStatus,
  EmailContactStatus,
  EmailRecipientStatus,
  Prisma,
  prisma,
} from '@marketingspa/database';
import {
  EMAIL_SEND_ATTEMPTS,
  EMAIL_SEND_BACKOFF_MS,
  QUEUE_NAMES,
  emailSendBatchSize,
} from '@marketingspa/shared';
import { Queue } from 'bullmq';
import { bullConnection, queuePrefix } from '../config';

type PlanJob = { organizationId: string; campaignId: string };

type SegmentRules = {
  status?: 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'BOUNCED';
  listId?: string;
};

const KEEP_STATUS = new Set<EmailRecipientStatus>([
  EmailRecipientStatus.SENT,
  EmailRecipientStatus.DELIVERED,
  EmailRecipientStatus.OPENED,
  EmailRecipientStatus.CLICKED,
  EmailRecipientStatus.BOUNCED,
  EmailRecipientStatus.UNSUBSCRIBED,
  EmailRecipientStatus.SKIPPED,
]);

export async function processEmailCampaignPlan(job: Job<PlanJob>) {
  const { organizationId, campaignId } = job.data;
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: campaignId, organizationId },
  });
  if (!campaign) return { skipped: true, reason: 'campaign_not_found' };
  if (campaign.status === EmailCampaignStatus.CANCELLED) {
    return { skipped: true, reason: 'cancelled' };
  }
  if (
    campaign.status !== EmailCampaignStatus.RUNNING &&
    campaign.status !== EmailCampaignStatus.SCHEDULED
  ) {
    return { skipped: true, reason: 'invalid_status', status: campaign.status };
  }

  if (campaign.status === EmailCampaignStatus.SCHEDULED) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: EmailCampaignStatus.RUNNING, startedAt: new Date() },
    });
  }

  let contacts: { id: string; email: string; status: EmailContactStatus }[] = [];
  if (campaign.selectedContactIds?.length) {
    contacts = await prisma.emailContact.findMany({
      where: {
        organizationId,
        id: { in: campaign.selectedContactIds },
      },
      select: { id: true, email: true, status: true },
    });
  } else if (campaign.listId) {
    const members = await prisma.emailListMember.findMany({
      where: { organizationId, listId: campaign.listId },
      include: { contact: { select: { id: true, email: true, status: true } } },
    });
    contacts = members.map((m) => m.contact);
  } else if (campaign.segmentId) {
    const segment = await prisma.emailSegment.findFirst({
      where: { id: campaign.segmentId, organizationId },
    });
    const rules = (segment?.rules ?? {}) as SegmentRules;
    const where: Prisma.EmailContactWhereInput = { organizationId };
    where.status = rules.status ?? EmailContactStatus.SUBSCRIBED;
    if (rules.listId) {
      where.listMembers = { some: { listId: rules.listId, organizationId } };
    }
    contacts = await prisma.emailContact.findMany({
      where,
      select: { id: true, email: true, status: true },
    });
  } else {
    contacts = await prisma.emailContact.findMany({
      where: { organizationId, status: EmailContactStatus.SUBSCRIBED },
      select: { id: true, email: true, status: true },
    });
  }

  const suppressed = await prisma.emailSuppression.findMany({
    where: { organizationId },
    select: { email: true },
  });
  const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));

  await prisma.emailCampaignRecipient.deleteMany({
    where: { campaignId, organizationId, status: EmailRecipientStatus.PENDING },
  });

  const sendQueue = new Queue(QUEUE_NAMES.EMAIL_CAMPAIGN_SEND, {
    connection: bullConnection,
    prefix: queuePrefix,
  });

  const seenEmails = new Set<string>();
  const toEnqueue: string[] = [];
  let skipped = 0;
  try {
    for (const contact of contacts) {
      const email = contact.email.toLowerCase();
      if (seenEmails.has(email)) {
        skipped += 1;
        continue;
      }
      seenEmails.add(email);

      let skipReason: string | null = null;
      if (contact.status !== EmailContactStatus.SUBSCRIBED) skipReason = 'not_subscribed';
      else if (suppressedSet.has(email)) skipReason = 'suppressed';

      const existing = await prisma.emailCampaignRecipient.findUnique({
        where: { campaignId_contactId: { campaignId, contactId: contact.id } },
      });
      if (existing && KEEP_STATUS.has(existing.status)) {
        skipped += 1;
        continue;
      }
      if (existing?.status === EmailRecipientStatus.QUEUED) {
        toEnqueue.push(existing.id);
        continue;
      }

      const recipient = await prisma.emailCampaignRecipient.upsert({
        where: { campaignId_contactId: { campaignId, contactId: contact.id } },
        create: {
          organizationId,
          campaignId,
          contactId: contact.id,
          email,
          status: skipReason ? EmailRecipientStatus.SKIPPED : EmailRecipientStatus.QUEUED,
          skipReason,
          queuedAt: skipReason ? null : new Date(),
        },
        update: skipReason
          ? { email, status: EmailRecipientStatus.SKIPPED, skipReason }
          : {
              email,
              status: EmailRecipientStatus.QUEUED,
              skipReason: null,
              queuedAt: new Date(),
              lastError: null,
            },
      });

      if (skipReason) {
        skipped += 1;
        continue;
      }
      toEnqueue.push(recipient.id);
    }

    const batchSize = emailSendBatchSize();
    const jobs = [];
    for (let i = 0; i < toEnqueue.length; i += batchSize) {
      const recipientIds = toEnqueue.slice(i, i + batchSize);
      const first = recipientIds[0];
      if (!first) continue;
      const jobId = `email-batch-${campaignId}-${first}-${recipientIds.length}`;
      const existingJob = await sendQueue.getJob(jobId);
      if (existingJob) continue;
      jobs.push({
        name: 'send-email',
        data: { organizationId, campaignId, recipientIds },
        opts: {
          jobId,
          attempts: EMAIL_SEND_ATTEMPTS,
          backoff: { type: 'exponential' as const, delay: EMAIL_SEND_BACKOFF_MS },
          removeOnComplete: 10_000,
          removeOnFail: 20_000,
        },
      });
    }
    if (jobs.length) await sendQueue.addBulk(jobs);
  } finally {
    await sendQueue.close();
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      totalRecipients: seenEmails.size,
      queuedCount: toEnqueue.length,
      status: toEnqueue.length === 0 ? EmailCampaignStatus.COMPLETED : EmailCampaignStatus.RUNNING,
      completedAt: toEnqueue.length === 0 ? new Date() : null,
    },
  });

  return { queued: toEnqueue.length, skipped, total: seenEmails.size, batches: Math.ceil(toEnqueue.length / emailSendBatchSize()) };
}
