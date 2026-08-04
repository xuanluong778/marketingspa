import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const profiles = await p.affiliateProfile.findMany({
    select: { id: true, code: true, totalSignups: true, createdAt: true, user: { select: { email: true } } },
  });
  for (const prof of profiles) {
    const clicks = await p.affiliateClick.count({ where: { affiliateId: prof.id } });
    const refs = await p.affiliateReferral.count({ where: { affiliateId: prof.id } });
    const orgsLocked = await p.organization.count({
      where: { referredByAffiliateId: prof.id },
    });
    // Orgs created after profile, not locked, within 7d of any click
    const clickRows = await p.affiliateClick.findMany({
      where: { affiliateId: prof.id },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    console.log('---', prof.code, prof.user.email);
    console.log({ clicks, refs, orgsLocked, totalSignups: prof.totalSignups, clickSample: clickRows.length });
  }

  const recentOrgs = await p.organization.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      referredByCode: true,
      referredByAffiliateId: true,
    },
  });
  console.log('recentOrgs', JSON.stringify(recentOrgs, null, 2));

  const allOtps = await p.registrationOtp.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      email: true,
      referralCode: true,
      consumedAt: true,
      createdAt: true,
    },
  });
  console.log('recentOtps', JSON.stringify(allOtps, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
