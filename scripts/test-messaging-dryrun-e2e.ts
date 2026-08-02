/**
 * Phase A dry-run E2E — uses a TEMP non-live Page connection so Meta is never called.
 * Creates DRAFT → plan → send → assert providerMessageId starts with dryrun:
 *
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-messaging-dryrun-e2e.ts
 */
import { createCipheriv, randomBytes, scryptSync } from 'crypto';
import {
  MessageChannel,
  MessagingCampaignKind,
  MessagingCampaignStatus,
  MessagingChannelAccountStatus,
  MessagingConsentStatus,
  MessagingProviderKind,
  PrismaClient,
} from '@prisma/client';
import { buildIntegrationScopeKey } from '@marketingspa/database';

const prisma = new PrismaClient();
const TAG = `DRYRUN_E2E_${Date.now()}`;
const FAKE_PAGE = `dryrun-page-${Date.now()}`;
const SALT = 'marketingspa-integration-v1';

function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = scryptSync(encryptionKey, SALT, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`[${TAG}] MESSAGING_LIVE_SEND=${process.env.MESSAGING_LIVE_SEND}`);
  console.log(`[${TAG}] MESSAGING_LIVE_PAGE_IDS=${process.env.MESSAGING_LIVE_PAGE_IDS}`);

  const encryptionKey = process.env.ENCRYPTION_KEY || '';
  if (!encryptionKey || encryptionKey.length < 16) throw new Error('ENCRYPTION_KEY missing');

  const org =
    (await prisma.organization.findFirst({
      where: { id: 'a30aca1e-7c12-4950-a15e-b8d114d7af35' },
    })) || (await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!org) throw new Error('No organization');

  const scope = buildIntegrationScopeKey({
    channel: MessageChannel.MESSENGER,
    channelAccountRef: FAKE_PAGE,
  });

  let connectionId: string | null = null;
  let identityId: string | null = null;
  let templateId: string | null = null;
  let campaignId: string | null = null;
  let planQueue: InstanceType<typeof import('bullmq').Queue> | null = null;
  let connectionRedis: InstanceType<typeof import('ioredis').default> | null = null;

  try {
    const connection = await prisma.messagingChannelConnection.create({
      data: {
        organizationId: org.id,
        channel: MessageChannel.MESSENGER,
        providerKind: MessagingProviderKind.MESSENGER,
        accountRef: FAKE_PAGE,
        displayName: `${TAG} fake page`,
        encryptedCredentials: encryptSecret(
          JSON.stringify({ pageAccessToken: 'fake-token', pageId: FAKE_PAGE }),
          encryptionKey,
        ),
        status: MessagingChannelAccountStatus.ACTIVE,
        permissions: ['MESSAGES'],
        lastTestedAt: new Date(),
      },
    });
    connectionId = connection.id;

    const identity = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: org.id,
        channel: MessageChannel.MESSENGER,
        integrationScopeKey: scope,
        externalUserId: `psid-${TAG}`,
        displayName: 'DryRun User',
        consentStatus: MessagingConsentStatus.OPTED_IN,
        lastInboundAt: new Date(),
      },
    });
    identityId = identity.id;

    const template = await prisma.messageTemplate.create({
      data: {
        organizationId: org.id,
        name: `${TAG} template`,
        channel: MessageChannel.MESSENGER,
        body: `[${TAG}] Xin chào {{customer_name}}`,
      },
    });
    templateId = template.id;

    const user = await prisma.user.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
    });

    const campaign = await prisma.messagingCampaign.create({
      data: {
        organizationId: org.id,
        name: `${TAG} campaign`,
        channel: MessageChannel.MESSENGER,
        campaignType: MessagingCampaignKind.AUTOMATION,
        status: MessagingCampaignStatus.DRAFT,
        channelConnectionId: connection.id,
        messageTemplateId: template.id,
        segmentConfig: {
          identityIds: [identity.id],
          integrationScopeKey: scope,
        },
        variables: { customer_name: 'DryRun' },
        createdByUserId: user?.id,
      },
    });
    campaignId = campaign.id;
    console.log(`[${TAG}] campaign=${campaign.id} connection=${connection.id} page=${FAKE_PAGE}`);

    await prisma.messagingCampaign.update({
      where: { id: campaign.id },
      data: { status: MessagingCampaignStatus.PLANNING, startedAt: new Date() },
    });

    const { createRequire } = await import('node:module');
    const require = createRequire(
      '/var/www/marketingaut_usr75/data/www/apps/worker/package.json',
    );
    const { Queue } = require('bullmq') as typeof import('bullmq');
    const Redis = require('ioredis') as typeof import('ioredis').default;
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const prefix = process.env.QUEUE_PREFIX || 'marketingspa';
    connectionRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    planQueue = new Queue('messaging-campaign-plan-queue', {
      connection: connectionRedis,
      prefix,
    });
    await planQueue.add(
      'plan-campaign',
      { organizationId: org.id, campaignId: campaign.id },
      { jobId: `messaging-plan-${campaign.id}` },
    );
    console.log(`[${TAG}] plan enqueued (prefix=${prefix})`);

    let recipient: { status: string; providerMessageId: string | null } | null = null;
    let finalStatus = 'PLANNING';
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      const c = await prisma.messagingCampaign.findUnique({ where: { id: campaign.id } });
      recipient = await prisma.messagingCampaignRecipient.findFirst({
        where: { campaignId: campaign.id },
        select: { status: true, providerMessageId: true },
      });
      finalStatus = c?.status ?? finalStatus;
      console.log(`[${TAG}] poll ${i + 1}`, finalStatus, recipient?.status, recipient?.providerMessageId);
      if (
        recipient &&
        (recipient.status === 'SENT' ||
          recipient.status === 'FAILED' ||
          recipient.status === 'SKIPPED')
      ) {
        break;
      }
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(finalStatus)) break;
    }

    const ok =
      recipient?.status === 'SENT' &&
      Boolean(recipient.providerMessageId?.startsWith('dryrun:'));

    if (!ok) {
      throw new Error(
        `Dry-run failed: status=${recipient?.status} mid=${recipient?.providerMessageId} campaignStatus=${finalStatus}`,
      );
    }
    console.log(`[${TAG}] PASS dry-run E2E`);
  } finally {
    if (planQueue) await planQueue.close().catch(() => undefined);
    if (connectionRedis) await connectionRedis.quit().catch(() => undefined);
    if (campaignId) {
      await prisma.messagingCampaignRecipient
        .deleteMany({ where: { campaignId } })
        .catch(() => undefined);
      await prisma.messagingCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
    }
    if (templateId) {
      await prisma.messageTemplate.delete({ where: { id: templateId } }).catch(() => undefined);
    }
    if (identityId) {
      await prisma.messagingContactIdentity
        .delete({ where: { id: identityId } })
        .catch(() => undefined);
    }
    if (connectionId) {
      await prisma.messagingChannelConnection
        .delete({ where: { id: connectionId } })
        .catch(() => undefined);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
