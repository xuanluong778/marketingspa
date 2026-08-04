import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const profiles = await p.affiliateProfile.findMany({
    select: {
      id: true,
      code: true,
      totalSignups: true,
      totalClicks: true,
      totalPaidRefs: true,
      user: { select: { email: true } },
    },
  });
  const refsCount = await p.affiliateReferral.count();
  const refs = await p.affiliateReferral.findMany({
    take: 20,
    orderBy: { registeredAt: 'desc' },
    select: {
      id: true,
      affiliateId: true,
      referralCode: true,
      referredOrganizationId: true,
      status: true,
      registeredAt: true,
    },
  });
  const orgs = await p.organization.findMany({
    where: { referredByCode: { not: null } },
    select: {
      id: true,
      name: true,
      referredByCode: true,
      referredByAffiliateId: true,
      referralLockedAt: true,
      createdAt: true,
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });
  const otps = await p.registrationOtp.findMany({
    where: { referralCode: { not: null } },
    select: {
      email: true,
      referralCode: true,
      consumedAt: true,
      createdAt: true,
    },
    take: 15,
    orderBy: { createdAt: 'desc' },
  });
  const clicks = await p.affiliateClick.findMany({
    take: 15,
    orderBy: { createdAt: 'desc' },
    select: { code: true, createdAt: true, landingPath: true },
  });
  console.log(
    JSON.stringify(
      { profiles, refsCount, refs, orgsWithRef: orgs, otpsWithRef: otps, recentClicks: clicks },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
