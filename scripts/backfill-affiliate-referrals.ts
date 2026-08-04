/**
 * Đồng bộ referral thiếu: org đã có referredBy* nhưng chưa có AffiliateReferral;
 * sync counter totalSignups/totalClicks/totalPaidRefs.
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/backfill-affiliate-referrals.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function attachMissing(orgId: string, affiliateId: string, code: string, userId?: string | null) {
  const exists = await prisma.affiliateReferral.findUnique({
    where: { referredOrganizationId: orgId },
  });
  if (exists) return false;

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return false;
  if (org.referredByAffiliateId && org.referredByAffiliateId !== affiliateId) {
    console.log(`skip org=${org.slug || orgId}: already locked to other affiliate`);
    return false;
  }

  await prisma.$transaction(async (tx) => {
    if (!org.referralLockedAt) {
      await tx.organization.update({
        where: { id: orgId },
        data: {
          referredByCode: code,
          referredByAffiliateId: affiliateId,
          referralLockedAt: org.createdAt,
        },
      });
    }
    await tx.affiliateReferral.create({
      data: {
        affiliateId,
        referredOrganizationId: orgId,
        referredUserId: userId ?? undefined,
        referralCode: code,
        firstOrderOnly: true,
        registeredAt: org.referralLockedAt ?? org.createdAt,
      },
    });
  });
  return true;
}

async function main() {
  let created = 0;

  // 1) Org đã có referredBy* nhưng thiếu AffiliateReferral
  const orgs = await prisma.organization.findMany({
    where: {
      referredByAffiliateId: { not: null },
      referredByCode: { not: null },
    },
  });
  for (const org of orgs) {
    if (!org.referredByAffiliateId || !org.referredByCode) continue;
    const owner = await prisma.user.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    const ok = await attachMissing(
      org.id,
      org.referredByAffiliateId,
      org.referredByCode,
      owner?.id,
    );
    if (ok) {
      created += 1;
      console.log(`created from org lock slug=${org.slug || org.id} code=${org.referredByCode}`);
    }
  }

  // 2) OTP lịch sử có referralCode → user đã tạo nhưng org chưa khóa
  const otps = await prisma.registrationOtp.findMany({
    where: { referralCode: { not: null }, consumedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  for (const otp of otps) {
    if (!otp.referralCode) continue;
    const user = await prisma.user.findUnique({ where: { email: otp.email } });
    if (!user) continue;
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org || org.referralLockedAt) continue;

    const affiliate = await prisma.affiliateProfile.findUnique({
      where: { code: otp.referralCode.toUpperCase() },
    });
    if (!affiliate || affiliate.organizationId === org.id || affiliate.userId === user.id) {
      continue;
    }
    const ok = await attachMissing(org.id, affiliate.id, affiliate.code, user.id);
    if (ok) {
      created += 1;
      console.log(`created from otp email=${otp.email} code=${affiliate.code}`);
    }
  }

  const profiles = await prisma.affiliateProfile.findMany({ select: { id: true } });
  for (const p of profiles) {
    const [signups, clicks, paid] = await Promise.all([
      prisma.affiliateReferral.count({ where: { affiliateId: p.id } }),
      prisma.affiliateClick.count({ where: { affiliateId: p.id } }),
      prisma.affiliateReferral.count({
        where: { affiliateId: p.id, firstPaidAt: { not: null } },
      }),
    ]);
    await prisma.affiliateProfile.update({
      where: { id: p.id },
      data: { totalSignups: signups, totalClicks: clicks, totalPaidRefs: paid },
    });
  }

  console.log(`OK: created=${created} profilesSynced=${profiles.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
