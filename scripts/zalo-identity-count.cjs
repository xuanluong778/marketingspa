const { prisma } = require('../packages/database/dist');
const crypto = require('crypto');

function mask(id) {
  const s = String(id || '');
  if (s.length <= 6) return '***';
  return `${s.slice(0, 2)}…${s.slice(-4)}`;
}

async function main() {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const oa = '526368405518511676';
  const n = await prisma.messagingContactIdentity.count({
    where: { organizationId: org, channel: 'ZALO', mergedIntoId: null },
  });
  const eligible = await prisma.messagingContactIdentity.count({
    where: {
      organizationId: org,
      channel: 'ZALO',
      mergedIntoId: null,
      optedOut: false,
      isBlocked: false,
    },
  });
  const withInbound = await prisma.messagingContactIdentity.findFirst({
    where: {
      organizationId: org,
      channel: 'ZALO',
      mergedIntoId: null,
      lastInboundAt: { not: null },
      optedOut: false,
      isBlocked: false,
    },
    orderBy: { lastInboundAt: 'desc' },
    select: {
      id: true,
      externalUserId: true,
      lastInboundAt: true,
      followStatus: true,
      leadId: true,
      customerId: true,
    },
  });
  const conv = await prisma.chatbotConversation.findFirst({
    where: { organizationId: org, channel: 'zalo', channelRef: oa },
    orderBy: { updatedAt: 'desc' },
    select: { externalUserId: true, updatedAt: true },
  });
  console.log(
    JSON.stringify(
      {
        zaloIdentities: n,
        eligibleish: eligible,
        latestInboundMasked: withInbound
          ? {
              id: withInbound.id,
              user: mask(withInbound.externalUserId),
              lastInboundAt: withInbound.lastInboundAt,
              followStatus: withInbound.followStatus,
              hasLead: Boolean(withInbound.leadId),
              hasCustomer: Boolean(withInbound.customerId),
            }
          : null,
        latestConvMasked: conv
          ? { user: mask(conv.externalUserId), updatedAt: conv.updatedAt }
          : null,
        // For E2E only if inbound within 48h consult window — set env, do not print full id here
        canSuggestE2EUser: Boolean(
          withInbound?.externalUserId &&
            withInbound.lastInboundAt &&
            Date.now() - withInbound.lastInboundAt.getTime() < 48 * 3600_000,
        ),
      },
      null,
      2,
    ),
  );

  // Write e2e user to a root-only temp file for subsequent tests (not stdout)
  if (withInbound?.externalUserId) {
    const p = '/tmp/zalo-e2e-user.env';
    require('fs').writeFileSync(
      p,
      `ZALO_E2E_USER_ID=${withInbound.externalUserId}\n`,
      { mode: 0o600 },
    );
    console.log('wrote_e2e_user_file=true path=/tmp/zalo-e2e-user.env');
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
