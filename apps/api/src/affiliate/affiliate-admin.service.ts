import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AffiliateCommissionStatus,
  AffiliatePayoutStatus,
  AffiliateProfileStatus,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AffiliateService } from './affiliate.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  AdminPayoutDecisionDto,
  AdminReverseCommissionDto,
  AdminSetAffiliateStatusDto,
  AdminSetRateDto,
  AdminUpdateSettingsDto,
  AffiliateListQueryDto,
  AffiliateReasonDto,
} from './dto/affiliate.dto';
import { redactForAudit } from '../common/utils/token-security.util';

@Injectable()
export class AffiliateAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affiliate: AffiliateService,
  ) {}

  async overview() {
    const [
      partners,
      activePartners,
      referrals,
      pendingComm,
      availableComm,
      paidComm,
      payoutPending,
      fraudOpen,
    ] = await Promise.all([
      this.prisma.affiliateProfile.count(),
      this.prisma.affiliateProfile.count({ where: { status: AffiliateProfileStatus.ACTIVE } }),
      this.prisma.affiliateReferral.count(),
      this.prisma.affiliateCommission.aggregate({
        where: { status: { in: [AffiliateCommissionStatus.PENDING, AffiliateCommissionStatus.MANUAL_REVIEW] } },
        _sum: { commissionVnd: true },
        _count: true,
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { status: AffiliateCommissionStatus.AVAILABLE },
        _sum: { commissionVnd: true },
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { status: AffiliateCommissionStatus.PAID },
        _sum: { commissionVnd: true },
      }),
      this.prisma.affiliatePayoutRequest.count({
        where: { status: AffiliatePayoutStatus.PENDING },
      }),
      this.prisma.affiliateFraudSignal.count({ where: { resolved: false } }),
    ]);
    return {
      partners,
      activePartners,
      referrals,
      pendingCommission: Number(pendingComm._sum.commissionVnd ?? 0),
      pendingCount: pendingComm._count,
      availableCommission: Number(availableComm._sum.commissionVnd ?? 0),
      paidCommission: Number(paidComm._sum.commissionVnd ?? 0),
      payoutRequestsPending: payoutPending,
      fraudOpen,
    };
  }

  async listPartners(query: AffiliateListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AffiliateProfileWhereInput = {};
    if (query.status) where.status = query.status as AffiliateProfileStatus;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.affiliateProfile.count({ where }),
      this.prisma.affiliateProfile.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          organization: { select: { id: true, name: true, slug: true } },
          payoutMethod: {
            select: {
              bankName: true,
              accountNumber: true,
              accountName: true,
              verifiedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((p) => ({
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
        user: p.user,
        organization: p.organization,
        payoutMethod: p.payoutMethod
          ? {
              bankName: p.payoutMethod.bankName,
              accountNumberMasked: `***${p.payoutMethod.accountNumber.slice(-4)}`,
              accountName: p.payoutMethod.accountName,
              verifiedAt: p.payoutMethod.verifiedAt,
            }
          : null,
        createdAt: p.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async setStatus(actor: AuthUser, id: string, dto: AdminSetAffiliateStatusDto, ip?: string) {
    const before = await this.prisma.affiliateProfile.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy đối tác');
    const after = await this.prisma.$transaction(async (tx) => {
      const u = await tx.affiliateProfile.update({
        where: { id },
        data: { status: dto.status as AffiliateProfileStatus },
      });
      await tx.affiliateAuditLog.create({
        data: {
          affiliateId: id,
          actorUserId: actor.id,
          action: 'ADMIN_AFFILIATE_STATUS',
          entityType: 'AFFILIATE_PROFILE',
          entityId: id,
          reason: dto.reason,
          before: { status: before.status },
          after: { status: u.status },
          ipAddress: ip,
        },
      });
      return u;
    });
    return { before: { status: before.status }, after: { status: after.status } };
  }

  async setRate(actor: AuthUser, id: string, dto: AdminSetRateDto, ip?: string) {
    const before = await this.prisma.affiliateProfile.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy đối tác');
    const after = await this.prisma.$transaction(async (tx) => {
      const u = await tx.affiliateProfile.update({
        where: { id },
        data: {
          customRate: dto.customRate,
          ...(dto.allowRenewalCommission != null
            ? { allowRenewalCommission: dto.allowRenewalCommission }
            : {}),
        },
      });
      await tx.affiliateAuditLog.create({
        data: {
          affiliateId: id,
          actorUserId: actor.id,
          action: 'ADMIN_AFFILIATE_RATE',
          entityType: 'AFFILIATE_PROFILE',
          entityId: id,
          reason: dto.reason,
          before: {
            customRate: before.customRate != null ? Number(before.customRate) : null,
            allowRenewalCommission: before.allowRenewalCommission,
          },
          after: {
            customRate: Number(u.customRate),
            allowRenewalCommission: u.allowRenewalCommission,
          },
          ipAddress: ip,
        },
      });
      return u;
    });
    return {
      before: {
        customRate: before.customRate != null ? Number(before.customRate) : null,
      },
      after: { customRate: Number(after.customRate) },
    };
  }

  async listReferrals(query: AffiliateListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AffiliateReferralWhereInput = {};
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { referralCode: { contains: q, mode: 'insensitive' } },
        { referredOrganization: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.affiliateReferral.count({ where }),
      this.prisma.affiliateReferral.findMany({
        where,
        include: {
          affiliate: { select: { id: true, code: true } },
          referredOrganization: { select: { id: true, name: true, email: true } },
        },
        orderBy: { registeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((r) => ({
        id: r.id,
        code: r.referralCode,
        status: r.status,
        registeredAt: r.registeredAt,
        firstPaidAt: r.firstPaidAt,
        affiliate: r.affiliate,
        organization: {
          id: r.referredOrganization.id,
          name: r.referredOrganization.name,
          email: r.referredOrganization.email
            ? `${r.referredOrganization.email.slice(0, 2)}***`
            : null,
        },
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async listCommissions(query: AffiliateListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AffiliateCommissionWhereInput = {};
    if (query.status) where.status = query.status as AffiliateCommissionStatus;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { orderCode: { contains: q, mode: 'insensitive' } },
        { sepayTransactionId: { contains: q } },
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.affiliateCommission.count({ where }),
      this.prisma.affiliateCommission.findMany({
        where,
        include: { affiliate: { select: { id: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        orderCode: c.orderCode,
        sepayTransactionId: c.sepayTransactionId,
        affiliate: c.affiliate,
        netAmountVnd: Number(c.netAmountVnd),
        commissionVnd: Number(c.commissionVnd),
        rate: Number(c.rate),
        status: c.status,
        holdUntil: c.holdUntil,
        createdAt: c.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async approveCommission(actor: AuthUser, id: string, dto: AffiliateReasonDto, ip?: string) {
    const c = await this.prisma.affiliateCommission.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy hoa hồng');
    if (
      c.status !== AffiliateCommissionStatus.PENDING &&
      c.status !== AffiliateCommissionStatus.MANUAL_REVIEW
    ) {
      throw new BadRequestException('Chỉ duyệt hoa hồng PENDING/MANUAL_REVIEW');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.affiliateCommission.update({
        where: { id },
        data: {
          status: AffiliateCommissionStatus.AVAILABLE,
          availableAt: new Date(),
        },
      });
      await tx.affiliateProfile.update({
        where: { id: c.affiliateId },
        data: {
          pendingAmount: { decrement: c.commissionVnd },
          availableAmount: { increment: c.commissionVnd },
        },
      });
      await tx.affiliateAuditLog.create({
        data: {
          affiliateId: c.affiliateId,
          actorUserId: actor.id,
          action: 'ADMIN_COMMISSION_APPROVE',
          entityType: 'AFFILIATE_COMMISSION',
          entityId: id,
          reason: dto.reason,
          before: { status: c.status },
          after: { status: 'AVAILABLE' },
          ipAddress: ip,
        },
      });
    });
    return { ok: true };
  }

  async reverseCommission(actor: AuthUser, id: string, dto: AdminReverseCommissionDto, ip?: string) {
    const c = await this.prisma.affiliateCommission.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy hoa hồng');
    const result = await this.affiliate.reverseCommissionForOrder(c.orderId, dto.reason);
    await this.affiliate.writeAudit({
      affiliateId: c.affiliateId,
      actorUserId: actor.id,
      action: 'ADMIN_COMMISSION_REVERSE',
      entityType: 'AFFILIATE_COMMISSION',
      entityId: id,
      reason: dto.reason,
      before: { status: c.status },
      after: { result },
      ipAddress: ip,
    });
    return result;
  }

  async listPayouts(query: AffiliateListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AffiliatePayoutRequestWhereInput = {};
    if (query.status) where.status = query.status as AffiliatePayoutStatus;
    const [total, items] = await Promise.all([
      this.prisma.affiliatePayoutRequest.count({ where }),
      this.prisma.affiliatePayoutRequest.findMany({
        where,
        include: {
          affiliate: {
            select: {
              id: true,
              code: true,
              user: { select: { email: true, name: true } },
            },
          },
        },
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
        bankName: p.bankName,
        accountNumberMasked: `***${p.accountNumber.slice(-4)}`,
        accountName: p.accountName,
        taxId: p.taxId,
        rejectReason: p.rejectReason,
        paidReference: p.paidReference,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        affiliate: p.affiliate,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async approvePayout(actor: AuthUser, id: string, dto: AffiliateReasonDto, ip?: string) {
    const p = await this.prisma.affiliatePayoutRequest.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Không tìm thấy yêu cầu rút');
    if (p.status !== AffiliatePayoutStatus.PENDING) {
      throw new BadRequestException('Chỉ duyệt yêu cầu PENDING');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.affiliatePayoutRequest.update({
        where: { id },
        data: {
          status: AffiliatePayoutStatus.APPROVED,
          reviewedByUserId: actor.id,
        },
      });
      await tx.affiliateAuditLog.create({
        data: {
          affiliateId: p.affiliateId,
          actorUserId: actor.id,
          action: 'ADMIN_PAYOUT_APPROVE',
          entityType: 'AFFILIATE_PAYOUT_REQUEST',
          entityId: id,
          reason: dto.reason,
          before: { status: p.status },
          after: { status: 'APPROVED' },
          ipAddress: ip,
        },
      });
    });
    return { ok: true };
  }

  async rejectPayout(actor: AuthUser, id: string, dto: AffiliateReasonDto, ip?: string) {
    const p = await this.prisma.affiliatePayoutRequest.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Không tìm thấy yêu cầu rút');
    if (
      p.status !== AffiliatePayoutStatus.PENDING &&
      p.status !== AffiliatePayoutStatus.APPROVED
    ) {
      throw new BadRequestException('Không thể từ chối yêu cầu này');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.affiliatePayoutRequest.update({
        where: { id },
        data: {
          status: AffiliatePayoutStatus.REJECTED,
          rejectReason: dto.reason,
          reviewedByUserId: actor.id,
        },
      });
      await tx.affiliateCommission.updateMany({
        where: {
          payoutRequestId: id,
          status: AffiliateCommissionStatus.PAYOUT_PENDING,
        },
        data: {
          status: AffiliateCommissionStatus.AVAILABLE,
          payoutRequestId: null,
        },
      });
      await tx.affiliateProfile.update({
        where: { id: p.affiliateId },
        data: { availableAmount: { increment: p.amountVnd } },
      });
      await tx.affiliateAuditLog.create({
        data: {
          affiliateId: p.affiliateId,
          actorUserId: actor.id,
          action: 'ADMIN_PAYOUT_REJECT',
          entityType: 'AFFILIATE_PAYOUT_REQUEST',
          entityId: id,
          reason: dto.reason,
          before: { status: p.status, amountVnd: Number(p.amountVnd) },
          after: { status: 'REJECTED' },
          ipAddress: ip,
        },
      });
    });
    return { ok: true };
  }

  async markPayoutPaid(actor: AuthUser, id: string, dto: AdminPayoutDecisionDto, ip?: string) {
    const p = await this.prisma.affiliatePayoutRequest.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Không tìm thấy yêu cầu rút');
    if (
      p.status !== AffiliatePayoutStatus.APPROVED &&
      p.status !== AffiliatePayoutStatus.PENDING
    ) {
      throw new BadRequestException('Chỉ đánh dấu đã chuyển khi PENDING/APPROVED');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.affiliatePayoutRequest.update({
        where: { id },
        data: {
          status: AffiliatePayoutStatus.PAID,
          paidAt: new Date(),
          paidReference: dto.paidReference,
          reviewedByUserId: actor.id,
        },
      });
      await tx.affiliateCommission.updateMany({
        where: { payoutRequestId: id },
        data: { status: AffiliateCommissionStatus.PAID },
      });
      await tx.affiliateProfile.update({
        where: { id: p.affiliateId },
        data: { paidAmount: { increment: p.amountVnd } },
      });
      await tx.affiliateAuditLog.create({
        data: {
          affiliateId: p.affiliateId,
          actorUserId: actor.id,
          action: 'ADMIN_PAYOUT_PAID',
          entityType: 'AFFILIATE_PAYOUT_REQUEST',
          entityId: id,
          reason: dto.reason,
          before: { status: p.status },
          after: {
            status: 'PAID',
            paidReference: dto.paidReference,
            amountVnd: Number(p.amountVnd),
          },
          ipAddress: ip,
        },
      });
    });
    return { ok: true };
  }

  async listFraud(query: AffiliateListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [total, items] = await Promise.all([
      this.prisma.affiliateFraudSignal.count({ where: { resolved: false } }),
      this.prisma.affiliateFraudSignal.findMany({
        where: { resolved: false },
        include: { affiliate: { select: { id: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((f) => ({
        id: f.id,
        signalType: f.signalType,
        severity: f.severity,
        details: redactForAudit(f.details),
        affiliate: f.affiliate,
        organizationId: f.organizationId,
        createdAt: f.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getSettings() {
    return this.affiliate.getSettings();
  }

  async updateSettings(actor: AuthUser, dto: AdminUpdateSettingsDto, ip?: string) {
    const before = await this.affiliate.getSettings();
    const after = await this.prisma.$transaction(async (tx) => {
      const u = await tx.affiliateSetting.update({
        where: { id: 'default' },
        data: {
          ...(dto.defaultCommissionRate != null
            ? { defaultCommissionRate: dto.defaultCommissionRate }
            : {}),
          ...(dto.holdDays != null ? { holdDays: dto.holdDays } : {}),
          ...(dto.minPayoutVnd != null ? { minPayoutVnd: dto.minPayoutVnd } : {}),
          ...(dto.firstOrderOnlyDefault != null
            ? { firstOrderOnlyDefault: dto.firstOrderOnlyDefault }
            : {}),
          ...(dto.allowRenewalCommission != null
            ? { allowRenewalCommission: dto.allowRenewalCommission }
            : {}),
        },
      });
      await tx.affiliateAuditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'ADMIN_AFFILIATE_SETTINGS',
          entityType: 'AFFILIATE_SETTING',
          entityId: 'default',
          reason: dto.reason,
          before: {
            defaultCommissionRate: Number(before.defaultCommissionRate),
            holdDays: before.holdDays,
            minPayoutVnd: Number(before.minPayoutVnd),
          },
          after: {
            defaultCommissionRate: Number(u.defaultCommissionRate),
            holdDays: u.holdDays,
            minPayoutVnd: Number(u.minPayoutVnd),
          },
          ipAddress: ip,
        },
      });
      return u;
    });
    return { before, after };
  }

  async listAudit(query: AffiliateListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where: Prisma.AffiliateAuditLogWhereInput = {};
    if (query.q?.trim()) {
      where.OR = [
        { action: { contains: query.q.trim(), mode: 'insensitive' } },
        { entityType: { contains: query.q.trim(), mode: 'insensitive' } },
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.affiliateAuditLog.count({ where }),
      this.prisma.affiliateAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        reason: a.reason,
        before: redactForAudit(a.before),
        after: redactForAudit(a.after),
        actorUserId: a.actorUserId,
        affiliateId: a.affiliateId,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
