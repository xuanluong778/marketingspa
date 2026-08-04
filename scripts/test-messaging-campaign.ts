/**
 * E2E: MessagingCampaign — draft CRUD, segment preview, eligibility, lifecycle, immutability.
 * Run: pnpm test:messaging-campaign
 */
import assert from 'node:assert/strict';
import {
  MessageChannel,
  MessagingCampaignKind,
  MessagingCampaignRecipientStatus,
  MessagingCampaignStatus,
  MessagingConsentStatus,
  MessagingSuppressionReason,
  PrismaClient,
} from '@prisma/client';
import { buildIntegrationScopeKey } from '@marketingspa/database';

const prisma = new PrismaClient();
const TAG = `MSG_CAMP_E2E_${Date.now()}`;

function isCampaignContentEditable(status: string, startedAt: Date | null): boolean {
  if (startedAt) return false;
  return status === 'DRAFT' || status === 'SCHEDULED';
}

function buildRecipientIdempotencyKey(campaignId: string, identityId: string): string {
  return `mc-${campaignId}-${identityId}`;
}

async function main() {
  console.log(`[${TAG}] start`);

  assert.equal(isCampaignContentEditable('DRAFT', null), true);
  assert.equal(isCampaignContentEditable('SCHEDULED', null), true);
  assert.equal(isCampaignContentEditable('RUNNING', new Date()), false);
  assert.equal(
    buildRecipientIdempotencyKey('camp-1', 'id-1'),
    'mc-camp-1-id-1',
  );

  const org = await prisma.organization.create({
    data: { name: `${TAG} Org`, slug: `${TAG.toLowerCase()}-org` },
  });

  const template = await prisma.messageTemplate.create({
    data: {
      organizationId: org.id,
      name: 'Template test',
      channel: MessageChannel.MESSENGER,
      body: 'Xin chào {{customer_name}}',
    },
  });

  const scope = buildIntegrationScopeKey({
    channel: MessageChannel.MESSENGER,
    channelAccountRef: 'page-camp-1',
  });

  const connection = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      providerKind: 'MESSENGER',
      accountRef: 'page-camp-1',
      displayName: 'Page test',
      status: 'ACTIVE',
      permissions: ['MESSAGES'],
    },
  });

  const customer = await prisma.customer.create({
    data: { organizationId: org.id, name: 'Khách A', phone: '0900111000' },
  });

  const eligibleIdentity = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      integrationScopeKey: scope,
      externalUserId: 'psid-eligible',
      displayName: 'Khách A',
      customerId: customer.id,
      phoneNormalized: '0900111000',
      consentStatus: MessagingConsentStatus.OPTED_IN,
      lastInboundAt: new Date(),
    },
  });

  const blockedIdentity = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      integrationScopeKey: scope,
      externalUserId: 'psid-blocked',
      displayName: 'Blocked',
      optedOut: true,
      lastInboundAt: new Date(),
    },
  });

  await prisma.messagingSuppression.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      phoneNormalized: '0900999888',
      reason: MessagingSuppressionReason.OPTED_OUT,
    },
  });

  const suppressedIdentity = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      integrationScopeKey: scope,
      externalUserId: 'psid-suppressed',
      displayName: 'Suppressed',
      phoneNormalized: '0900999888',
      lastInboundAt: new Date(),
    },
  });

  const campaign = await prisma.messagingCampaign.create({
    data: {
      organizationId: org.id,
      name: `${TAG} Campaign`,
      channel: MessageChannel.MESSENGER,
      campaignType: MessagingCampaignKind.BROADCAST,
      channelConnectionId: connection.id,
      messageTemplateId: template.id,
      segmentConfig: {
        identityIds: [
          eligibleIdentity.id,
          blockedIdentity.id,
          suppressedIdentity.id,
        ],
        excludeSuppressed: true,
      },
      variables: { service_name: 'Spa' },
      status: MessagingCampaignStatus.DRAFT,
    },
  });

  assert.equal(campaign.status, MessagingCampaignStatus.DRAFT);

  const identities = await prisma.messagingContactIdentity.findMany({
    where: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      mergedIntoId: null,
      id: {
        in: [eligibleIdentity.id, blockedIdentity.id, suppressedIdentity.id],
      },
    },
  });
  assert.equal(identities.length, 3);

  const scheduled = await prisma.messagingCampaign.update({
    where: { id: campaign.id },
    data: {
      status: MessagingCampaignStatus.SCHEDULED,
      scheduledAt: new Date(Date.now() + 3600_000),
    },
  });
  assert.equal(scheduled.status, MessagingCampaignStatus.SCHEDULED);

  await prisma.messagingCampaign.update({
    where: { id: campaign.id },
    data: { status: MessagingCampaignStatus.PLANNING },
  });

  const recipientRows = [
    {
      organizationId: org.id,
      campaignId: campaign.id,
      identityId: eligibleIdentity.id,
      customerId: customer.id,
      eligible: true,
      providerMode: 'MESSENGER_STANDARD',
      renderedContent: 'Xin chào Khách A',
      idempotencyKey: buildRecipientIdempotencyKey(campaign.id, eligibleIdentity.id),
      status: MessagingCampaignRecipientStatus.QUEUED,
      queuedAt: new Date(),
    },
    {
      organizationId: org.id,
      campaignId: campaign.id,
      identityId: blockedIdentity.id,
      eligible: false,
      exclusionReason: 'OPTED_OUT',
      idempotencyKey: buildRecipientIdempotencyKey(campaign.id, blockedIdentity.id),
      status: MessagingCampaignRecipientStatus.OPTED_OUT,
    },
  ];

  await prisma.messagingCampaignRecipient.createMany({ data: recipientRows });

  const started = await prisma.messagingCampaign.update({
    where: { id: campaign.id },
    data: {
      status: MessagingCampaignStatus.RUNNING,
      startedAt: new Date(),
      totalRecipients: 2,
      eligibleCount: 1,
      excludedCount: 1,
      queuedCount: 1,
      optOutCount: 1,
      segmentSnapshot: {
        resolvedAt: new Date().toISOString(),
        identityIds: [eligibleIdentity.id, blockedIdentity.id],
      },
    },
  });

  assert.equal(started.status, MessagingCampaignStatus.RUNNING);
  assert.ok(started.startedAt);

  const recipients = await prisma.messagingCampaignRecipient.findMany({
    where: { campaignId: campaign.id },
  });
  assert.equal(recipients.length, 2);
  assert.equal(
    recipients.filter((r) => r.status === MessagingCampaignRecipientStatus.QUEUED).length,
    1,
  );

  const duplicate = await prisma.messagingCampaign.create({
    data: {
      organizationId: org.id,
      name: `${TAG} Copy`,
      channel: started.channel,
      campaignType: started.campaignType,
      channelConnectionId: started.channelConnectionId,
      messageTemplateId: started.messageTemplateId,
      segmentConfig: started.segmentConfig as object,
      variables: started.variables as object,
      status: MessagingCampaignStatus.DRAFT,
    },
  });
  assert.equal(duplicate.status, MessagingCampaignStatus.DRAFT);
  assert.notEqual(duplicate.id, campaign.id);

  const paused = await prisma.messagingCampaign.update({
    where: { id: campaign.id },
    data: { status: MessagingCampaignStatus.PAUSED, pausedAt: new Date() },
  });
  assert.equal(paused.status, MessagingCampaignStatus.PAUSED);

  const resumed = await prisma.messagingCampaign.update({
    where: { id: campaign.id },
    data: { status: MessagingCampaignStatus.RUNNING, pausedAt: null },
  });
  assert.equal(resumed.status, MessagingCampaignStatus.RUNNING);

  const cancelled = await prisma.messagingCampaign.update({
    where: { id: campaign.id },
    data: {
      status: MessagingCampaignStatus.CANCELLED,
      cancelledAt: new Date(),
    },
  });
  assert.equal(cancelled.status, MessagingCampaignStatus.CANCELLED);

  await prisma.messagingCampaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.messagingCampaign.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.messagingSuppression.deleteMany({ where: { organizationId: org.id } });
  await prisma.messagingContactIdentity.deleteMany({ where: { organizationId: org.id } });
  await prisma.messagingChannelConnection.deleteMany({ where: { organizationId: org.id } });
  await prisma.messageTemplate.deleteMany({ where: { organizationId: org.id } });
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`[${TAG}] PASS`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
