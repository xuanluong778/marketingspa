/**
 * Prompt 4 — channel connections, webhook normalize, dedupe, tenant isolation.
 * Run: pnpm test:messaging-channel-connections
 */
import assert from 'node:assert/strict';
import {
  MessageChannel,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
  PrismaClient,
} from '@prisma/client';
import { normalizeMessengerWebhook, normalizeZaloWebhook } from '@marketingspa/shared';

const prisma = new PrismaClient();
const TAG = `CH_CONN_${Date.now()}`;

function testNormalizeWebhook() {
  const events = normalizeMessengerWebhook(
    {
      entry: [
        {
          id: 'page-100',
          messaging: [
            {
              sender: { id: 'psid-abc-1234567890' },
              recipient: { id: 'page-100' },
              timestamp: Date.now(),
              message: { mid: 'mid-1', text: 'Xin chào' },
            },
          ],
        },
      ],
    },
    'page-100',
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].externalUserId, 'psid-abc-1234567890');
  assert.equal(events[0].direction, 'inbound');
  assert.ok(events[0].rawEventKey.includes('mid-1'));

  const zaloEvents = normalizeZaloWebhook(
    {
      oa_id: 'oa-200',
      event_name: 'user_send_text',
      timestamp: Date.now(),
      sender: { id: 'zalo-user-99', name: 'Khách' },
      message: { text: 'Hi', msg_id: 'zmsg-1' },
    },
    'oa-200',
  );
  assert.equal(zaloEvents.length, 1);
  assert.equal(zaloEvents[0].accountRef, 'oa-200');
}

async function testMultiConnectionPerOrg() {
  const org = await prisma.organization.create({
    data: { name: `${TAG} org`, slug: `${TAG.toLowerCase()}` },
  });

  const page1 = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      providerKind: MessagingProviderKind.MESSENGER,
      accountRef: `${TAG}-page-1`,
      displayName: 'Page 1',
      status: MessagingChannelAccountStatus.ACTIVE,
    },
  });
  const page2 = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      providerKind: MessagingProviderKind.MESSENGER,
      accountRef: `${TAG}-page-2`,
      displayName: 'Page 2',
      status: MessagingChannelAccountStatus.ACTIVE,
    },
  });
  const zalo1 = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: `${TAG}-oa-1`,
      displayName: 'OA 1',
      status: MessagingChannelAccountStatus.ACTIVE,
    },
  });

  const list = await prisma.messagingChannelConnection.findMany({
    where: { organizationId: org.id },
  });
  assert.equal(list.length, 3);

  await prisma.messagingChannelConnection.delete({ where: { id: page1.id } });
  await prisma.messagingChannelConnection.delete({ where: { id: page2.id } });
  await prisma.messagingChannelConnection.delete({ where: { id: zalo1.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

async function testWebhookDedupe() {
  const org = await prisma.organization.create({
    data: { name: `${TAG} dedupe`, slug: `${TAG.toLowerCase()}-dedupe` },
  });
  const eventKey = `${TAG}:dedupe-key`;

  await prisma.messagingWebhookEvent.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      eventKey,
    },
  });

  await assert.rejects(
    () =>
      prisma.messagingWebhookEvent.create({
        data: {
          organizationId: org.id,
          channel: MessageChannel.MESSENGER,
          eventKey,
        },
      }),
    /Unique constraint/,
  );

  await prisma.messagingWebhookEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

async function testCrossTenantConnection() {
  const orgA = await prisma.organization.create({
    data: { name: `${TAG} A`, slug: `${TAG.toLowerCase()}-a` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} B`, slug: `${TAG.toLowerCase()}-b` },
  });

  const conn = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.MESSENGER,
      providerKind: MessagingProviderKind.MESSENGER,
      accountRef: `${TAG}-shared-page`,
      status: MessagingChannelAccountStatus.ACTIVE,
    },
  });

  const cross = await prisma.messagingChannelConnection.findFirst({
    where: { id: conn.id, organizationId: orgB.id },
  });
  assert.equal(cross, null);

  await prisma.messagingChannelConnection.delete({ where: { id: conn.id } });
  await prisma.organization.delete({ where: { id: orgA.id } });
  await prisma.organization.delete({ where: { id: orgB.id } });
}

async function main() {
  console.log(`[${TAG}] start`);
  testNormalizeWebhook();
  await testMultiConnectionPerOrg();
  await testWebhookDedupe();
  await testCrossTenantConnection();
  console.log(`[${TAG}] PASS`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
