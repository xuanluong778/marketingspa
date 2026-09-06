/**
 * Backfill Digi Zalo inbox: replace weak/hardcoded names with Khách Zalo • UID tail.
 * Try getprofile when UID looks real (numeric). No tokens printed.
 */
const { prisma } = require('../packages/database/dist');
const {
  fetchZaloUserProfile,
  formatZaloVisitorFallback,
  isWeakZaloDisplayName,
  pickBetterZaloDisplayName,
} = require('../packages/shared/dist/zalo-api');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';

(async () => {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  const creds = conn?.encryptedCredentials
    ? JSON.parse(decryptSecret(conn.encryptedCredentials, key))
    : {};
  const accessToken = creds.accessToken || creds.access_token || '';

  const convs = await prisma.chatbotConversation.findMany({
    where: { organizationId: ORG, channel: 'zalo', channelRef: OA },
  });
  const results = [];

  for (const conv of convs) {
    const uid = String(conv.externalUserId || '').trim();
    const identity = uid
      ? await prisma.messagingContactIdentity.findFirst({
          where: {
            organizationId: ORG,
            channel: 'ZALO',
            externalUserId: uid,
          },
        })
      : null;

    let displayName = pickBetterZaloDisplayName(conv.visitorName, identity?.displayName, uid);
    let avatarUrl = conv.visitorAvatarUrl || identity?.avatarUrl || null;
    let profileStatus = 'skipped';

    const looksRealUid = /^\d{6,}$/.test(uid);
    if (looksRealUid && accessToken && (isWeakZaloDisplayName(displayName) || !avatarUrl)) {
      const profile = await fetchZaloUserProfile({ accessToken, userId: uid });
      if (profile.displayName || profile.avatarUrl) {
        displayName = pickBetterZaloDisplayName(displayName, profile.displayName, uid);
        avatarUrl = avatarUrl || profile.avatarUrl;
        profileStatus = 'fetched';
      } else {
        profileStatus = `unavailable:${profile.errorCode ?? ''}:${profile.errorMessage || ''}`;
        displayName = formatZaloVisitorFallback(uid);
      }
    } else if (isWeakZaloDisplayName(displayName)) {
      displayName = formatZaloVisitorFallback(uid);
      profileStatus = looksRealUid ? 'no_token_or_cached' : 'synthetic_uid_fallback';
    }

    await prisma.chatbotConversation.update({
      where: { id: conv.id },
      data: {
        visitorName: displayName,
        ...(avatarUrl ? { visitorAvatarUrl: String(avatarUrl).slice(0, 2000) } : {}),
      },
    });
    if (identity) {
      await prisma.messagingContactIdentity.update({
        where: { id: identity.id },
        data: {
          displayName,
          ...(avatarUrl ? { avatarUrl: String(avatarUrl).slice(0, 2000) } : {}),
          metadata: {
            ...((identity.metadata && typeof identity.metadata === 'object'
              ? identity.metadata
              : {})),
            profileSource: profileStatus.startsWith('fetched') ? 'zalo_getprofile' : 'fallback',
            profileBackfilledAt: new Date().toISOString(),
          },
        },
      });
    }

    results.push({
      convId: conv.id.slice(0, 8),
      uidTail: uid.slice(-6),
      uidLen: uid.length,
      realUid: looksRealUid,
      displayName,
      hasAvatar: Boolean(avatarUrl),
      profileStatus,
      orgOk: conv.organizationId === ORG,
      oaOk: conv.channelRef === OA,
    });
  }

  console.log(JSON.stringify({ updated: results.length, results }, null, 2));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e.stack || e).slice(0, 500));
  process.exit(1);
});
