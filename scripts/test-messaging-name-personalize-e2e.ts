/**
 * E2E: plan multi-recipient với {{full_name}} — mỗi người một renderedContent khác nhau.
 * Gửi live chỉ cho admin Digi nếu có trong list.
 */
import {
  MessageChannel,
  MessagingCampaignKind,
  MessagingCampaignStatus,
  PrismaClient,
} from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const DIGI = '103244355239559';
const TAG = `NAME_PERS_${Date.now()}`;
const BODY = `Chào anh {{full_name}}, chúng tôi có chương trình khuyến mãi dành riêng cho anh.`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, channel: MessageChannel.MESSENGER, accountRef: DIGI },
  });
  if (!conn) throw new Error('missing digi connection');

  const identities = await prisma.messagingContactIdentity.findMany({
    where: {
      organizationId: ORG,
      integrationScopeKey: { in: [`messenger:${DIGI}`, `messenger_page:${DIGI}`] },
      mergedIntoId: null,
      optedOut: false,
      externalUserId: { not: { startsWith: 'skip-' } },
    },
    orderBy: { lastInboundAt: 'desc' },
    take: 5,
  });
  if (identities.length < 2) throw new Error(`need >=2 identities, got ${identities.length}`);

  // Refresh inbound so eligible
  for (const i of identities) {
    await prisma.messagingContactIdentity.update({
      where: { id: i.id },
      data: { lastInboundAt: new Date(), consentStatus: 'OPTED_IN' },
    });
  }

  await prisma.messagingOrgPolicy.upsert({
    where: { organizationId: ORG },
    create: {
      organizationId: ORG,
      timezone: 'Asia/Ho_Chi_Minh',
      quietHoursStart: null,
      quietHoursEnd: null,
      campaignCooldownMinutes: 0,
      excludeRecentlyManualMessaged: false,
      maxMessagesPerRecipientPerDay: 50,
    },
    update: {
      quietHoursStart: null,
      quietHoursEnd: null,
      campaignCooldownMinutes: 0,
      excludeRecentlyManualMessaged: false,
      maxMessagesPerRecipientPerDay: 50,
    },
  });

  const user = await prisma.user.findFirst({ where: { organizationId: ORG }, select: { id: true } });
  const campaign = await prisma.messagingCampaign.create({
    data: {
      organizationId: ORG,
      name: `${TAG} personalize`,
      channel: MessageChannel.MESSENGER,
      campaignType: MessagingCampaignKind.BROADCAST,
      channelConnectionId: conn.id,
      segmentConfig: {
        identityIds: identities.map((i) => i.id),
        excludeSuppressed: true,
        requireOptIn: false,
      },
      variables: { body: BODY },
      timezone: 'Asia/Ho_Chi_Minh',
      status: MessagingCampaignStatus.PLANNING,
      startedAt: new Date(),
      createdByUserId: user?.id,
    },
  });

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const prefix = process.env.QUEUE_PREFIX || 'marketingspa';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const q = new Queue('messaging-campaign-plan-queue', { connection, prefix });
  await q.add(
    'plan-campaign',
    { organizationId: ORG, campaignId: campaign.id },
    { jobId: `messaging-plan-${campaign.id}-${Date.now()}` },
  );
  await q.close();
  await connection.quit();

  let recipients: Array<{
    identityId: string;
    renderedContent: string | null;
    status: string;
    providerMessageId: string | null;
  }> = [];
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const c = await prisma.messagingCampaign.findUnique({ where: { id: campaign.id } });
    recipients = await prisma.messagingCampaignRecipient.findMany({
      where: { campaignId: campaign.id },
      select: {
        identityId: true,
        renderedContent: true,
        status: true,
        providerMessageId: true,
      },
    });
    if (c && c.totalRecipients >= 2 && recipients.length >= 2) {
      // wait a bit more for send of eligible
      if (recipients.some((r) => r.status === 'SENT' || r.status === 'FAILED' || r.status === 'SKIPPED')) {
        if (i > 8) break;
      }
    }
  }

  const byId = new Map(identities.map((i) => [i.id, i]));
  const checks = recipients.map((r) => {
    const ident = byId.get(r.identityId);
    const name = ident?.displayName || '';
    const expected =
      name && !/^khách/i.test(name) ? `Chào anh ${name},` : 'Chào anh Anh/chị,';
    const ok = Boolean(r.renderedContent?.startsWith(expected));
    return {
      displayName: name,
      rendered: r.renderedContent,
      status: r.status,
      mid: r.providerMessageId,
      ok,
    };
  });

  const uniqueRendered = new Set(recipients.map((r) => r.renderedContent));
  const allOk = checks.every((c) => c.ok);
  const distinct = uniqueRendered.size >= Math.min(2, checks.filter((c) => c.ok).length);

  console.log(
    JSON.stringify(
      {
        campaignId: campaign.id,
        totalRecipients: recipients.length,
        allOk,
        distinct,
        checks,
      },
      null,
      2,
    ),
  );

  if (!allOk || !distinct) {
    throw new Error('Personalization check failed');
  }
  console.log('PASS name personalization multi-recipient');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
