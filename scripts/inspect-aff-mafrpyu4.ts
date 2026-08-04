import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const affUser = await p.user.findUnique({
    where: { email: 'xuanluongmarketing@gmail.com' },
    include: { affiliateProfile: true },
  });
  const refUser = await p.user.findUnique({
    where: { email: 'daotaoseodigi@gmail.com' },
    include: { organization: true },
  });
  const byCode = await p.affiliateProfile.findUnique({
    where: { code: 'MAFRPYU4' },
    include: { user: true },
  });

  console.log(
    JSON.stringify(
      {
        affUser: affUser
          ? {
              id: affUser.id,
              orgId: affUser.organizationId,
              profile: affUser.affiliateProfile,
            }
          : null,
        byCode: byCode
          ? {
              id: byCode.id,
              code: byCode.code,
              email: byCode.user.email,
              status: byCode.status,
              totalSignups: byCode.totalSignups,
              totalClicks: byCode.totalClicks,
            }
          : null,
        refUser: refUser
          ? {
              id: refUser.id,
              orgId: refUser.organizationId,
              createdAt: refUser.createdAt,
              authProvider: refUser.authProvider,
              org: {
                name: refUser.organization.name,
                slug: refUser.organization.slug,
                referredByCode: refUser.organization.referredByCode,
                referredByAffiliateId: refUser.organization.referredByAffiliateId,
                referralLockedAt: refUser.organization.referralLockedAt,
                createdAt: refUser.organization.createdAt,
              },
            }
          : null,
      },
      null,
      2,
    ),
  );

  if (byCode) {
    const refs = await p.affiliateReferral.findMany({ where: { affiliateId: byCode.id } });
    const clicks = await p.affiliateClick.findMany({
      where: { affiliateId: byCode.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    console.log('referrals_count', refs.length);
    console.log('referrals', JSON.stringify(refs, null, 2));
    console.log(
      'clicks',
      clicks.map((c) => ({
        code: c.code,
        landing: c.landingPath,
        at: c.createdAt,
      })),
    );
  }

  const otps = await p.registrationOtp.findMany({
    where: { email: 'daotaoseodigi@gmail.com' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(
    'otps',
    otps.map((o) => ({
      id: o.id,
      referralCode: o.referralCode,
      consumedAt: o.consumedAt,
      createdAt: o.createdAt,
      invalidatedAt: o.invalidatedAt,
    })),
  );

  const orgsWithCode = await p.organization.findMany({
    where: { OR: [{ referredByCode: 'MAFRPYU4' }, { referredByCode: 'mafrpyu4' }] },
  });
  console.log(
    'orgsWithCode',
    orgsWithCode.map((o) => ({
      id: o.id,
      slug: o.slug,
      referredByCode: o.referredByCode,
      locked: o.referralLockedAt,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
