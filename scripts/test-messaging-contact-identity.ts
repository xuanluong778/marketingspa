/**
 * E2E: MessagingContactIdentity — upsert, unique scope, phone link, merge/undo.
 * Không auto-gộp theo tên; chỉ SĐT đã xác minh hoặc sourceLeadId.
 *
 * Run: pnpm test:messaging-contact-identity
 */
import assert from 'node:assert/strict';
import {
  MessageChannel,
  MessagingIdentityLinkSource,
  PrismaClient,
} from '@prisma/client';
import {
  buildIntegrationScopeKey,
  normalizeMessagingPhone,
} from '@marketingspa/database';

const prisma = new PrismaClient();
const TAG = `MSG_ID_E2E_${Date.now()}`;

async function main() {
  console.log(`[${TAG}] start`);

  // --- utils ---
  assert.equal(normalizeMessagingPhone('0912 345 678'), '0912345678');
  assert.equal(normalizeMessagingPhone('+84912345678'), '0912345678');
  assert.equal(buildIntegrationScopeKey({ channel: 'MESSENGER', channelAccountRef: 'page-1' }), 'messenger:page-1');

  const org = await prisma.organization.create({
    data: { name: `${TAG} Org`, slug: `${TAG.toLowerCase()}-org` },
  });

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: 'Khách CRM',
      phone: '0900111222',
    },
  });

  const lead = await prisma.lead.create({
    data: {
      organizationId: org.id,
      name: 'Lead CRM',
      phone: '0900333444',
    },
  });

  const scopeMessenger = buildIntegrationScopeKey({
    channel: MessageChannel.MESSENGER,
    channelAccountRef: 'fb-page-99',
  });
  const scopeZalo = buildIntegrationScopeKey({
    channel: MessageChannel.ZALO,
    channelAccountRef: 'zalo-oa-88',
  });

  const messenger = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.MESSENGER,
      integrationScopeKey: scopeMessenger,
      externalUserId: 'psid-111',
      displayName: 'Nguyễn Văn A',
      phoneRaw: '0900111222',
      phoneNormalized: '0900111222',
      phoneVerifiedAt: new Date(),
      lastInboundAt: new Date(),
    },
  });

  const zalo = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.ZALO,
      integrationScopeKey: scopeZalo,
      externalUserId: 'zalo-user-222',
      displayName: 'Nguyễn Văn A',
      phoneRaw: '0900333444',
      phoneNormalized: '0900333444',
      phoneVerifiedAt: new Date(),
    },
  });

  // Unique per org + scope + externalUserId
  await assert.rejects(
    () =>
      prisma.messagingContactIdentity.create({
        data: {
          organizationId: org.id,
          channel: MessageChannel.MESSENGER,
          integrationScopeKey: scopeMessenger,
          externalUserId: 'psid-111',
        },
      }),
    /Unique constraint/,
  );

  // Link by verified phone (customer match)
  const linkedCustomer = await prisma.messagingContactIdentity.update({
    where: { id: messenger.id },
    data: {
      customerId: customer.id,
      linkSource: MessagingIdentityLinkSource.PHONE_VERIFIED,
    },
  });
  assert.equal(linkedCustomer.customerId, customer.id);

  const sameNameCustomer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: 'Nguyễn Văn A',
      phone: '0999888777',
    },
  });

  // Cùng tên nhưng SĐT khác — không được coi là match theo tên
  assert.equal(zalo.displayName, sameNameCustomer.name);
  assert.notEqual(zalo.phoneNormalized, sameNameCustomer.phone);

  // Manual merge Messenger + Zalo into messenger primary
  const snapshot = [{ ...zalo }];
  const mergeLog = await prisma.$transaction(async (tx) => {
    await tx.messagingContactIdentity.update({
      where: { id: zalo.id },
      data: { mergedIntoId: messenger.id },
    });
  return tx.messagingIdentityMergeLog.create({
      data: {
        organizationId: org.id,
        primaryIdentityId: messenger.id,
        mergedIdentityIds: [zalo.id],
        snapshot: snapshot as object,
      },
    });
  });

  const mergedZalo = await prisma.messagingContactIdentity.findUniqueOrThrow({
    where: { id: zalo.id },
  });
  assert.equal(mergedZalo.mergedIntoId, messenger.id);

  // Undo merge
  const snap = mergeLog.snapshot as Record<string, unknown>[];
  await prisma.$transaction(async (tx) => {
    for (const s of snap) {
      await tx.messagingContactIdentity.update({
        where: { id: s.id as string },
        data: {
          mergedIntoId: null,
          customerId: (s.customerId as string) ?? null,
          leadId: (s.leadId as string) ?? null,
          linkSource: s.linkSource as MessagingIdentityLinkSource,
        },
      });
    }
    await tx.messagingIdentityMergeLog.update({
      where: { id: mergeLog.id },
      data: { undoneAt: new Date() },
    });
  });

  const restored = await prisma.messagingContactIdentity.findUniqueOrThrow({
    where: { id: zalo.id },
  });
  assert.equal(restored.mergedIntoId, null);

  // Lead link by sourceLeadId metadata (not name)
  const leadTagged = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: org.id,
      channel: MessageChannel.ZALO,
      integrationScopeKey: buildIntegrationScopeKey({
        channel: MessageChannel.ZALO,
        channelAccountRef: 'zalo-oa-77',
      }),
      externalUserId: 'zalo-src-lead',
      metadata: { sourceLeadId: lead.id },
    },
  });
  const metaLeadId = (leadTagged.metadata as { sourceLeadId?: string }).sourceLeadId;
  assert.equal(metaLeadId, lead.id);

  // cleanup
  await prisma.messagingIdentityMergeLog.deleteMany({ where: { organizationId: org.id } });
  await prisma.messagingContactIdentity.deleteMany({ where: { organizationId: org.id } });
  await prisma.lead.deleteMany({ where: { organizationId: org.id } });
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`[${TAG}] PASS`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
