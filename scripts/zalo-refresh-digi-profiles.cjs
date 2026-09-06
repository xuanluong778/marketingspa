/**
 * Refresh Digi Zalo sender display names after OA tier upgrade (clear -224 fail cache).
 * Run: node scripts/with-root-env.cjs node scripts/zalo-refresh-digi-profiles.cjs
 */
const { prisma } = require('../packages/database/dist');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');
const { fetchZaloUserProfile, isWeakZaloDisplayName } = require('../packages/shared/dist');

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';

(async () => {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  if (!conn) throw new Error('Digi OA connection missing');
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials, key));
  const accessToken = creds.accessToken || creds.access_token;
  if (!accessToken) throw new Error('missing access token');

  const identities = await prisma.messagingContactIdentity.findMany({
    where: {
      organizationId: ORG,
      channel: 'ZALO',
      NOT: { externalUserId: { startsWith: 'e2e_' } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });

  const results = [];
  for (const id of identities) {
    const profile = await fetchZaloUserProfile({
      accessToken,
      userId: id.externalUserId,
    });
    const meta = (id.metadata && typeof id.metadata === 'object' ? id.metadata : {}) || {};
    const nextName =
      profile.displayName && !isWeakZaloDisplayName(profile.displayName)
        ? profile.displayName
        : id.displayName;
    const nextAvatar = profile.avatarUrl || id.avatarUrl || null;
    const ok = Boolean(profile.displayName) && Number(profile.errorCode || 0) === 0;

    await prisma.messagingContactIdentity.update({
      where: { id: id.id },
      data: {
        displayName: nextName,
        ...(nextAvatar ? { avatarUrl: String(nextAvatar).slice(0, 2000) } : {}),
        metadata: {
          ...meta,
          profileSource: ok ? 'zalo_getprofile' : meta.profileSource || 'fallback',
          profileErrorCode: profile.errorCode ?? null,
          profileFetchedAt: ok ? new Date().toISOString() : meta.profileFetchedAt,
          profileFetchFailedAt: ok ? undefined : new Date().toISOString(),
        },
      },
    });

    if (id.chatbotConversationId && ok && nextName) {
      await prisma.chatbotConversation.update({
        where: { id: id.chatbotConversationId },
        data: {
          visitorName: nextName.slice(0, 190),
          ...(nextAvatar ? { visitorAvatarUrl: String(nextAvatar).slice(0, 2000) } : {}),
        },
      });
    }

    results.push({
      uid: `••••${id.externalUserId.slice(-6)}`,
      before: id.displayName,
      after: nextName,
      ok,
      error: profile.errorCode ?? profile.errorMessage,
    });
  }

  console.log(JSON.stringify({ refreshed: results.length, results }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
