/**
 * Probe Digi OA getprofile capability (no tokens printed).
 * Uses a known-invalid and optional env ZALO_E2E_USER_ID if present.
 */
const { prisma } = require('../packages/database/dist');
const { fetchZaloUserProfile, formatZaloVisitorFallback } = require('../packages/shared/dist/zalo-api');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');
const { pickBetterZaloDisplayName } = require('../packages/shared/dist/zalo-api');

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';

(async () => {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials, key));
  const accessToken = creds.accessToken || creds.access_token;

  const probeUid = process.env.ZALO_E2E_USER_ID || '';
  const probes = [];

  // Synthetic UID from inbox
  const synth = await fetchZaloUserProfile({
    accessToken,
    userId: 'e2e_probe_uid',
  });
  probes.push({
    kind: 'synthetic',
    errorCode: synth.errorCode ?? null,
    errorMessage: synth.errorMessage,
    hasName: Boolean(synth.displayName),
    hasAvatar: Boolean(synth.avatarUrl),
  });

  if (probeUid) {
    const real = await fetchZaloUserProfile({ accessToken, userId: probeUid });
    probes.push({
      kind: 'env_uid',
      uidTail: probeUid.slice(-6),
      errorCode: real.errorCode ?? null,
      errorMessage: real.errorMessage,
      hasName: Boolean(real.displayName),
      hasAvatar: Boolean(real.avatarUrl),
      nameLen: real.displayName ? real.displayName.length : 0,
    });
  }

  const conv = await prisma.chatbotConversation.findFirst({
    where: { organizationId: ORG, channel: 'zalo', channelRef: OA },
    orderBy: { updatedAt: 'desc' },
  });
  const displayed = pickBetterZaloDisplayName(
    conv?.visitorName,
    null,
    conv?.externalUserId,
  );
  const noHardcode = !/digi e2e/i.test(displayed || '');

  console.log(
    JSON.stringify(
      {
        probes,
        inbox: {
          uidTail: (conv?.externalUserId || '').slice(-6),
          uidLen: (conv?.externalUserId || '').length,
          realNumericUid: /^\d+$/.test(conv?.externalUserId || ''),
          displayed,
          expectedFallback: formatZaloVisitorFallback(conv?.externalUserId),
          noHardcodeDigiE2E: noHardcode,
          orgOk: conv?.organizationId === ORG,
          oaOk: conv?.channelRef === OA,
        },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e.stack || e).slice(0, 400));
  process.exit(1);
});
