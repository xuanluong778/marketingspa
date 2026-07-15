import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { DEFAULT_ROLE_SEEDS, SYSTEM_ROLES, ALL_PERMISSION_DEFS, defaultPermissionCodesForRole } from '../common/constants/roles';
import { slugify } from '../common/utils/slug.util';

const BCRYPT_ROUNDS = 12;
const REFRESH_PREFIX = 'refresh:';

type MemoryRefreshEntry = { userId: string; expiresAt: number };

@Injectable()
export class AuthService {
  /** Fallback khi Redis chưa chạy (dev local không docker) */
  private readonly memoryRefresh = new Map<string, MemoryRefreshEntry>();
  private redisUnavailableLogged = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const slug = dto.organizationSlug ?? slugify(dto.organizationName);
    const slugTaken = await this.prisma.organization.findUnique({ where: { slug } });
    if (slugTaken) {
      throw new ConflictException('Slug organization đã tồn tại');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          email: dto.email,
        },
      });

      const roles = await Promise.all(
        DEFAULT_ROLE_SEEDS.map((r) =>
          tx.role.create({
            data: {
              organizationId: org.id,
              code: r.code,
              name: r.name,
              isSystem: true,
            },
          }),
        ),
      );

      const permissionRows = await Promise.all(
        ALL_PERMISSION_DEFS.map((p) =>
          tx.permission.upsert({
            where: { code: p.code },
            update: { name: p.name, module: p.module },
            create: { code: p.code, name: p.name, module: p.module },
          }),
        ),
      );
      const permissionByCode = new Map(permissionRows.map((p) => [p.code, p]));

      for (const role of roles) {
        const codes = defaultPermissionCodesForRole(role.code);
        const links = codes
          .map((code) => permissionByCode.get(code))
          .filter((p): p is (typeof permissionRows)[number] => !!p)
          .map((p) => ({ roleId: role.id, permissionId: p.id }));
        if (links.length) {
          await tx.rolePermission.createMany({ data: links, skipDuplicates: true });
        }
      }

      const ownerRole = roles.find((r) => r.code === SYSTEM_ROLES.OWNER)!;

      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          organizationId: org.id,
          roleId: ownerRole.id,
        },
        include: { organization: true, role: true },
      });

      await tx.creditWallet.create({
        data: { organizationId: org.id, balance: 0 },
      });

      return user;
    });

    const tokens = await this.issueTokens(result);
    return {
      ...tokens,
      user: await this.getCurrentUser(result.id),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { organization: true, role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user);
    return {
      ...tokens,
      user: await this.getCurrentUser(user.id),
    };
  }

  async refresh(refreshToken: string) {
    const refreshSecret =
      this.config.get<string>('JWT_REFRESH_SECRET') ?? this.config.get<string>('JWT_SECRET');
    if (!refreshSecret) {
      throw new UnauthorizedException('Refresh token chưa được cấu hình');
    }

    let payload: { sub: string; jti: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const stored = await this.getRefreshTokenUserId(payload.jti);
    if (!stored || stored !== payload.sub) {
      throw new UnauthorizedException('Refresh token đã hết hạn hoặc bị thu hồi');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true, role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không hợp lệ');
    }

    // Rotate refresh token
    await this.deleteRefreshToken(payload.jti);
    const tokens = await this.issueTokens(user);
    return {
      ...tokens,
      user: await this.getCurrentUser(user.id),
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync(refreshToken, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        });
        if (payload.jti) {
          await this.deleteRefreshToken(payload.jti);
        }
      } catch {
        // ignore invalid token on logout
      }
    }
    return { message: 'Đăng xuất thành công' };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          select: {
            code: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    if (!user || !user.isActive) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.code,
      organizationId: user.organizationId,
      employeeId: user.employeeId,
      permissions: user.role.permissions.map((rp) => rp.permission.code),
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        role: {
          include: {
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
        employee: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.mapUserResponse(user);
  }

  async issueTokens(user: {
    id: string;
    email: string;
    organizationId: string;
    role: { code: string };
  }) {
    const refreshSecret =
      this.config.get<string>('JWT_REFRESH_SECRET') ?? this.config.get<string>('JWT_SECRET');

    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role.code,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh', jti },
      {
        secret: refreshSecret,
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    );

    const refreshTtl = 7 * 24 * 60 * 60;
    await this.storeRefreshToken(jti, user.id, refreshTtl);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(jti: string, userId: string, ttlSeconds: number): Promise<void> {
    const stored = await this.tryRedis(async () => {
      await this.redis.setex(`${REFRESH_PREFIX}${jti}`, ttlSeconds, userId);
    });
    if (stored) return;

    this.logRedisFallback();
    this.memoryRefresh.set(jti, {
      userId,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private async getRefreshTokenUserId(jti: string): Promise<string | null> {
    const fromRedis = await this.tryRedis(() =>
      this.redis.get(`${REFRESH_PREFIX}${jti}`),
    );
    if (fromRedis !== undefined) return fromRedis;

    this.logRedisFallback();
    const row = this.memoryRefresh.get(jti);
    if (!row || row.expiresAt < Date.now()) {
      this.memoryRefresh.delete(jti);
      return null;
    }
    return row.userId;
  }

  private async deleteRefreshToken(jti: string): Promise<void> {
    const deleted = await this.tryRedis(async () => {
      await this.redis.del(`${REFRESH_PREFIX}${jti}`);
    });
    if (deleted) return;

    this.logRedisFallback();
    this.memoryRefresh.delete(jti);
  }

  /** Trả undefined nếu Redis không sẵn sàng — dùng memory fallback */
  private async tryRedis<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (this.redis.status !== 'ready') return undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout')), 1_500),
        ),
      ]);
    } catch {
      return undefined;
    }
  }

  private logRedisFallback(): void {
    if (!this.redisUnavailableLogged) {
      this.redisUnavailableLogged = true;
      console.warn(
        '[auth] Redis không khả dụng — dùng bộ nhớ tạm cho refresh token (dev). Chạy `pnpm dev:infra` để bật Redis.',
      );
    }
  }

  private mapUserResponse(user: {
    id: string;
    email: string;
    name: string;
    organizationId: string;
    employeeId?: string | null;
    role: {
      code: string;
      name: string;
      permissions?: { permission: { code: string } }[];
    };
    organization: { id: string; name: string; slug: string };
    employee?: { id: string; name: string } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.code,
      roleName: user.role.name,
      organizationId: user.organizationId,
      employeeId: user.employeeId ?? user.employee?.id ?? null,
      permissions: (user.role.permissions ?? []).map((rp) => rp.permission.code),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      employee: user.employee ?? null,
    };
  }
}
