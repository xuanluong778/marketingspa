/**
 * Gắn referral thiếu: daotaoseodigi@gmail.com ← MAFRPYU4 (xuanluongmarketing)
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REF_EMAIL = 'daotaoseodigi@gmail.com';
const CODE = 'MAFRPYU4';

async function main() {
  const affiliate = await prisma.affiliateProfile.findUnique({
    where: { code: CODE },
    include: { user: true },
  });
  if (!affiliate) throw new Error(`Affiliate code ${CODE} not found`);

  const user = await prisma.user.findUnique({
    where: { email: REF_EMAIL },
    include: { organization: true },
  });
  if (!user) throw new Error(`User ${REF_EMAIL} not found`);

  if (affiliate.userId === user.id || affiliate.organizationId === user.organizationId) {
    throw new Error('Self-referral blocked');
  }

  const existing = await prisma.affiliateReferral.findUnique({
    where: { referredOrganizationId: user.organizationId },
  });
  if (existing) {
    console.log('Already linked', existing.id, existing.referralCode);
    return;
  }

  if (user.organization.referralLockedAt && user.organization.referredByAffiliateId) {
    throw new Error(
      `Org already locked to ${user.organization.referredByCode}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: user.organizationId },
      data: {
        referredByCode: CODE,
        referredByAffiliateId: affiliate.id,
        referralLockedAt: user.createdAt,
      },
    });
    await tx.affiliateReferral.create({
      data: {
        affiliateId: affiliate.id,
        referredOrganizationId: user.organizationId,
        referredUserId: user.id,
        referralCode: CODE,
        firstOrderOnly: true,
        status: 'ACTIVE',
        registeredAt: user.createdAt,
      },
    });
    const signupCount = await tx.affiliateReferral.count({
      where: { affiliateId: affiliate.id },
    });
    await tx.affiliateProfile.update({
      where: { id: affiliate.id },
      data: { totalSignups: signupCount },
    });
  });

  const after = await prisma.affiliateProfile.findUnique({ where: { id: affiliate.id } });
  console.log(
    JSON.stringify(
      {
        ok: true,
        affiliateEmail: affiliate.user.email,
        code: CODE,
        referredEmail: REF_EMAIL,
        totalSignups: after?.totalSignups,
      },
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
  .finally(() => prisma.$disconnect());
