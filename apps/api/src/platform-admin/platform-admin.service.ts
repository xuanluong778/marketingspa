import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreditService } from '../credit/credit.service';
import { BillingMailService } from '../billing/billing-mail.service';
import { CREDIT_GRANT_SOURCES } from '@marketingspa/shared';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  AdminCreditAdjustDto,
  AdminExtendSubscriptionDto,
  AdminGiftTimeDto,
  AdminListQueryDto,
  AdminReasonDto,
  AdminSetActiveDto,
  AdminSoftDeleteUserDto,
} from './dto/platform-admin.dto';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  authProvider: true,
  isActive: true,
  deletedAt: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  organizationId: true,
  role: { select: { id: true, code: true, name: true } },
  organization: { select: { id: true, name: true, slug: true, email: true, isActive: true } },
} satisfies Prisma.UserSelect;

const USER_MGMT_ACTIONS = [
  'PLATFORM_USER_LOCK',
  'PLATFORM_USER_UNLOCK',
  'PLATFORM_USER_FORCE_LOGOUT',
  'PLATFORM_USER_SOFT_DELETE',
  'PLATFORM_USER_GIFT_TIME',
] as const;

function addGiftDuration(
  base: Date,
  unit: 'days' | 'months' | 'years',
  amount: number,
): Date {
  const end = new Date(base);
  if (unit === 'days') end.setDate(end.getDate() + amount);
  else if (unit === 'months') end.setMonth(end.getMonth() + amount);
  else end.setFullYear(end.getFullYear() + amount);
  return end;
}

/** Hạn “vĩnh viễn” — dùng chung cho admin tặng gói */
export const PERMANENT_SUBSCRIPTION_END = new Date('2099-12-31T23:59:59.999Z');

const GIFT_AMOUNT_MAX: Record<'days' | 'months' | 'years', number> = {
  days: 3650,
  months: 120,
  years: 10,
};

const ORG_SUB_SELECT = {
  id: true,
  name: true,
  slug: true,
  email: true,
  isActive: true,
  creditWallet: { select: { balance: true } },
} satisfies Prisma.OrganizationSelect;

type GiftIntent = {
  durationGift: boolean;
  creditAmount: number;
  unit: 'days' | 'months' | 'years';
};

function parseGiftIntent(dto: AdminGiftTimeDto): GiftIntent {
  const creditAmount = Number(dto.creditAmount ?? 0);
  const durationGift = Boolean(dto.permanent) || Number(dto.amount) >= 1;
  if (!Number.isFinite(creditAmount) || creditAmount < 0 || !Number.isInteger(creditAmount)) {
    throw new BadRequestException('Số AI Credit không hợp lệ');
  }
  if (creditAmount > 10_000_000) {
    throw new BadRequestException('Số AI Credit vượt giới hạn');
  }
  if (!durationGift && creditAmount <= 0) {
    throw new BadRequestException('Cần tặng thời hạn hoặc AI Credit');
  }
  const unit = dto.unit ?? 'days';
  if (durationGift && !dto.permanent) {
    if (!dto.unit) {
      throw new BadRequestException('Thiếu loại thời hạn');
    }
    const amount = Number(dto.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      throw new BadRequestException('Số lượng thời hạn phải là số nguyên lớn hơn 0');
    }
    if (amount > GIFT_AMOUNT_MAX[dto.unit]) {
      throw new BadRequestException('Số lượng thời hạn vượt giới hạn');
    }
  }
  return { durationGift, creditAmount, unit };
}

function resolveGiftEndDate(
  base: Date,
  dto: { unit: 'days' | 'months' | 'years'; amount?: number; permanent?: boolean },
): Date {
  if (dto.permanent) return PERMANENT_SUBSCRIPTION_END;
  const amount = dto.amount ?? 0;
  if (amount < 1) {
    throw new BadRequestException('Số lượng phải lớn hơn 0');
  }
  if (!dto.unit) {
    throw new BadRequestException('Thiếu loại thời hạn');
  }
  return addGiftDuration(base, dto.unit, amount);
}

function giftDurationLabel(dto: AdminGiftTimeDto): string {
  if (dto.permanent) return 'Vĩnh viễn';
  const n = dto.amount ?? 0;
  if (!(n >= 1)) return '';
  if (dto.unit === 'days') return `${n} ngày`;
  if (dto.unit === 'months') return `${n} tháng`;
  if (dto.unit === 'years') return `${n} năm`;
  return '';
}

@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly credit: CreditService,
    private readonly billingMail: BillingMailService,
  ) {}

  async overview() {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const in15 = new Date(now.getTime() + 15 * 86400000);

    const [
      organizations,
      users,
      activeUsers,
      subscriptionsActive,
      subscriptionsExpired,
      expiring7,
      expiring15,
      paymentOrdersPending,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.subscription.count({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] }, currentPeriodEnd: { gt: now } },
      }),
      this.prisma.subscription.count({
        where: { OR: [{ status: SubscriptionStatus.EXPIRED }, { currentPeriodEnd: { lte: now } }] },
      }),
      this.prisma.subscription.count({
        where: { currentPeriodEnd: { gt: now, lte: in7 } },
      }),
      this.prisma.subscription.count({
        where: { currentPeriodEnd: { gt: now, lte: in15 } },
      }),
      this.prisma.paymentOrder.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      organizations,
      users,
      activeUsers,
      subscriptionsActive,
      subscriptionsExpired,
      expiring7,
      expiring15,
      paymentOrdersPending,
    };
  }

  async listOrganizations(query: AdminListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrganizationWhereInput = {};
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'inactive') where.isActive = false;

    const [total, items] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        include: {
          _count: { select: { users: true, subscriptions: true } },
          subscriptions: {
            orderBy: { currentPeriodEnd: 'desc' },
            take: 1,
            include: { plan: { select: { code: true, name: true, durationMonths: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        email: o.email,
        phone: o.phone,
        isActive: o.isActive,
        createdAt: o.createdAt,
        userCount: o._count.users,
        subscriptionCount: o._count.subscriptions,
        currentSubscription: o.subscriptions[0]
          ? {
              id: o.subscriptions[0].id,
              planCode: o.subscriptions[0].plan.code,
              planName: o.subscriptions[0].plan.name,
              durationMonths: o.subscriptions[0].plan.durationMonths,
              status: o.subscriptions[0].status,
              currentPeriodEnd: o.subscriptions[0].currentPeriodEnd,
              remainingDays: Math.max(
                0,
                Math.ceil((o.subscriptions[0].currentPeriodEnd.getTime() - Date.now()) / 86400000),
              ),
            }
          : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getOrganization(id: string) {
    const o = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        users: {
          select: SAFE_USER_SELECT,
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
        subscriptions: {
          orderBy: { currentPeriodEnd: 'desc' },
          take: 10,
          include: { plan: true },
        },
      },
    });
    if (!o) throw new NotFoundException('Không tìm thấy tổ chức');
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      email: o.email,
      phone: o.phone,
      address: o.address,
      isActive: o.isActive,
      createdAt: o.createdAt,
      users: o.users,
      subscriptions: o.subscriptions.map((s) => this.mapSub(s)),
    };
  }

  async setOrganizationActive(actor: AuthUser, id: string, dto: AdminSetActiveDto, ipAddress?: string) {
    const before = await this.prisma.organization.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy tổ chức');

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.organization.update({
        where: { id },
        data: { isActive: dto.isActive },
      });
      await this.audit.log(
        {
          organizationId: id,
          userId: actor.id,
          action: dto.isActive ? 'PLATFORM_ORG_UNLOCK' : 'PLATFORM_ORG_LOCK',
          entityType: 'ORGANIZATION',
          entityId: id,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            before: { isActive: before.isActive, name: before.name },
            after: { isActive: after.isActive, name: after.name },
          },
        },
        tx,
      );
      return {
        id: after.id,
        isActive: after.isActive,
        before: { isActive: before.isActive },
        after: { isActive: after.isActive },
      };
    });
  }

  async listUsers(query: AdminListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.status === 'active') {
      where.isActive = true;
      where.deletedAt = null;
    } else if (query.status === 'inactive') {
      where.isActive = false;
      where.deletedAt = null;
    } else if (query.status === 'deleted') {
      where.deletedAt = { not: null };
    } else {
      // Mặc định ẩn soft-deleted
      where.deletedAt = null;
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        _count: { select: { authSessions: true } },
      },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const [subscription, activeSessions, history] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { organizationId: user.organizationId },
        include: { plan: true },
        orderBy: { currentPeriodEnd: 'desc' },
      }),
      this.prisma.authSession.count({
        where: { userId: id, revokedAt: null },
      }),
      this.prisma.auditLog.findMany({
        where: {
          entityType: 'USER',
          entityId: id,
          action: { in: [...USER_MGMT_ACTIONS] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          userId: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);

    const now = Date.now();
    const expiresAt = subscription?.currentPeriodEnd ?? null;
    const remainingDays = expiresAt
      ? Math.max(0, Math.ceil((expiresAt.getTime() - now) / 86400000))
      : 0;

    return {
      ...user,
      activeSessions,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            planCode: subscription.plan.code,
            planName: subscription.plan.name,
            durationMonths: subscription.plan.durationMonths,
            currentPeriodStart: subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            remainingDays,
            isExpired: !expiresAt || expiresAt.getTime() <= now,
          }
        : null,
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        entityType: h.entityType,
        entityId: h.entityId,
        metadata: h.metadata,
        ipAddress: h.ipAddress,
        createdAt: h.createdAt.toISOString(),
        actor: h.user
          ? { id: h.user.id, email: h.user.email, name: h.user.name }
          : h.userId
            ? { id: h.userId, email: null, name: null }
            : null,
      })),
    };
  }

  async setUserActive(actor: AuthUser, id: string, dto: AdminSetActiveDto, ipAddress?: string) {
    if (id === actor.id && !dto.isActive) {
      throw new BadRequestException('Không thể tự khóa tài khoản SUPER_ADMIN đang đăng nhập');
    }
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        isActive: true,
        deletedAt: true,
        organizationId: true,
        role: { select: { code: true } },
      },
    });
    if (!before) throw new NotFoundException('Không tìm thấy người dùng');
    if (before.deletedAt) {
      throw new BadRequestException('Tài khoản đã bị xóa (soft delete) — không thể khóa/mở khóa');
    }

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        select: SAFE_USER_SELECT,
      });
      let revokedSessions = 0;
      if (!dto.isActive) {
        const updated = await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        revokedSessions = updated.count;
      }
      await this.audit.log(
        {
          organizationId: before.organizationId,
          userId: actor.id,
          action: dto.isActive ? 'PLATFORM_USER_UNLOCK' : 'PLATFORM_USER_LOCK',
          entityType: 'USER',
          entityId: id,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            targetUserId: id,
            revokedSessions,
            before: { email: before.email, isActive: before.isActive, role: before.role.code },
            after: { email: after.email, isActive: after.isActive, role: after.role.code },
          },
        },
        tx,
      );
      return {
        before: { isActive: before.isActive },
        after: { isActive: after.isActive },
        revokedSessions,
        user: after,
      };
    });
  }

  /**
   * Soft delete: isActive=false + deletedAt + revoke sessions.
   * Không xóa payment/invoice/audit/subscription.
   */
  async softDeleteUser(
    actor: AuthUser,
    id: string,
    dto: AdminSoftDeleteUserDto,
    ipAddress?: string,
  ) {
    if (id === actor.id) {
      throw new BadRequestException('Không thể xóa tài khoản SUPER_ADMIN đang đăng nhập');
    }
    if (dto.confirm !== true) {
      throw new BadRequestException('Cần confirm=true để xóa user');
    }

    const before = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        deletedAt: true,
        organizationId: true,
        role: { select: { code: true } },
      },
    });
    if (!before) throw new NotFoundException('Không tìm thấy người dùng');
    if (before.role.code === 'SUPER_ADMIN') {
      throw new BadRequestException('Không thể xóa tài khoản SUPER_ADMIN');
    }
    if (before.deletedAt) {
      return {
        idempotent: true,
        user: await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT }),
      };
    }

    const deletedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id },
        data: { isActive: false, deletedAt },
        select: SAFE_USER_SELECT,
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: deletedAt },
      });
      await this.audit.log(
        {
          organizationId: before.organizationId,
          userId: actor.id,
          action: 'PLATFORM_USER_SOFT_DELETE',
          entityType: 'USER',
          entityId: id,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            targetUserId: id,
            revokedSessions: revoked.count,
            before: {
              email: before.email,
              name: before.name,
              isActive: before.isActive,
              deletedAt: null,
              role: before.role.code,
            },
            after: {
              email: after.email,
              isActive: after.isActive,
              deletedAt: deletedAt.toISOString(),
            },
          },
        },
        tx,
      );
      return { idempotent: false, revokedSessions: revoked.count, user: after };
    });
  }

  /**
   * Tặng thời gian sử dụng cho org của user.
   * Cộng vào hạn hiện tại nếu còn hạn; nếu hết hạn / chưa có gói → từ now.
   * Idempotent theo idempotencyKey.
   */
  async giftTimeToUser(
    actor: AuthUser,
    userId: string,
    dto: AdminGiftTimeDto,
    ipAddress?: string,
  ) {
    const existingKey = await this.prisma.adminIdempotencyKey.findUnique({
      where: { key: dto.idempotencyKey },
    });
    if (existingKey) {
      return {
        ...(existingKey.responseJson as Record<string, unknown>),
        idempotent: true,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        deletedAt: true,
        organizationId: true,
      },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    if (user.deletedAt) {
      throw new BadRequestException('Không thể tặng thời gian cho user đã xóa');
    }

    const intent = parseGiftIntent(dto);

    const plan =
      (await this.prisma.subscriptionPlan.findFirst({
        where: { code: 'msp-pro-6m', isActive: true },
      })) ||
      (await this.prisma.subscriptionPlan.findFirst({
        where: { isActive: true, durationMonths: { gt: 0 } },
        orderBy: { sortOrder: 'asc' },
      }));
    if (intent.durationGift && !plan) {
      throw new BadRequestException('Không có gói subscription để gắn thời gian tặng');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Race: key vừa được tạo bởi request song song
      const raced = await tx.adminIdempotencyKey.findUnique({
        where: { key: dto.idempotencyKey },
      });
      if (raced) {
        return {
          ...(raced.responseJson as Record<string, unknown>),
          idempotent: true,
        };
      }

      const existing = await tx.subscription.findFirst({
        where: { organizationId: user.organizationId },
        include: { plan: true },
        orderBy: { currentPeriodEnd: 'desc' },
      });

      const now = new Date();
      let after = existing;
      if (intent.durationGift) {
        if (!plan) throw new BadRequestException('Không có gói subscription để gắn thời gian tặng');
        const base =
          existing && existing.currentPeriodEnd.getTime() > now.getTime()
            ? existing.currentPeriodEnd
            : now;
        const periodStart =
          existing && existing.currentPeriodEnd.getTime() > now.getTime()
            ? existing.currentPeriodStart
            : now;
        const newEnd = resolveGiftEndDate(base, { ...dto, unit: intent.unit });

        if (existing) {
          after = await tx.subscription.update({
            where: { id: existing.id },
            data: {
              planId:
                existing.status === SubscriptionStatus.TRIALING ||
                existing.plan.code === 'msp-trial-3d'
                  ? plan.id
                  : existing.planId,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: periodStart,
              currentPeriodEnd: newEnd,
              cancelledAt: null,
            },
            include: { plan: true },
          });
        } else {
          after = await tx.subscription.create({
            data: {
              organizationId: user.organizationId,
              planId: plan.id,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: now,
              currentPeriodEnd: newEnd,
            },
            include: { plan: true },
          });
        }
      }

      const credit = await this.grantGiftCreditsTx(tx, {
        organizationId: user.organizationId,
        subscriptionId: after?.id,
        userId: user.id,
        actorUserId: actor.id,
        dto,
      });

      const payload = {
        targetUserId: user.id,
        targetEmail: user.email,
        organizationId: user.organizationId,
        unit: dto.unit ?? intent.unit,
        amount: dto.permanent || !intent.durationGift ? null : (dto.amount ?? null),
        permanent: dto.permanent ?? false,
        creditsGranted: credit.granted,
        creditBalanceAfter: credit.balanceAfter,
        before: existing
          ? {
              subscriptionId: existing.id,
              status: existing.status,
              currentPeriodEnd: existing.currentPeriodEnd.toISOString(),
              planCode: existing.plan.code,
            }
          : null,
        after: after
          ? {
              subscriptionId: after.id,
              status: after.status,
              currentPeriodEnd: after.currentPeriodEnd.toISOString(),
              planCode: after.plan.code,
            }
          : null,
      };

      await this.audit.log(
        {
          organizationId: user.organizationId,
          userId: actor.id,
          action: 'PLATFORM_USER_GIFT_TIME',
          entityType: 'USER',
          entityId: userId,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            idempotencyKey: dto.idempotencyKey,
            ...payload,
          },
        },
        tx,
      );

      const response = {
        idempotent: false,
        ...payload,
        subscription: after ? this.mapSub(after) : null,
      };

      await tx.adminIdempotencyKey.create({
        data: {
          key: dto.idempotencyKey,
          action: 'PLATFORM_USER_GIFT_TIME',
          actorUserId: actor.id,
          targetUserId: userId,
          responseJson: response,
        },
      });

      return response;
    });

    if (!result.idempotent) {
      const afterEnd =
        (result as { after?: { currentPeriodEnd?: string | Date } }).after?.currentPeriodEnd ??
        (result as { subscription?: { currentPeriodEnd?: string | Date } }).subscription
          ?.currentPeriodEnd;
      void this.billingMail
        .sendGiftNotice({
          email: user.email,
          name: user.name ?? user.email,
          durationLabel: giftDurationLabel(dto),
          creditsGranted: Number((result as { creditsGranted?: number }).creditsGranted ?? 0),
          periodEnd: afterEnd ? new Date(afterEnd) : new Date(),
        })
        .catch((err) => this.logger.warn(`Gift email skipped: ${String(err)}`));
    }

    return result;
  }

  async forceLogout(actor: AuthUser, id: string, dto: AdminReasonDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, organizationId: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const result = await this.prisma.$transaction(async (tx) => {
      const activeBefore = await tx.authSession.count({
        where: { userId: id, revokedAt: null },
      });
      const updated = await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        {
          organizationId: user.organizationId,
          userId: actor.id,
          action: 'PLATFORM_USER_FORCE_LOGOUT',
          entityType: 'USER',
          entityId: id,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            before: { activeSessions: activeBefore, email: user.email },
            after: { revokedCount: updated.count, activeSessions: 0, email: user.email },
          },
        },
        tx,
      );
      return { revokedSessions: updated.count };
    });
    return result;
  }

  async listSubscriptions(query: AdminListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SubscriptionWhereInput = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { organization: { name: { contains: q, mode: 'insensitive' } } },
        { organization: { email: { contains: q, mode: 'insensitive' } } },
        { plan: { code: { contains: q, mode: 'insensitive' } } },
        { plan: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (query.status === 'active') {
      where.currentPeriodEnd = { gt: new Date() };
      where.status = { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] };
    }
    if (query.status === 'expired') {
      where.OR = [{ currentPeriodEnd: { lte: new Date() } }, { status: SubscriptionStatus.EXPIRED }];
    }

    const [total, items] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: {
          plan: true,
          organization: { select: ORG_SUB_SELECT },
        },
        orderBy: { currentPeriodEnd: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((s) => this.mapSub(s)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getSubscription(id: string) {
    const s = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        organization: { select: ORG_SUB_SELECT },
      },
    });
    if (!s) throw new NotFoundException('Không tìm thấy subscription');
    return this.mapSub(s);
  }

  async extendSubscription(
    actor: AuthUser,
    id: string,
    dto: AdminExtendSubscriptionDto,
    ipAddress?: string,
  ) {
    if (dto.idempotencyKey) {
      const existingKey = await this.prisma.adminIdempotencyKey.findUnique({
        where: { key: dto.idempotencyKey },
      });
      if (existingKey) {
        return {
          ...(existingKey.responseJson as Record<string, unknown>),
          idempotent: true,
        };
      }
    }

    const before = await this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!before) throw new NotFoundException('Không tìm thấy subscription');

    return this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const raced = await tx.adminIdempotencyKey.findUnique({
          where: { key: dto.idempotencyKey },
        });
        if (raced) {
          return {
            ...(raced.responseJson as Record<string, unknown>),
            idempotent: true,
          };
        }
      }

      const base =
        before.currentPeriodEnd.getTime() > Date.now()
          ? before.currentPeriodEnd
          : new Date();
      const end = new Date(base);
      end.setDate(end.getDate() + dto.days);

      const after = await tx.subscription.update({
        where: { id },
        data: {
          currentPeriodEnd: end,
          status: SubscriptionStatus.ACTIVE,
          cancelledAt: null,
        },
        include: { plan: true },
      });

      await this.audit.log(
        {
          organizationId: before.organizationId,
          userId: actor.id,
          action: 'PLATFORM_SUB_EXTEND',
          entityType: 'SUBSCRIPTION',
          entityId: id,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            days: dto.days,
            idempotencyKey: dto.idempotencyKey ?? null,
            before: {
              currentPeriodEnd: before.currentPeriodEnd.toISOString(),
              status: before.status,
              planCode: before.plan.code,
            },
            after: {
              currentPeriodEnd: after.currentPeriodEnd.toISOString(),
              status: after.status,
              planCode: after.plan.code,
            },
          },
        },
        tx,
      );

      const response = {
        idempotent: false,
        before: this.mapSub(before),
        after: this.mapSub(after),
      };

      if (dto.idempotencyKey) {
        await tx.adminIdempotencyKey.create({
          data: {
            key: dto.idempotencyKey,
            action: 'PLATFORM_SUB_EXTEND',
            actorUserId: actor.id,
            responseJson: response,
          },
        });
      }

      return response;
    });
  }

  /**
   * Tặng thời gian trực tiếp lên subscription (theo org) — giữ nguyên gói, không tạo bản ghi mới.
   * ACTIVE/còn hạn: cộng từ currentPeriodEnd; EXPIRED/hết hạn: cộng từ now → ACTIVE.
   */
  async giftTimeToSubscription(
    actor: AuthUser,
    subscriptionId: string,
    dto: AdminGiftTimeDto,
    ipAddress?: string,
  ) {
    const existingKey = await this.prisma.adminIdempotencyKey.findUnique({
      where: { key: dto.idempotencyKey },
    });
    if (existingKey) {
      return {
        ...(existingKey.responseJson as Record<string, unknown>),
        idempotent: true,
      };
    }

    const intent = parseGiftIntent(dto);

    const before = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, organization: { select: ORG_SUB_SELECT } },
    });
    if (!before) throw new NotFoundException('Không tìm thấy subscription');

    const result = await this.prisma.$transaction(async (tx) => {
      const raced = await tx.adminIdempotencyKey.findUnique({
        where: { key: dto.idempotencyKey },
      });
      if (raced) {
        return {
          ...(raced.responseJson as Record<string, unknown>),
          idempotent: true,
        };
      }

      const now = new Date();
      let after = before;
      if (intent.durationGift) {
        const stillValid = before.currentPeriodEnd.getTime() > now.getTime();
        const base = stillValid ? before.currentPeriodEnd : now;
        const periodStart = stillValid ? before.currentPeriodStart : now;
        const newEnd = resolveGiftEndDate(base, { ...dto, unit: intent.unit });

        after = await tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: newEnd,
            cancelledAt: null,
          },
          include: { plan: true, organization: { select: ORG_SUB_SELECT } },
        });
      }

      const credit = await this.grantGiftCreditsTx(tx, {
        organizationId: before.organizationId,
        subscriptionId: after.id,
        actorUserId: actor.id,
        dto,
      });

      const payload = {
        organizationId: before.organizationId,
        organizationName: before.organization?.name ?? null,
        subscriptionId: before.id,
        unit: dto.unit ?? intent.unit,
        amount: dto.permanent || !intent.durationGift ? null : (dto.amount ?? null),
        permanent: dto.permanent ?? false,
        creditsGranted: credit.granted,
        creditBalanceBefore: credit.balanceBefore,
        creditBalanceAfter: credit.balanceAfter,
        giftedAt: now.toISOString(),
        before: {
          status: before.status,
          currentPeriodEnd: before.currentPeriodEnd.toISOString(),
          planCode: before.plan.code,
          planName: before.plan.name,
          creditBalance: Number(before.organization?.creditWallet?.balance ?? 0),
        },
        after: {
          status: after.status,
          currentPeriodEnd: after.currentPeriodEnd.toISOString(),
          planCode: after.plan.code,
          planName: after.plan.name,
          creditBalance: credit.balanceAfter,
        },
      };

      await this.audit.log(
        {
          organizationId: before.organizationId,
          userId: actor.id,
          action: 'PLATFORM_SUB_GIFT_TIME',
          entityType: 'SUBSCRIPTION',
          entityId: subscriptionId,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            idempotencyKey: dto.idempotencyKey,
            adminUserId: actor.id,
            adminEmail: actor.email,
            ...payload,
          },
        },
        tx,
      );

      const afterMapped = {
        ...this.mapSub(after),
        creditBalance: credit.balanceAfter,
      };

      const response = {
        idempotent: false,
        ...payload,
        before: this.mapSub(before),
        after: afterMapped,
      };

      await tx.adminIdempotencyKey.create({
        data: {
          key: dto.idempotencyKey,
          action: 'PLATFORM_SUB_GIFT_TIME',
          actorUserId: actor.id,
          responseJson: response,
        },
      });

      return response;
    });

    if (!result.idempotent) {
      const emailTarget =
        before.organization?.email ||
        (
          await this.prisma.user.findFirst({
            where: { organizationId: before.organizationId, isActive: true },
            orderBy: { createdAt: 'asc' },
          })
        )?.email;
      if (emailTarget) {
        const afterRow = result as {
          after?: { expiresAt?: string; currentPeriodEnd?: string | Date };
        };
        const afterEnd = afterRow.after?.expiresAt ?? afterRow.after?.currentPeriodEnd;
        void this.billingMail
          .sendGiftNotice({
            email: emailTarget,
            name: before.organization?.name ?? emailTarget,
            durationLabel: giftDurationLabel(dto),
            creditsGranted: Number((result as { creditsGranted?: number }).creditsGranted ?? 0),
            periodEnd: afterEnd ? new Date(afterEnd) : before.currentPeriodEnd,
          })
          .catch((err) => this.logger.warn(`Gift email skipped: ${String(err)}`));
      }
    }

    return result;
  }

  async upgradeTo12m(actor: AuthUser, id: string, dto: AdminReasonDto, ipAddress?: string) {
    const before = await this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!before) throw new NotFoundException('Không tìm thấy subscription');
    if (before.plan.durationMonths >= 12) {
      throw new BadRequestException('Gói đã là 1 năm hoặc dài hơn');
    }

    const plan12 = await this.prisma.subscriptionPlan.findFirst({
      where: { code: 'msp-pro-12m', isActive: true },
    });
    if (!plan12) throw new BadRequestException('Không tìm thấy gói msp-pro-12m');

    return this.prisma.$transaction(async (tx) => {
      // Nâng cấp: chuyển plan + cộng thêm (12 - remaining months equivalent) — dùng cộng 6 tháng từ hạn hiện tại nếu còn hạn
      const base =
        before.currentPeriodEnd.getTime() > Date.now()
          ? before.currentPeriodEnd
          : new Date();
      const end = new Date(base);
      // Từ 6→12: cộng thêm 6 tháng vào kỳ hiện tại (chính sách đơn giản, minh bạch)
      end.setMonth(end.getMonth() + 6);

      const after = await tx.subscription.update({
        where: { id },
        data: {
          planId: plan12.id,
          currentPeriodEnd: end,
          status: SubscriptionStatus.ACTIVE,
          cancelledAt: null,
        },
        include: { plan: true },
      });

      await this.audit.log(
        {
          organizationId: before.organizationId,
          userId: actor.id,
          action: 'PLATFORM_SUB_UPGRADE_12M',
          entityType: 'SUBSCRIPTION',
          entityId: id,
          ipAddress,
          metadata: {
            reason: dto.reason,
            result: 'ok',
            before: {
              planCode: before.plan.code,
              durationMonths: before.plan.durationMonths,
              currentPeriodEnd: before.currentPeriodEnd.toISOString(),
            },
            after: {
              planCode: after.plan.code,
              durationMonths: after.plan.durationMonths,
              currentPeriodEnd: after.currentPeriodEnd.toISOString(),
            },
          },
        },
        tx,
      );

      return { before: this.mapSub(before), after: this.mapSub(after) };
    });
  }

  private async grantGiftCreditsTx(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      subscriptionId?: string;
      userId?: string;
      actorUserId: string;
      dto: AdminGiftTimeDto;
    },
  ): Promise<{ granted: number; idempotent: boolean; balanceBefore: number; balanceAfter: number }> {
    const wallet = await tx.creditWallet.findUnique({
      where: { organizationId: params.organizationId },
    });
    const balanceBefore = Number(wallet?.balance ?? 0);
    const amount = Number(params.dto.creditAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { granted: 0, idempotent: false, balanceBefore, balanceAfter: balanceBefore };
    }
    const result = await this.credit.grant(
      {
        organizationId: params.organizationId,
        amount,
        userId: params.userId,
        source: CREDIT_GRANT_SOURCES.ADMIN_GIFT,
        subscriptionId: params.subscriptionId,
        idempotencyKey: `gift:${params.dto.idempotencyKey}:credit-grant`,
        referenceId: params.dto.idempotencyKey,
        reason: params.dto.reason?.trim() || 'Admin tặng AI Credit',
        metadata: {
          source: CREDIT_GRANT_SOURCES.ADMIN_GIFT,
          actorUserId: params.actorUserId,
          subscriptionId: params.subscriptionId,
        },
      },
      tx,
    );
    return {
      granted: amount,
      idempotent: result.idempotent,
      balanceBefore,
      balanceAfter: result.balance.balance,
    };
  }

  private mapSub(s: {
    id: string;
    organizationId: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelledAt?: Date | null;
    plan: { code: string; name: string; durationMonths: number; priceVnd?: unknown; creditGrant?: unknown };
    organization?: {
      id: string;
      name: string;
      slug: string;
      email: string | null;
      isActive?: boolean;
      creditWallet?: { balance?: unknown } | null;
    };
  }) {
    const remainingDays = Math.max(
      0,
      Math.ceil((s.currentPeriodEnd.getTime() - Date.now()) / 86400000),
    );
    const expired = s.currentPeriodEnd.getTime() <= Date.now();
    const organization = s.organization
      ? {
          id: s.organization.id,
          name: s.organization.name,
          slug: s.organization.slug,
          email: s.organization.email,
          isActive: s.organization.isActive,
        }
      : undefined;
    return {
      id: s.id,
      organizationId: s.organizationId,
      organization,
      planId: s.planId,
      planCode: s.plan.code,
      planName: s.plan.name,
      durationMonths: s.plan.durationMonths,
      planCreditGrant: Number(s.plan.creditGrant ?? 0),
      status: expired ? 'EXPIRED' : s.status,
      startedAt: s.currentPeriodStart.toISOString(),
      expiresAt: s.currentPeriodEnd.toISOString(),
      remainingDays,
      isExpired: expired,
      creditBalance: Number(s.organization?.creditWallet?.balance ?? 0),
    };
  }

  async listCreditOrgs(query: AdminListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrganizationWhereInput = {};
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        include: {
          creditWallet: true,
          subscriptions: {
            orderBy: { currentPeriodEnd: 'desc' },
            take: 1,
            include: { plan: { select: { code: true, name: true, durationMonths: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((o) => {
        const sub = o.subscriptions[0];
        const expired = sub ? sub.currentPeriodEnd.getTime() <= Date.now() : false;
        return {
          organizationId: o.id,
          name: o.name,
          slug: o.slug,
          email: o.email,
          isActive: o.isActive,
          planCode: sub?.plan.code ?? null,
          planName: sub?.plan.name ?? null,
          subscriptionStatus: sub ? (expired ? 'EXPIRED' : sub.status) : null,
          expiresAt: sub?.currentPeriodEnd?.toISOString() ?? null,
          remainingDays: sub
            ? Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86400000))
            : null,
          balance: Number(o.creditWallet?.balance ?? 0),
          reservedBalance: Number(o.creditWallet?.reservedBalance ?? 0),
          lifetimeEarned: Number(o.creditWallet?.lifetimeEarned ?? 0),
          lifetimeUsed: Number(o.creditWallet?.lifetimeUsed ?? 0),
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async listCreditHistory(
    organizationId: string,
    query: { page?: number; pageSize?: number },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, email: true },
    });
    if (!org) throw new NotFoundException('Không tìm thấy tổ chức');
    const history = await this.credit.listHistory(organizationId, {
      page: query.page,
      pageSize: query.pageSize,
      includeInternal: true,
    });
    const balance = await this.credit.getBalance(organizationId);
    return { organization: org, balance, ...history };
  }

  async adjustCredit(
    actor: AuthUser,
    organizationId: string,
    dto: AdminCreditAdjustDto,
    ipAddress?: string,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new BadRequestException('Bắt buộc nhập lý do khi điều chỉnh Credit');
    }
    if (!Number.isFinite(dto.delta) || dto.delta === 0) {
      throw new BadRequestException('Số Credit phải khác 0');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, email: true },
    });
    if (!org) throw new NotFoundException('Không tìm thấy tổ chức');

    const existingKey = await this.prisma.adminIdempotencyKey.findUnique({
      where: { key: dto.idempotencyKey },
    });
    if (existingKey) {
      return {
        ...(existingKey.responseJson as Record<string, unknown>),
        idempotent: true,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const raced = await tx.adminIdempotencyKey.findUnique({
        where: { key: dto.idempotencyKey },
      });
      if (raced) {
        return {
          ...(raced.responseJson as Record<string, unknown>),
          idempotent: true,
        };
      }

      const result = await this.credit.adjust(
        {
          organizationId,
          delta: dto.delta,
          idempotencyKey: `admin-credit:${dto.idempotencyKey}`,
          referenceId: organizationId,
          reason,
          metadata: {
            adminId: actor.id,
            adminEmail: actor.email,
            delta: dto.delta,
          },
        },
        tx,
      );

      const after = result.balance.balance;
      const before = result.idempotent ? after : after - dto.delta;
      const timestamp = new Date().toISOString();
      const wallet = await tx.creditWallet.findUnique({ where: { organizationId } });
      const response = {
        organizationId,
        organizationName: org.name,
        delta: dto.delta,
        before,
        after,
        reason,
        timestamp,
        transactionId: result.transactionId,
        idempotent: result.idempotent,
        balance: result.balance,
      };

      await this.audit.log(
        {
          organizationId,
          userId: actor.id,
          action: 'PLATFORM_CREDIT_ADJUST',
          entityType: 'CREDIT_WALLET',
          entityId: wallet?.id ?? organizationId,
          ipAddress,
          metadata: {
            adminId: actor.id,
            adminEmail: actor.email,
            organizationId,
            before,
            amount: dto.delta,
            after,
            reason,
            timestamp,
            idempotencyKey: dto.idempotencyKey,
            result: result.idempotent ? 'idempotent' : 'ok',
          },
        },
        tx,
      );

      await tx.adminIdempotencyKey.create({
        data: {
          key: dto.idempotencyKey,
          action: 'PLATFORM_CREDIT_ADJUST',
          actorUserId: actor.id,
          responseJson: response as unknown as Prisma.InputJsonValue,
        },
      });

      return response;
    });
  }
}
