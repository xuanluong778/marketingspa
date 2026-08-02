import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
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

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    const plan =
      (await this.prisma.subscriptionPlan.findFirst({
        where: { code: 'msp-pro-6m', isActive: true },
      })) ||
      (await this.prisma.subscriptionPlan.findFirst({
        where: { isActive: true, durationMonths: { gt: 0 } },
        orderBy: { sortOrder: 'asc' },
      }));
    if (!plan) throw new BadRequestException('Không có gói subscription để gắn thời gian tặng');

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
      const base =
        existing && existing.currentPeriodEnd.getTime() > now.getTime()
          ? existing.currentPeriodEnd
          : now;
      const periodStart =
        existing && existing.currentPeriodEnd.getTime() > now.getTime()
          ? existing.currentPeriodStart
          : now;
      const newEnd = addGiftDuration(base, dto.unit, dto.amount);

      let after;
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

      const payload = {
        targetUserId: user.id,
        targetEmail: user.email,
        organizationId: user.organizationId,
        unit: dto.unit,
        amount: dto.amount,
        before: existing
          ? {
              subscriptionId: existing.id,
              status: existing.status,
              currentPeriodEnd: existing.currentPeriodEnd.toISOString(),
              planCode: existing.plan.code,
            }
          : null,
        after: {
          subscriptionId: after.id,
          status: after.status,
          currentPeriodEnd: after.currentPeriodEnd.toISOString(),
          planCode: after.plan.code,
        },
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
        subscription: this.mapSub(after),
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
          organization: { select: { id: true, name: true, slug: true, email: true, isActive: true } },
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
        organization: { select: { id: true, name: true, slug: true, email: true, isActive: true } },
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

  private mapSub(s: {
    id: string;
    organizationId: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelledAt?: Date | null;
    plan: { code: string; name: string; durationMonths: number; priceVnd?: unknown };
    organization?: { id: string; name: string; slug: string; email: string | null; isActive?: boolean };
  }) {
    const remainingDays = Math.max(
      0,
      Math.ceil((s.currentPeriodEnd.getTime() - Date.now()) / 86400000),
    );
    const expired = s.currentPeriodEnd.getTime() <= Date.now();
    return {
      id: s.id,
      organizationId: s.organizationId,
      organization: s.organization,
      planId: s.planId,
      planCode: s.plan.code,
      planName: s.plan.name,
      durationMonths: s.plan.durationMonths,
      status: expired ? 'EXPIRED' : s.status,
      startedAt: s.currentPeriodStart.toISOString(),
      expiresAt: s.currentPeriodEnd.toISOString(),
      remainingDays,
      isExpired: expired,
    };
  }
}
