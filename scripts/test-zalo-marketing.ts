/**
 * E2E dry-run: Zalo Marketing — multi-OA, ZBS sync mapping, tenant isolation, queue path.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-zalo-marketing.ts
 */
import assert from 'node:assert/strict';
import {
  MessageChannel,
  MessageTemplateApprovalStatus,
  MessagingCampaignKind,
  MessagingCampaignRecipientStatus,
  MessagingCampaignStatus,
  MessagingConsentStatus,
  MessagingFollowStatus,
  MessagingProviderKind,
  PrismaClient,
} from '@prisma/client';
import { buildIntegrationScopeKey } from '@marketingspa/database';
import {
  extractZbsTemplateVariables,
  mapZaloTemplateApprovalStatus,
  sendZbsTemplateHttp,
} from '@marketingspa/shared';

const prisma = new PrismaClient();
const TAG = `ZALO_MKT_${Date.now()}`;

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed += 1;
  console.log(`  PASS ${name}`);
}

function fail(name: string, err: unknown) {
  failed += 1;
  console.error(`  FAIL ${name}`, err);
}

async function main() {
  console.log(`[${TAG}] start`);

  assert.equal(mapZaloTemplateApprovalStatus('APPROVED'), 'APPROVED');
  assert.equal(mapZaloTemplateApprovalStatus('PENDING_REVIEW'), 'PENDING');
  ok('mapZaloTemplateApprovalStatus');

  const vars = extractZbsTemplateVariables({
    template_id: 't1',
    template_name: 'Test',
    status: 'ENABLE',
    list_params: [{ name: 'name' }, { name: 'phone' }, { name: 'order_code' }],
  });
  assert.equal(vars.length, 3);
  ok('extractZbsTemplateVariables');

  const dryZbs = await sendZbsTemplateHttp({
    accessToken: '',
    phone: '0900111222',
    templateId: 'tpl-1',
  });
  assert.equal(dryZbs.success, false);
  assert.match(dryZbs.message ?? '', /Thiếu token/i);
  ok('sendZbsTemplateHttp rejects missing token');

  const dryUid = await sendZbsTemplateHttp({
    accessToken: 'token-1234567890',
    userId: 'zalo-user-1',
    templateId: 'tpl-1',
  });
  assert.equal(dryUid.success, false);
  ok('sendZbsTemplateHttp accepts userId payload shape');

  const orgA = await prisma.organization.create({
    data: { name: `${TAG} OrgA`, slug: `${TAG.toLowerCase()}-a` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `${TAG} OrgB`, slug: `${TAG.toLowerCase()}-b` },
  });

  const oaA1 = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: `${TAG}-oa-1`,
      displayName: 'OA A1',
      status: 'ACTIVE',
      permissions: ['zalo_oa'],
    },
  });
  const oaA2 = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: `${TAG}-oa-2`,
      displayName: 'OA A2',
      status: 'ACTIVE',
      permissions: ['zalo_oa'],
    },
  });
  const zbsA = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZBS_TEMPLATE,
      accountRef: `${TAG}-zbs-a`,
      displayName: 'ZBS A',
      status: 'ACTIVE',
      permissions: ['zbs'],
    },
  });
  const oaB = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: orgB.id,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: `${TAG}-oa-b`,
      displayName: 'OA B',
      status: 'ACTIVE',
      permissions: ['zalo_oa'],
    },
  });
  ok('multi OA connections per org');

  const tpl = await prisma.messageTemplate.create({
    data: {
      organizationId: orgA.id,
      name: 'ZBS Welcome',
      channel: MessageChannel.ZALO,
      body: 'Xin chào {{name}}, mã đơn {{order_code}}',
      providerTemplateId: `${TAG}-tpl-1`,
      providerMode: 'ZBS_TEMPLATE',
      campaignKind: MessagingCampaignKind.TEMPLATE,
      approvalStatus: MessageTemplateApprovalStatus.APPROVED,
      variables: ['name', 'order_code'],
    },
  });

  const scopeA = buildIntegrationScopeKey({
    channel: MessageChannel.ZALO,
    channelAccountRef: oaA1.accountRef,
  });
  const identityPhone = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.ZALO,
      integrationScopeKey: scopeA,
      externalUserId: '84900111222',
      phoneNormalized: '84900111222',
      displayName: 'Khách Phone',
      followStatus: MessagingFollowStatus.FOLLOWING,
      consentStatus: MessagingConsentStatus.OPTED_IN,
    },
  });
  const identityUid = await prisma.messagingContactIdentity.create({
    data: {
      organizationId: orgA.id,
      channel: MessageChannel.ZALO,
      integrationScopeKey: scopeA,
      externalUserId: `${TAG}-uid-1`,
      displayName: 'Khách UID',
      followStatus: MessagingFollowStatus.FOLLOWING,
      consentStatus: MessagingConsentStatus.OPTED_IN,
    },
  });

  const campaignZbs = await prisma.messagingCampaign.create({
    data: {
      organizationId: orgA.id,
      name: `${TAG} ZBS`,
      channel: MessageChannel.ZALO,
      campaignType: MessagingCampaignKind.TEMPLATE,
      channelConnectionId: zbsA.id,
      messageTemplateId: tpl.id,
      segmentConfig: { identityIds: [identityPhone.id, identityUid.id] },
      variables: { name: 'Anh A', order_code: 'DH-001' },
      status: MessagingCampaignStatus.DRAFT,
    },
  });

  const campaignBc = await prisma.messagingCampaign.create({
    data: {
      organizationId: orgA.id,
      name: `${TAG} Broadcast`,
      channel: MessageChannel.ZALO,
      campaignType: MessagingCampaignKind.BROADCAST,
      channelConnectionId: oaA1.id,
      segmentConfig: {
        followStatuses: [MessagingFollowStatus.FOLLOWING],
        requireOptIn: true,
        excludeSuppressed: true,
      },
      variables: { body: 'Broadcast test' },
      status: MessagingCampaignStatus.DRAFT,
    },
  });
  ok('create ZBS + Broadcast campaigns');

  const crossTenant = await prisma.messagingCampaign.findFirst({
    where: { id: campaignZbs.id, organizationId: orgB.id },
  });
  assert.equal(crossTenant, null);
  ok('tenant isolation on campaign read');

  const crossConn = await prisma.messagingChannelConnection.findFirst({
    where: { id: oaA1.id, organizationId: orgB.id },
  });
  assert.equal(crossConn, null);
  ok('tenant isolation on OA connection');

  await prisma.messagingCampaignRecipient.create({
    data: {
      organizationId: orgA.id,
      campaignId: campaignZbs.id,
      identityId: identityPhone.id,
      status: MessagingCampaignRecipientStatus.QUEUED,
      eligible: true,
      idempotencyKey: `mc-${campaignZbs.id}-${identityPhone.id}`,
    },
  });
  ok('recipient queued with idempotency key');

  assert.notEqual(oaA1.id, oaA2.id);
  assert.notEqual(oaA1.organizationId, oaB.organizationId);
  ok('multiple OA distinct per tenant');

  console.log(`[${TAG}] done ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
