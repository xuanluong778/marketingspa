import type { Job } from 'bullmq';
import {
  MessagingCampaignRecipientStatus,
  MessagingCampaignStatus,
  Prisma,
  prisma,
} from '@marketingspa/database';
import type Redis from 'ioredis';
import {
  MESSAGING_PLAN_BATCH_SIZE,
  type MessagingCampaignPlanJobData,
  buildCampaignDispatchJobId,
  buildRecipientIdempotencyKey,
} from '@marketingspa/shared';
import { renderTemplate } from '../lib/template';
import { checkCampaignRecipientEligibility } from '../lib/messaging-campaign-eligibility';
import {
  buildRecipientRenderContext,
  filterSuppressedIdentities,
  resolveCampaignIdentities,
  type MessagingSegmentConfig,
} from '../lib/messaging-campaign-helpers';
import { dispatchQueue } from '../lib/messaging-queues';

export async function processMessagingCampaignPlan(
  job: Job<MessagingCampaignPlanJobData>,
  _redis: Redis,
) {
  const { organizationId, campaignId } = job.data;
  const campaign = await prisma.messagingCampaign.findFirst({
    where: { id: campaignId, organizationId },
  });
  if (!campaign) return { skipped: true, reason: 'campaign_not_found' };
  if (campaign.status === MessagingCampaignStatus.CANCELLED) {
    return { skipped: true, reason: 'campaign_cancelled' };
  }
  if (
    campaign.status !== MessagingCampaignStatus.PLANNING &&
    campaign.status !== MessagingCampaignStatus.RUNNING
  ) {
    return { skipped: true, reason: 'invalid_status', status: campaign.status };
  }

  const segmentConfig = campaign.segmentConfig as MessagingSegmentConfig;
  let identities = await resolveCampaignIdentities(
    organizationId,
    campaign.channel,
    segmentConfig,
    campaign.channelConnectionId,
  );
  identities = await filterSuppressedIdentities(
    organizationId,
    campaign.channel,
    identities,
    segmentConfig.excludeSuppressed !== false,
  );

  const template = campaign.messageTemplateId
    ? await prisma.messageTemplate.findFirst({
        where: { id: campaign.messageTemplateId, organizationId },
      })
    : null;

  await prisma.messagingCampaignRecipient.deleteMany({ where: { campaignId } });

  const variables = (campaign.variables ?? {}) as Record<string, string>;
  let eligibleCount = 0;
  let excludedCount = 0;
  let queuedCount = 0;
  let optOutCount = 0;
  let estimatedCost = 0;

  for (let offset = 0; offset < identities.length; offset += MESSAGING_PLAN_BATCH_SIZE) {
    const batch = identities.slice(offset, offset + MESSAGING_PLAN_BATCH_SIZE);
    const rows: Prisma.MessagingCampaignRecipientCreateManyInput[] = [];

    for (const identity of batch) {
      const eligibility = await checkCampaignRecipientEligibility({
        organizationId,
        campaignId,
        channel: campaign.channel,
        campaignType: campaign.campaignType,
        identityId: identity.id,
        channelConnectionId: campaign.channelConnectionId,
        messageTemplateId: campaign.messageTemplateId,
        customerId: identity.customerId,
        leadId: identity.leadId,
      });

      const context = await buildRecipientRenderContext(organizationId, identity, variables);
      const renderedContent = template ? renderTemplate(template.body, context) : null;
      const eligible = eligibility.eligible;

      if (eligible) {
        eligibleCount += 1;
        queuedCount += 1;
        estimatedCost += eligibility.estimatedCost ?? 0;
      } else {
        excludedCount += 1;
        if (
          eligibility.reasonCode === 'OPTED_OUT' ||
          eligibility.reasonCode === 'BLOCKED' ||
          eligibility.reasonCode === 'USER_BLOCKED'
        ) {
          optOutCount += 1;
        }
      }

      const status = eligible
        ? MessagingCampaignRecipientStatus.QUEUED
        : eligibility.reasonCode === 'OPTED_OUT' ||
            eligibility.reasonCode === 'BLOCKED' ||
            eligibility.reasonCode === 'USER_BLOCKED'
          ? MessagingCampaignRecipientStatus.OPTED_OUT
          : MessagingCampaignRecipientStatus.SKIPPED;

      rows.push({
        organizationId,
        campaignId,
        identityId: identity.id,
        customerId: identity.customerId,
        leadId: identity.leadId,
        eligible,
        exclusionReason: eligible ? null : (eligibility.reasonMessage ?? eligibility.reasonCode),
        providerMode: eligibility.providerMode ?? null,
        renderedContent,
        idempotencyKey: buildRecipientIdempotencyKey(campaignId, identity.id),
        status,
        cost: eligibility.estimatedCost ?? 0,
        queuedAt: eligible ? new Date() : null,
      });
    }

    if (rows.length) {
      await prisma.messagingCampaignRecipient.createMany({ data: rows });
    }
  }

  await prisma.messagingCampaign.update({
    where: { id: campaignId },
    data: {
      status: MessagingCampaignStatus.RUNNING,
      startedAt: campaign.startedAt ?? new Date(),
      totalRecipients: identities.length,
      eligibleCount,
      excludedCount,
      queuedCount,
      optOutCount,
      estimatedCost,
      segmentSnapshot: {
        resolvedAt: new Date().toISOString(),
        identityIds: identities.map((i) => i.id),
        total: identities.length,
      } as Prisma.InputJsonValue,
    },
  });

  await dispatchQueue().add(
    'dispatch-campaign',
    { organizationId, campaignId },
    {
      jobId: buildCampaignDispatchJobId(campaignId),
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );

  return {
    campaignId,
    totalRecipients: identities.length,
    eligibleCount,
    queuedCount,
    excludedCount,
  };
}
