/**
 * Live E2E bulk messaging — Digi Fanpage (MESSAGING_LIVE_PAGE_IDS).
 * Tests: text, text+image, text+video, schedule, multi-contact, skipped ineligible.
 *
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-messaging-bulk-live-e2e.ts
 */
import {
  MessageChannel,
  MessagingCampaignKind,
  MessagingCampaignStatus,
  MessagingConsentStatus,
  PrismaClient,
} from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { buildIntegrationScopeKey } from '@marketingspa/database';

const prisma = new PrismaClient();
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const DIGI_PAGE = '103244355239559';
const TAG = `BULK_LIVE_${Date.now()}`;
const PUBLIC_IMAGE = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';
const PUBLIC_VIDEO = 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function migrateLegacyScopes() {
  const legacy = await prisma.messagingContactIdentity.findMany({
    where: { organizationId: ORG, integrationScopeKey: { startsWith: 'messenger_page:' } },
  });
  for (const row of legacy) {
    const pageId = row.integrationScopeKey.replace(/^messenger_page:/, '');
    const canonical = buildIntegrationScopeKey({
      channel: MessageChannel.MESSENGER,
      channelAccountRef: pageId,
    });
    const clash = await prisma.messagingContactIdentity.findFirst({
      where: {
        organizationId: ORG,
        integrationScopeKey: canonical,
        externalUserId: row.externalUserId,
        NOT: { id: row.id },
      },
    });
    if (clash) {
      await prisma.messagingContactIdentity.update({
        where: { id: clash.id },
        data: {
          lastInboundAt:
            clash.lastInboundAt && row.lastInboundAt && clash.lastInboundAt > row.lastInboundAt
              ? clash.lastInboundAt
              : row.lastInboundAt ?? clash.lastInboundAt,
          chatbotConversationId: clash.chatbotConversationId ?? row.chatbotConversationId,
          displayName: clash.displayName || row.displayName,
        },
      });
      await prisma.messagingContactIdentity.delete({ where: { id: row.id } });
    } else {
      await prisma.messagingContactIdentity.update({
        where: { id: row.id },
        data: { integrationScopeKey: canonical },
      });
    }
  }
  return legacy.length;
}

async function waitCampaign(
  campaignId: string,
  pred: (c: {
    status: string;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    eligibleCount: number;
    excludedCount: number;
  }) => boolean,
  timeoutMs = 120_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = await prisma.messagingCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (pred(c)) return c;
    await sleep(2000);
  }
  return prisma.messagingCampaign.findUniqueOrThrow({ where: { id: campaignId } });
}

async function enqueuePlan(organizationId: string, campaignId: string) {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const prefix = process.env.QUEUE_PREFIX || 'marketingspa';
  const q = new Queue('messaging-campaign-plan-queue', { connection, prefix });
  await q.add(
    'plan-campaign',
    { organizationId, campaignId },
    { jobId: `messaging-plan-${campaignId}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 50 },
  );
  await q.close();
  await connection.quit();
}

async function createAndStart(params: {
  name: string;
  identityIds: string[];
  connectionId: string;
  body?: string;
  mediaUrl?: string;
  mediaType?: string;
  scheduleInMs?: number;
  startNow?: boolean;
}) {
  const variables: Record<string, string> = {};
  if (params.body) variables.body = params.body;
  if (params.mediaUrl) {
    variables.mediaUrl = params.mediaUrl;
    variables.mediaType = params.mediaType || 'image';
  }

  const campaign = await prisma.messagingCampaign.create({
    data: {
      organizationId: ORG,
      name: params.name,
      channel: MessageChannel.MESSENGER,
      campaignType: MessagingCampaignKind.BROADCAST,
      channelConnectionId: params.connectionId,
      segmentConfig: {
        identityIds: params.identityIds,
        excludeSuppressed: true,
        requireOptIn: false,
      },
      variables,
      timezone: 'Asia/Ho_Chi_Minh',
      status: params.scheduleInMs
        ? MessagingCampaignStatus.SCHEDULED
        : MessagingCampaignStatus.DRAFT,
      scheduledAt: params.scheduleInMs
        ? new Date(Date.now() + params.scheduleInMs)
        : undefined,
      createdByUserId: (
        await prisma.user.findFirst({ where: { organizationId: ORG }, select: { id: true } })
      )?.id,
    },
  });

  if (params.scheduleInMs) {
    return campaign;
  }

  if (params.startNow !== false) {
    await prisma.messagingCampaign.update({
      where: { id: campaign.id },
      data: { status: MessagingCampaignStatus.PLANNING, startedAt: new Date() },
    });
    await enqueuePlan(ORG, campaign.id);
  }
  return campaign;
}

function assertLive(providerMessageId: string | null | undefined, label: string) {
  if (!providerMessageId) throw new Error(`${label}: missing providerMessageId`);
  if (providerMessageId.startsWith('dryrun:')) {
    throw new Error(`${label}: DRY-RUN detected (${providerMessageId}) — not PASS`);
  }
}

async function main() {
  console.log(`[${TAG}] live pages=${process.env.MESSAGING_LIVE_PAGE_IDS}`);
  console.log(`[${TAG}] live all=${process.env.MESSAGING_LIVE_SEND}`);

  const migrated = await migrateLegacyScopes();
  console.log(`[${TAG}] migrated legacy scopes=${migrated}`);

  // Soften policy blockers for live E2E window
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
      timezone: 'Asia/Ho_Chi_Minh',
      maxMessagesPerRecipientPerDay: 50,
    },
  });

  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, channel: MessageChannel.MESSENGER, accountRef: DIGI_PAGE },
  });
  if (!conn) throw new Error('Digi connection missing');

  const scope = buildIntegrationScopeKey({
    channel: MessageChannel.MESSENGER,
    channelAccountRef: DIGI_PAGE,
  });

  // Sync from chatbot conversations
  const convs = await prisma.chatbotConversation.findMany({
    where: {
      organizationId: ORG,
      channel: 'facebook',
      channelRef: DIGI_PAGE,
      externalUserId: { not: null },
    },
  });
  for (const conv of convs) {
    if (!conv.externalUserId) continue;
    const existing = await prisma.messagingContactIdentity.findFirst({
      where: {
        organizationId: ORG,
        externalUserId: conv.externalUserId,
        integrationScopeKey: { in: [scope, `messenger_page:${DIGI_PAGE}`] },
      },
    });
    if (!existing) {
      await prisma.messagingContactIdentity.create({
        data: {
          organizationId: ORG,
          channel: MessageChannel.MESSENGER,
          integrationScopeKey: scope,
          externalUserId: conv.externalUserId,
          displayName: conv.visitorName || 'Digi guest',
          lastInboundAt: conv.lastUserMessageAt ?? new Date(),
          consentStatus: MessagingConsentStatus.OPTED_IN,
          chatbotConversationId: conv.id,
        },
      });
    } else {
      await prisma.messagingContactIdentity.update({
        where: { id: existing.id },
        data: {
          integrationScopeKey: scope,
          lastInboundAt: new Date(),
          consentStatus: MessagingConsentStatus.OPTED_IN,
          optedOut: false,
          isBlocked: false,
        },
      });
    }
  }

  const identities = await prisma.messagingContactIdentity.findMany({
    where: {
      organizationId: ORG,
      integrationScopeKey: scope,
      mergedIntoId: null,
      optedOut: false,
      isBlocked: false,
      // Meta Standard Access: chỉ admin/tester/dev nhận được tin thật
      externalUserId: { not: { startsWith: 'skip-' } },
    },
    orderBy: { lastInboundAt: 'desc' },
    take: 10,
  });
  if (identities.length < 1) throw new Error('No Digi identities for live send');

  // Ưu tiên nick admin (đã PASS chatbot send trước đó)
  const preferred =
    identities.find((i) => /lưu xuân lượng|luu xuan luong/i.test(i.displayName || '')) ||
    identities.find((i) => i.externalUserId === '27253756957628455') ||
    identities[0];
  const primary = preferred;
  const multi = [
    primary,
    ...identities.filter((i) => i.id !== primary.id),
  ].slice(0, Math.min(2, identities.length));

  console.log(
    `[${TAG}] primary=${primary.displayName} psid=…${primary.externalUserId.slice(-6)} pool=${identities.length}`,
  );

  // Create an ineligible identity (opted out) for test 6
  const skipped = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: ORG,
      channel: MessageChannel.MESSENGER,
      integrationScopeKey: scope,
      externalUserId: `skip-${Date.now()}`,
      displayName: 'Skipped OptOut',
      consentStatus: MessagingConsentStatus.OPTED_OUT,
      optedOut: true,
      lastInboundAt: new Date(),
    },
  });

  const results: Record<string, string> = {};

  // 1) text
  const c1 = await createAndStart({
    name: `${TAG} text`,
    identityIds: [primary.id],
    connectionId: conn.id,
    body: `[${TAG}] E2E text — Xin chào từ blast Digi`,
  });
  const w1 = await waitCampaign(c1.id, (c) => c.sentCount >= 1 || c.status === 'COMPLETED' || c.status === 'FAILED');
  const r1 = await prisma.messagingCampaignRecipient.findMany({ where: { campaignId: c1.id } });
  assertLive(r1[0]?.providerMessageId, 'test1');
  if (w1.totalRecipients < 1) throw new Error('test1 totalRecipients=0');
  results.test1_text = `PASS sent=${w1.sentCount} total=${w1.totalRecipients} mid=${r1[0]?.providerMessageId}`;

  // 2) text + image
  const c2 = await createAndStart({
    name: `${TAG} text+image`,
    identityIds: [primary.id],
    connectionId: conn.id,
    body: `[${TAG}] E2E text+image`,
    mediaUrl: PUBLIC_IMAGE,
    mediaType: 'image',
  });
  const w2 = await waitCampaign(c2.id, (c) => c.sentCount >= 1 || c.status === 'COMPLETED' || c.status === 'FAILED');
  const r2 = await prisma.messagingCampaignRecipient.findMany({ where: { campaignId: c2.id } });
  assertLive(r2[0]?.providerMessageId, 'test2');
  results.test2_text_image = `PASS sent=${w2.sentCount} mid=${r2[0]?.providerMessageId}`;

  // 3) text + video
  const c3 = await createAndStart({
    name: `${TAG} text+video`,
    identityIds: [primary.id],
    connectionId: conn.id,
    body: `[${TAG}] E2E text+video`,
    mediaUrl: PUBLIC_VIDEO,
    mediaType: 'video',
  });
  const w3 = await waitCampaign(c3.id, (c) => c.sentCount >= 1 || c.status === 'COMPLETED' || c.status === 'FAILED');
  const r3 = await prisma.messagingCampaignRecipient.findMany({ where: { campaignId: c3.id } });
  assertLive(r3[0]?.providerMessageId, 'test3');
  results.test3_text_video = `PASS sent=${w3.sentCount} mid=${r3[0]?.providerMessageId}`;

  // 4) schedule ~2.5 minutes
  const c4 = await createAndStart({
    name: `${TAG} scheduled`,
    identityIds: [primary.id],
    connectionId: conn.id,
    body: `[${TAG}] E2E scheduled`,
    scheduleInMs: 150_000,
  });
  results.test4_schedule = `SCHEDULED id=${c4.id} at=${c4.scheduledAt?.toISOString()} (wait scan)`;

  // 5) multi contact — 1 admin live + 1 non-tester (Meta Standard Access → FAILED OK)
  const nonTester =
    identities.find((i) => i.id !== primary.id && !String(i.externalUserId).startsWith('skip-') && !/smoke/i.test(i.externalUserId)) ||
    null;
  const multiIds = nonTester ? [primary.id, nonTester.id] : [primary.id];
  const c5 = await createAndStart({
    name: `${TAG} multi`,
    identityIds: multiIds,
    connectionId: conn.id,
    body: `[${TAG}] E2E multi-contact`,
  });
  const w5 = await waitCampaign(
    c5.id,
    (c) =>
      c.totalRecipients >= multiIds.length &&
      (c.sentCount + c.failedCount + c.excludedCount >= multiIds.length ||
        c.status === 'COMPLETED'),
    180_000,
  );
  const r5 = await prisma.messagingCampaignRecipient.findMany({ where: { campaignId: c5.id } });
  if (w5.totalRecipients < multiIds.length) {
    throw new Error(`test5 totalRecipients=${w5.totalRecipients}`);
  }
  const live5 = r5.filter((r) => r.providerMessageId && !r.providerMessageId.startsWith('dryrun:'));
  if (live5.length < 1) throw new Error('test5 no live sends');
  results.test5_multi = `PASS total=${w5.totalRecipients} sent=${w5.sentCount} failed=${w5.failedCount} live=${live5.length}`;

  // 6) skipped ineligible
  const c6 = await createAndStart({
    name: `${TAG} skipped`,
    identityIds: [skipped.id, primary.id],
    connectionId: conn.id,
    body: `[${TAG}] E2E skip+send`,
  });
  const w6 = await waitCampaign(c6.id, (c) => c.totalRecipients >= 2 && (c.sentCount >= 1 || c.status === 'COMPLETED'), 120_000);
  const r6 = await prisma.messagingCampaignRecipient.findMany({ where: { campaignId: c6.id } });
  const skippedRow = r6.find((r) => r.identityId === skipped.id);
  if (!skippedRow || (skippedRow.status !== 'SKIPPED' && skippedRow.status !== 'OPTED_OUT')) {
    throw new Error(`test6 expected SKIPPED/OPTED_OUT got ${skippedRow?.status} reason=${skippedRow?.exclusionReason}`);
  }
  const sentRow = r6.find((r) => r.identityId === primary.id && r.status === 'SENT');
  assertLive(sentRow?.providerMessageId, 'test6-live');
  results.test6_skipped = `PASS skipped=${skippedRow.status}:${skippedRow.exclusionReason} sent=${sentRow?.providerMessageId}`;

  // Wait schedule (test4) up to ~4 min
  console.log(`[${TAG}] waiting scheduled campaign ${c4.id}…`);
  const w4 = await waitCampaign(
    c4.id,
    (c) => c.sentCount >= 1 || c.status === 'COMPLETED' || c.status === 'FAILED',
    240_000,
  );
  const r4 = await prisma.messagingCampaignRecipient.findMany({ where: { campaignId: c4.id } });
  if (w4.totalRecipients < 1) throw new Error('test4 totalRecipients=0 after due');
  assertLive(r4[0]?.providerMessageId, 'test4');
  results.test4_schedule = `PASS sent=${w4.sentCount} mid=${r4[0]?.providerMessageId}`;

  console.log(JSON.stringify({
    tag: TAG,
    digiConnectionId: conn.id,
    primaryIdentityId: primary.id,
    recipientPool: identities.length,
    campaigns: { c1: c1.id, c2: c2.id, c3: c3.id, c4: c4.id, c5: c5.id, c6: c6.id },
    results,
    mode: 'LIVE_SEND',
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
