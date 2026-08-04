import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AffiliateCommissionStatus,
  AffiliateFraudSeverity,
  AffiliatePayoutStatus,
  AffiliateProfileStatus,
  Prisma,
} from '@marketingspa/database';
import { createHash, randomBytes } from 'crypto';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AFFILIATE_HOLD_QUEUE } from '../queue/queue.constants';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { redactForAudit } from '../common/utils/token-security.util';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  CreatePayoutRequestDto,
  TrackClickDto,
  UpsertPayoutMethodDto,
} from './dto/affiliate.dto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hashSignal(value?: string | null) {
  if (!value?.trim()) return null;
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

function maskEmail(email: string) {
  const [u, d] = email.split('@');
  if (!u || !d) return '***';
  return `${u.slice(0, 2)}***@${d}`;
}

function maskPhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-3)}`;
}

export type PaidOrderNotify = {
  orderId: string;
  organizationId: string;
  createdByUserId: string | null;
  code: string;
  amount: number;
  sepayId: string;
  /** Skip commission for admin gift / force reprocess */
  skipCommission?: boolean;
  isUpgrade?: boolean;
};

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(AFFILIATE_HOLD_QUEUE) private readonly holdQueue: Queue,
  ) {}

  async getSettings() {
    return this.prisma.affiliateSetting.upsert({
      where: { id: 'default' },
      create: { id: 'default', updatedAt: new Date() },
      update: {},
    });
  }

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      let code = 'MA';
      const bytes = randomBytes(6);
      for (let j = 0; j < 6; j++) code += CODE_ALPHABET[bytes[j]! % CODE_ALPHABET.length];
      const exists = await this.prisma.affiliateProfile.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException('Không tạo được mã affiliate');
  }

  /** Tạo profile nếu chưa có — chỉ user đã xác minh email */
  async ensureProfile(user: AuthUser) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new NotFoundException('User không tồn tại');
    if (!dbUser.emailVerifiedAt && dbUser.authProvider === 'LOCAL') {
      throw new ForbiddenException('Vui lòng xác minh email trước khi dùng Affiliate');
    }

    const existing = await this.prisma.affiliateProfile.findUnique({
      where: { userId: user.id },
      include: { payoutMethod: true },
    });
    if (existing) return this.mapProfile(existing);

    const settings = await this.getSettings();
    const code = await this.generateUniqueCode();
    const created = await this.prisma.affiliateProfile.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        code,
        status: AffiliateProfileStatus.ACTIVE,
      },
      include: { payoutMethod: true },
    });
    await this.writeAudit({
      affiliateId: created.id,
      actorUserId: user.id,
      action: 'AFFILIATE_PROFILE_CREATED',
      entityType: 'AFFILIATE_PROFILE',
      entityId: created.id,
      after: { code },
    });
    return this.mapProfile(created, settings);
  }

  async overview(user: AuthUser) {
    const profile = await this.ensureProfile(user);
    const settings = await this.getSettings();
    const [pending, available, paid, payoutPending, signupCount, clickCount, paidRefCount] =
      await Promise.all([
      this.prisma.affiliateCommission.aggregate({
        where: {
          affiliateId: profile.id,
          status: { in: [AffiliateCommissionStatus.PENDING, AffiliateCommissionStatus.APPROVED, AffiliateCommissionStatus.MANUAL_REVIEW] },
        },
        _sum: { commissionVnd: true },
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { affiliateId: profile.id, status: AffiliateCommissionStatus.AVAILABLE },
        _sum: { commissionVnd: true },
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { affiliateId: profile.id, status: AffiliateCommissionStatus.PAID },
        _sum: { commissionVnd: true },
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { affiliateId: profile.id, status: AffiliateCommissionStatus.PAYOUT_PENDING },
        _sum: { commissionVnd: true },
      }),
      // Đếm đăng ký từ bảng referral (không phụ thuộc counter / chỉ khách đã thanh toán)
      this.prisma.affiliateReferral.count({ where: { affiliateId: profile.id } }),
      this.prisma.affiliateClick.count({ where: { affiliateId: profile.id } }),
      this.prisma.affiliateReferral.count({
        where: { affiliateId: profile.id, firstPaidAt: { not: null } },
      }),
    ]);

    // Đồng bộ counter denormalized (best-effort)
    if (
      signupCount !== profile.totalSignups ||
      clickCount !== profile.totalClicks ||
      paidRefCount !== profile.totalPaidRefs
    ) {
      void this.prisma.affiliateProfile
        .update({
          where: { id: profile.id },
          data: {
            totalSignups: signupCount,
            totalClicks: clickCount,
            totalPaidRefs: paidRefCount,
          },
        })
        .catch(() => undefined);
    }

    return {
      profile: { ...profile, totalSignups: signupCount, totalClicks: clickCount, totalPaidRefs: paidRefCount },
      stats: {
        clicks: clickCount,
        signups: signupCount,
        paidCustomers: paidRefCount,
        pendingCommission: Number(pending._sum.commissionVnd ?? 0),
        availableCommission: Number(available._sum.commissionVnd ?? 0),
        payoutPendingCommission: Number(payoutPending._sum.commissionVnd ?? 0),
        paidCommission: Number(paid._sum.commissionVnd ?? 0),
      },
      settings: {
        rate: Number(profile.customRate ?? settings.defaultCommissionRate),
        holdDays: settings.holdDays,
        minPayoutVnd: Number(settings.minPayoutVnd),
        cookieDays: settings.cookieDays,
        firstOrderOnly: settings.firstOrderOnlyDefault,
        allowRenewalCommission:
          profile.allowRenewalCommission || settings.allowRenewalCommission,
        publicBaseUrl: settings.publicBaseUrl,
      },
    };
  }

  async trackClick(dto: TrackClickDto, meta?: { ip?: string; userAgent?: string }) {
    const profile = await this.prisma.affiliateProfile.findUnique({
      where: { code: dto.code.toUpperCase().trim() },
    });
    if (!profile || profile.status !== AffiliateProfileStatus.ACTIVE) {
      return { ok: false, tracked: false };
    }
    await this.prisma.$transaction([
      this.prisma.affiliateClick.create({
        data: {
          affiliateId: profile.id,
          code: profile.code,
          ipHash: hashSignal(meta?.ip),
          userAgentHash: hashSignal(meta?.userAgent),
          fingerprintHash: hashSignal(dto.fingerprint),
          landingPath: dto.landingPath?.slice(0, 500),
        },
      }),
      this.prisma.affiliateProfile.update({
        where: { id: profile.id },
        data: { totalClicks: { increment: 1 } },
      }),
    ]);
    return { ok: true, tracked: true };
  }

  /**
   * Khóa referral vào org lúc đăng ký — server-side từ OTP cookie code.
   * Không tin body frontend lúc verify.
   */
  async attachReferralOnSignup(opts: {
    organizationId: string;
    userId: string;
    email: string;
    phone?: string | null;
    referralCode?: string | null;
    ip?: string;
  }) {
    const code = opts.referralCode?.trim().toUpperCase();
    if (!code) return { attached: false, reason: 'NO_CODE' };

    // Idempotent: đã khóa org rồi → không tạo trùng
    const existingOrg = await this.prisma.organization.findUnique({
      where: { id: opts.organizationId },
      select: { referredByCode: true, referredByAffiliateId: true, referralLockedAt: true },
    });
    if (existingOrg?.referralLockedAt && existingOrg.referredByAffiliateId) {
      const existingRef = await this.prisma.affiliateReferral.findUnique({
        where: { referredOrganizationId: opts.organizationId },
      });
      if (existingRef) {
        return { attached: true, reason: 'ALREADY_LOCKED', riskManualReview: false };
      }
    }

    const affiliate = await this.prisma.affiliateProfile.findUnique({
      where: { code },
      include: { user: true, payoutMethod: true },
    });
    if (!affiliate || affiliate.status !== AffiliateProfileStatus.ACTIVE) {
      return { attached: false, reason: 'INVALID_CODE' };
    }

    // Self-referral / same org / same user / email / phone
    if (affiliate.userId === opts.userId || affiliate.organizationId === opts.organizationId) {
      await this.fraudSignal(affiliate.id, opts.organizationId, 'SELF_REFERRAL', 'HIGH', {
        userId: opts.userId,
      });
      return { attached: false, reason: 'SELF_REFERRAL' };
    }
    if (affiliate.user.email.toLowerCase() === opts.email.toLowerCase()) {
      await this.fraudSignal(affiliate.id, opts.organizationId, 'SAME_EMAIL', 'HIGH', {});
      return { attached: false, reason: 'SAME_EMAIL' };
    }
    if (opts.phone && affiliate.user) {
      // phone on user not always present — check org phone
      const affOrg = await this.prisma.organization.findUnique({
        where: { id: affiliate.organizationId },
      });
      if (affOrg?.phone && maskPhone(affOrg.phone) === maskPhone(opts.phone)) {
        await this.fraudSignal(affiliate.id, opts.organizationId, 'SAME_PHONE', 'HIGH', {});
        return { attached: false, reason: 'SAME_PHONE' };
      }
    }

    // IP/fingerprint risk signal only → MANUAL_REVIEW path later on commission
    const sameIpClicks = opts.ip
      ? await this.prisma.affiliateClick.count({
          where: {
            affiliateId: affiliate.id,
            ipHash: hashSignal(opts.ip) ?? undefined,
            createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
        })
      : 0;
    let riskManualReview = false;
    if (sameIpClicks >= 5) {
      riskManualReview = true;
      await this.fraudSignal(affiliate.id, opts.organizationId, 'IP_CLUSTER', 'MEDIUM', {
        sameIpClicks,
      });
    }

    const settings = await this.getSettings();
    try {
      await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.findUnique({ where: { id: opts.organizationId } });
        if (!org) return;
        if (org.referralLockedAt) return; // immutable

        await tx.organization.update({
          where: { id: opts.organizationId },
          data: {
            referredByCode: code,
            referredByAffiliateId: affiliate.id,
            referralLockedAt: new Date(),
          },
        });
        await tx.affiliateReferral.create({
          data: {
            affiliateId: affiliate.id,
            referredOrganizationId: opts.organizationId,
            referredUserId: opts.userId,
            referralCode: code,
            firstOrderOnly: settings.firstOrderOnlyDefault,
            status: riskManualReview ? 'MANUAL_REVIEW' : 'ACTIVE',
          },
        });
        await tx.affiliateProfile.update({
          where: { id: affiliate.id },
          data: { totalSignups: { increment: 1 } },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Unique referredOrganizationId — đã gắn rồi, idempotent
        return { attached: true, reason: 'ALREADY_LOCKED', riskManualReview: false };
      }
      throw e;
    }

    await this.writeAudit({
      affiliateId: affiliate.id,
      actorUserId: opts.userId,
      action: 'AFFILIATE_REFERRAL_LOCKED',
      entityType: 'ORGANIZATION',
      entityId: opts.organizationId,
      after: { code, riskManualReview },
      ipAddress: opts.ip,
    });
    return { attached: true, riskManualReview };
  }

  /**
   * Gọi sau khi SePay xác nhận PAID (post-txn). Idempotent theo orderId.
   */
  async onOrderPaid(notify: PaidOrderNotify) {
    if (notify.skipCommission) {
      this.logger.log(`Skip commission order=${notify.orderId} (admin/manual)`);
      return { created: false, reason: 'SKIPPED' };
    }

    const existing = await this.prisma.affiliateCommission.findUnique({
      where: { orderId: notify.orderId },
    });
    if (existing) {
      return { created: false, reason: 'DUPLICATE_ORDER', commissionId: existing.id };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: notify.organizationId },
    });
    if (!org?.referredByAffiliateId || !org.referredByCode) {
      return { created: false, reason: 'NO_REFERRAL' };
    }

    const referral = await this.prisma.affiliateReferral.findUnique({
      where: { referredOrganizationId: notify.organizationId },
      include: { affiliate: true },
    });
    if (!referral || referral.affiliate.status !== AffiliateProfileStatus.ACTIVE) {
      return { created: false, reason: 'REFERRAL_INACTIVE' };
    }

    const settings = await this.getSettings();
    const priorPaid = await this.prisma.affiliateCommission.count({
      where: {
        organizationId: notify.organizationId,
        status: {
          notIn: [AffiliateCommissionStatus.REJECTED, AffiliateCommissionStatus.REVERSED],
        },
      },
    });

    const isRenewal = priorPaid > 0;
    if (isRenewal) {
      const allow =
        referral.affiliate.allowRenewalCommission || settings.allowRenewalCommission;
      if (!allow || referral.firstOrderOnly) {
        return { created: false, reason: 'RENEWAL_DISABLED' };
      }
    }

    const rate = Number(
      referral.affiliate.customRate ?? settings.defaultCommissionRate,
    );
    const net = Math.max(0, Math.round(notify.amount));
    const commissionVnd = Math.floor(net * rate);
    if (commissionVnd <= 0) return { created: false, reason: 'ZERO_COMMISSION' };

    const holdUntil = new Date(Date.now() + settings.holdDays * 86400000);
    const manual =
      referral.status === 'MANUAL_REVIEW' ||
      (await this.prisma.affiliateFraudSignal.count({
        where: {
          organizationId: notify.organizationId,
          resolved: false,
          severity: { in: [AffiliateFraudSeverity.HIGH, AffiliateFraudSeverity.MEDIUM] },
        },
      })) > 0;

    try {
      const commission = await this.prisma.$transaction(async (tx) => {
        const raced = await tx.affiliateCommission.findUnique({
          where: { orderId: notify.orderId },
        });
        if (raced) return raced;

        const c = await tx.affiliateCommission.create({
          data: {
            affiliateId: referral.affiliateId,
            referralId: referral.id,
            orderId: notify.orderId,
            orderCode: notify.code,
            sepayTransactionId: notify.sepayId,
            organizationId: notify.organizationId,
            grossAmountVnd: net,
            netAmountVnd: net,
            rate,
            commissionVnd,
            status: manual
              ? AffiliateCommissionStatus.MANUAL_REVIEW
              : AffiliateCommissionStatus.PENDING,
            isUpgrade: !!notify.isUpgrade,
            isRenewal,
            holdUntil,
            metadata: {
              source: 'SEPAY_WEBHOOK',
            } as Prisma.InputJsonValue,
          },
        });
        await tx.affiliateProfile.update({
          where: { id: referral.affiliateId },
          data: {
            pendingAmount: { increment: commissionVnd },
            ...(priorPaid === 0 ? { totalPaidRefs: { increment: 1 } } : {}),
          },
        });
        if (!referral.firstPaidAt) {
          await tx.affiliateReferral.update({
            where: { id: referral.id },
            data: { firstPaidAt: new Date() },
          });
        }
        return c;
      });

      if (commission.status === AffiliateCommissionStatus.PENDING) {
        await this.scheduleHoldRelease(commission.id, holdUntil);
      }

      await this.writeAudit({
        affiliateId: referral.affiliateId,
        action: 'AFFILIATE_COMMISSION_CREATED',
        entityType: 'AFFILIATE_COMMISSION',
        entityId: commission.id,
        after: {
          orderId: notify.orderId,
          commissionVnd,
          status: commission.status,
          holdUntil: holdUntil.toISOString(),
        },
      });

      return { created: true, commissionId: commission.id, status: commission.status };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { created: false, reason: 'DUPLICATE_ORDER' };
      }
      this.logger.error(`Commission create failed: ${String(e)}`);
      throw e;
    }
  }

  async scheduleHoldRelease(commissionId: string, holdUntil: Date) {
    const delay = Math.max(0, holdUntil.getTime() - Date.now());
    try {
      const old = await this.holdQueue.getJob(`aff-hold-${commissionId}`);
      if (old) await old.remove();
    } catch {
      /* ignore */
    }
    await this.queueEnqueue.add(
      this.holdQueue,
      'affiliate-hold-release',
      { organizationId: 'platform', commissionId },
      {
        jobId: `aff-hold-${commissionId}`,
        delay,
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );
  }

  /** Worker: PENDING → AVAILABLE sau hold */
  async releaseHeldCommission(commissionId: string) {
    const c = await this.prisma.affiliateCommission.findUnique({
      where: { id: commissionId },
    });
    if (!c) return { ok: false, reason: 'NOT_FOUND' };
    if (c.status !== AffiliateCommissionStatus.PENDING) {
      return { ok: false, reason: `STATUS_${c.status}` };
    }
    if (c.holdUntil.getTime() > Date.now()) {
      return { ok: false, reason: 'HOLD_ACTIVE' };
    }

    await this.prisma.$transaction(async (tx) => {
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
    return { ok: true };
  }

  async reverseCommissionForOrder(orderId: string, reason: string) {
    const c = await this.prisma.affiliateCommission.findUnique({ where: { orderId } });
    if (!c) return { reversed: false };
    if (
      c.status === AffiliateCommissionStatus.REVERSED ||
      c.status === AffiliateCommissionStatus.REJECTED
    ) {
      return { reversed: false, reason: 'ALREADY' };
    }
    if (c.status === AffiliateCommissionStatus.PAID) {
      return { reversed: false, reason: 'ALREADY_PAID' };
    }

    await this.prisma.$transaction(async (tx) => {
      const before = { status: c.status, commissionVnd: Number(c.commissionVnd) };
      await tx.affiliateCommission.update({
        where: { id: c.id },
        data: {
          status: AffiliateCommissionStatus.REVERSED,
          reverseReason: reason,
        },
      });
      const profilePatch: Prisma.AffiliateProfileUpdateInput = {};
      if (
        c.status === AffiliateCommissionStatus.PENDING ||
        c.status === AffiliateCommissionStatus.APPROVED ||
        c.status === AffiliateCommissionStatus.MANUAL_REVIEW
      ) {
        profilePatch.pendingAmount = { decrement: c.commissionVnd };
      } else if (c.status === AffiliateCommissionStatus.AVAILABLE) {
        profilePatch.availableAmount = { decrement: c.commissionVnd };
      } else if (c.status === AffiliateCommissionStatus.PAYOUT_PENDING) {
        profilePatch.availableAmount = { decrement: c.commissionVnd };
      }
      if (Object.keys(profilePatch).length) {
        await tx.affiliateProfile.update({
          where: { id: c.affiliateId },
          data: profilePatch,
        });
      }
      await tx.affiliateAuditLog.create({
        data: {
          affiliateId: c.affiliateId,
          action: 'AFFILIATE_COMMISSION_REVERSED',
          entityType: 'AFFILIATE_COMMISSION',
          entityId: c.id,
          reason,
          before: before as Prisma.InputJsonValue,
          after: { status: 'REVERSED' },
        },
      });
    });
    return { reversed: true };
  }

  async listReferrals(user: AuthUser, page = 1, pageSize = 20) {
    const profile = await this.requireOwnProfile(user);
    const [total, items] = await Promise.all([
      this.prisma.affiliateReferral.count({ where: { affiliateId: profile.id } }),
      this.prisma.affiliateReferral.findMany({
        where: { affiliateId: profile.id },
        include: {
          referredOrganization: {
            select: { id: true, name: true, email: true, phone: true, createdAt: true },
          },
        },
        orderBy: { registeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Ưu tiên email user đăng ký (Gmail đầy đủ) — chỉ trả cho chính affiliate sở hữu referral
    const userIds = items
      .map((r) => r.referredUserId)
      .filter((id): id is string => !!id);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailByUserId = new Map(users.map((u) => [u.id, u.email]));

    return {
      items: items.map((r) => {
        const userEmail = r.referredUserId ? emailByUserId.get(r.referredUserId) : undefined;
        const fullEmail =
          userEmail || r.referredOrganization.email || '';
        return {
          id: r.id,
          registeredAt: r.registeredAt,
          firstPaidAt: r.firstPaidAt,
          status: r.status,
          organization: {
            name: r.referredOrganization.name,
            email: fullEmail,
            phone: maskPhone(r.referredOrganization.phone),
            joinedAt: r.referredOrganization.createdAt,
          },
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async listCommissions(user: AuthUser, page = 1, pageSize = 20, status?: string) {
    const profile = await this.requireOwnProfile(user);
    const where: Prisma.AffiliateCommissionWhereInput = { affiliateId: profile.id };
    if (status) where.status = status as AffiliateCommissionStatus;
    const [total, items] = await Promise.all([
      this.prisma.affiliateCommission.count({ where }),
      this.prisma.affiliateCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((c) => ({
        id: c.id,
        orderCode: c.orderCode,
        netAmountVnd: Number(c.netAmountVnd),
        rate: Number(c.rate),
        commissionVnd: Number(c.commissionVnd),
        status: c.status,
        isUpgrade: c.isUpgrade,
        isRenewal: c.isRenewal,
        holdUntil: c.holdUntil,
        availableAt: c.availableAt,
        createdAt: c.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async upsertPayoutMethod(user: AuthUser, dto: UpsertPayoutMethodDto) {
    const profile = await this.requireOwnProfile(user);
    const accountNumber = dto.accountNumber.replace(/\s+/g, '');
    const clash = await this.prisma.affiliatePayoutMethod.findUnique({
      where: { accountNumber },
    });
    if (clash && clash.affiliateId !== profile.id) {
      throw new ConflictException('Số tài khoản ngân hàng đã được gắn với Affiliate khác');
    }

    const method = await this.prisma.$transaction(async (tx) => {
      await tx.affiliateProfile.update({
        where: { id: profile.id },
        data: {
          taxId: dto.taxId?.trim() || profile.taxId,
          taxName: dto.taxName?.trim() || profile.taxName,
        },
      });
      return tx.affiliatePayoutMethod.upsert({
        where: { affiliateId: profile.id },
        create: {
          affiliateId: profile.id,
          bankCode: dto.bankCode.trim(),
          bankName: dto.bankName.trim(),
          accountNumber,
          accountName: dto.accountName.trim().toUpperCase(),
          branchName: dto.branchName?.trim(),
          verifiedAt: new Date(),
        },
        update: {
          bankCode: dto.bankCode.trim(),
          bankName: dto.bankName.trim(),
          accountNumber,
          accountName: dto.accountName.trim().toUpperCase(),
          branchName: dto.branchName?.trim(),
          verifiedAt: new Date(),
        },
      });
    });

    await this.writeAudit({
      affiliateId: profile.id,
      actorUserId: user.id,
      action: 'AFFILIATE_PAYOUT_METHOD_UPSERT',
      entityType: 'AFFILIATE_PAYOUT_METHOD',
      entityId: method.id,
      after: redactForAudit({
        bankCode: method.bankCode,
        accountNumber: `***${accountNumber.slice(-4)}`,
        accountName: method.accountName,
      }) as Prisma.InputJsonValue,
    });

    return {
      bankCode: method.bankCode,
      bankName: method.bankName,
      accountNumberMasked: `***${accountNumber.slice(-4)}`,
      accountName: method.accountName,
      branchName: method.branchName,
      verifiedAt: method.verifiedAt,
    };
  }

  async createPayoutRequest(user: AuthUser, dto: CreatePayoutRequestDto) {
    const profile = await this.requireOwnProfile(user);
    const settings = await this.getSettings();
    const min = Number(settings.minPayoutVnd);
    if (dto.amountVnd < min) {
      throw new BadRequestException(`Số tiền rút tối thiểu ${min.toLocaleString('vi-VN')}đ`);
    }
    const method = await this.prisma.affiliatePayoutMethod.findUnique({
      where: { affiliateId: profile.id },
    });
    if (!method?.verifiedAt) {
      throw new BadRequestException('Vui lòng xác minh thông tin ngân hàng trước khi rút');
    }

    const available = await this.prisma.affiliateCommission.findMany({
      where: {
        affiliateId: profile.id,
        status: AffiliateCommissionStatus.AVAILABLE,
      },
      orderBy: { availableAt: 'asc' },
    });
    const sumAvail = available.reduce((s, c) => s + Number(c.commissionVnd), 0);
    if (dto.amountVnd > sumAvail) {
      throw new BadRequestException('Số dư khả dụng không đủ');
    }

    // Pick commissions covering amount
    let remaining = dto.amountVnd;
    const picked: string[] = [];
    for (const c of available) {
      if (remaining <= 0) break;
      picked.push(c.id);
      remaining -= Number(c.commissionVnd);
    }

    const req = await this.prisma.$transaction(async (tx) => {
      const r = await tx.affiliatePayoutRequest.create({
        data: {
          affiliateId: profile.id,
          amountVnd: dto.amountVnd,
          status: AffiliatePayoutStatus.PENDING,
          bankCode: method.bankCode,
          bankName: method.bankName,
          accountNumber: method.accountNumber,
          accountName: method.accountName,
          taxId: profile.taxId,
          note: dto.note,
        },
      });
      await tx.affiliateCommission.updateMany({
        where: { id: { in: picked } },
        data: {
          status: AffiliateCommissionStatus.PAYOUT_PENDING,
          payoutRequestId: r.id,
        },
      });
      await tx.affiliateProfile.update({
        where: { id: profile.id },
        data: {
          availableAmount: { decrement: dto.amountVnd },
        },
      });
      return r;
    });

    await this.writeAudit({
      affiliateId: profile.id,
      actorUserId: user.id,
      action: 'AFFILIATE_PAYOUT_REQUESTED',
      entityType: 'AFFILIATE_PAYOUT_REQUEST',
      entityId: req.id,
      after: { amountVnd: dto.amountVnd, commissionIds: picked },
    });

    return {
      id: req.id,
      amountVnd: Number(req.amountVnd),
      status: req.status,
      createdAt: req.createdAt,
    };
  }

  async listPayouts(user: AuthUser, page = 1, pageSize = 20) {
    const profile = await this.requireOwnProfile(user);
    const [total, items] = await Promise.all([
      this.prisma.affiliatePayoutRequest.count({ where: { affiliateId: profile.id } }),
      this.prisma.affiliatePayoutRequest.findMany({
        where: { affiliateId: profile.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((p) => ({
        id: p.id,
        amountVnd: Number(p.amountVnd),
        status: p.status,
        accountNumberMasked: `***${p.accountNumber.slice(-4)}`,
        bankName: p.bankName,
        rejectReason: p.rejectReason,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  private async requireOwnProfile(user: AuthUser) {
    const p = await this.prisma.affiliateProfile.findUnique({ where: { userId: user.id } });
    if (!p) {
      await this.ensureProfile(user);
      const again = await this.prisma.affiliateProfile.findUnique({ where: { userId: user.id } });
      if (!again) throw new NotFoundException('Chưa có Affiliate Profile');
      return again;
    }
    return p;
  }

  private mapProfile(
    p: {
      id: string;
      code: string;
      status: AffiliateProfileStatus;
      customRate: Prisma.Decimal | null;
      allowRenewalCommission: boolean;
      totalClicks: number;
      totalSignups: number;
      totalPaidRefs: number;
      pendingAmount: Prisma.Decimal;
      availableAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      taxId: string | null;
      taxName: string | null;
      payoutMethod?: {
        bankCode: string;
        bankName: string;
        accountNumber: string;
        accountName: string;
        verifiedAt: Date | null;
      } | null;
    },
    settings?: { publicBaseUrl: string },
  ) {
    const base = settings?.publicBaseUrl || 'https://marketingautoaz.com';
    return {
      id: p.id,
      code: p.code,
      status: p.status,
      customRate: p.customRate != null ? Number(p.customRate) : null,
      allowRenewalCommission: p.allowRenewalCommission,
      totalClicks: p.totalClicks,
      totalSignups: p.totalSignups,
      totalPaidRefs: p.totalPaidRefs,
      pendingAmount: Number(p.pendingAmount),
      availableAmount: Number(p.availableAmount),
      paidAmount: Number(p.paidAmount),
      taxId: p.taxId,
      taxName: p.taxName,
      referralLink: `${base.replace(/\/$/, '')}/?ref=${p.code}`,
      payoutMethod: p.payoutMethod
        ? {
            bankCode: p.payoutMethod.bankCode,
            bankName: p.payoutMethod.bankName,
            accountNumberMasked: `***${p.payoutMethod.accountNumber.slice(-4)}`,
            accountName: p.payoutMethod.accountName,
            verifiedAt: p.payoutMethod.verifiedAt,
          }
        : null,
    };
  }

  private async fraudSignal(
    affiliateId: string | null,
    organizationId: string | null,
    signalType: string,
    severity: AffiliateFraudSeverity,
    details: Record<string, unknown>,
  ) {
    await this.prisma.affiliateFraudSignal.create({
      data: {
        affiliateId: affiliateId ?? undefined,
        organizationId: organizationId ?? undefined,
        signalType,
        severity,
        details: redactForAudit(details) as Prisma.InputJsonValue,
      },
    });
  }

  async writeAudit(input: {
    affiliateId?: string | null;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    reason?: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    ipAddress?: string;
  }) {
    await this.prisma.affiliateAuditLog.create({
      data: {
        affiliateId: input.affiliateId ?? undefined,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason,
        before: input.before ? (redactForAudit(input.before) as Prisma.InputJsonValue) : undefined,
        after: input.after ? (redactForAudit(input.after) as Prisma.InputJsonValue) : undefined,
        ipAddress: input.ipAddress,
      },
    });
  }
}
