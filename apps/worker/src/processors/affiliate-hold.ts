import type { Job } from 'bullmq';
import { AffiliateCommissionStatus, prisma } from '@marketingspa/database';

type HoldJob = { commissionId: string; organizationId?: string };

/**
 * Sau holdDays: PENDING → AVAILABLE (không reverse / reject).
 */
export async function processAffiliateHoldRelease(job: Job<HoldJob>) {
  const commissionId = job.data?.commissionId;
  if (!commissionId) return { skipped: true, reason: 'missing_id' };

  const c = await prisma.affiliateCommission.findUnique({ where: { id: commissionId } });
  if (!c) return { skipped: true, reason: 'not_found' };
  if (c.status !== AffiliateCommissionStatus.PENDING) {
    return { skipped: true, reason: `status_${c.status}` };
  }
  if (c.holdUntil.getTime() > Date.now()) {
    return { skipped: true, reason: 'hold_active' };
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.affiliateCommission.updateMany({
      where: { id: commissionId, status: AffiliateCommissionStatus.PENDING },
      data: {
        status: AffiliateCommissionStatus.AVAILABLE,
        availableAt: new Date(),
      },
    });
    if (updated.count === 0) return;
    await tx.affiliateProfile.update({
      where: { id: c.affiliateId },
      data: {
        pendingAmount: { decrement: c.commissionVnd },
        availableAmount: { increment: c.commissionVnd },
      },
    });
  });

  return { ok: true, commissionId };
}
