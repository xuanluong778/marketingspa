import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { SYSTEM_ROLES } from '../common/constants/roles';
import type {
  CreateContentIndustryDto,
  UpdateContentIndustryDto,
  UpsertIndustryPreferenceDto,
} from './dto/content-industry.dto';
import {
  SPA_BEAUTY_INDUSTRY_NAME,
  CONTENT_INDUSTRY_OTHER_OPTION,
  normalizeIndustrySearch,
} from './content-industry.constants';

export { SPA_BEAUTY_INDUSTRY_ID, SPA_BEAUTY_INDUSTRY_NAME, SPA_BEAUTY_SLUG } from './content-industry.constants';

function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `industry-${Date.now()}`;
}

@Injectable()
export class ContentIndustryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve display industry label for AI prompts / snapshots. */
  resolveIndustryLabel(input: {
    industryId?: string | null;
    industryName?: string | null;
    customIndustry?: string | null;
  }): string {
    const custom = input.customIndustry?.trim();
    if (custom) return custom;
    const name = input.industryName?.trim();
    if (name) return name;
    return SPA_BEAUTY_INDUSTRY_NAME;
  }

  async listPublic(q?: string, includeInactive = false) {
    const query = q?.trim();
    const items = await this.prisma.contentIndustry.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const mapped = items.map((i) => ({
      id: i.id,
      slug: i.slug,
      name: i.name,
      sortOrder: i.sortOrder,
      isActive: i.isActive,
      isSystem: i.isSystem,
    }));

    // Lọc không dấu / không phân biệt hoa thường (Postgres ILIKE không đủ cho tiếng Việt)
    const needle = query ? normalizeIndustrySearch(query) : '';
    const filtered = needle
      ? mapped.filter(
          (i) =>
            normalizeIndustrySearch(i.name).includes(needle) ||
            normalizeIndustrySearch(i.slug).includes(needle),
        )
      : mapped;

    return {
      items: filtered,
      otherOption: { ...CONTENT_INDUSTRY_OTHER_OPTION },
    };
  }

  async getPreference(user: AuthUser) {
    const [userPref, orgPref] = await Promise.all([
      this.prisma.contentMarketingPreference.findFirst({
        where: { organizationId: user.organizationId, userId: user.id },
        include: { industry: true },
      }),
      this.prisma.contentMarketingPreference.findFirst({
        where: { organizationId: user.organizationId, userId: null },
        include: { industry: true },
      }),
    ]);

    const resolved = userPref ?? orgPref ?? null;
    return {
      user: userPref
        ? {
            industryId: userPref.industryId,
            industryName: userPref.industry?.name ?? null,
            customIndustry: userPref.customIndustry,
            source: 'user' as const,
          }
        : null,
      organization: orgPref
        ? {
            industryId: orgPref.industryId,
            industryName: orgPref.industry?.name ?? null,
            customIndustry: orgPref.customIndustry,
            source: 'organization' as const,
          }
        : null,
      resolved: resolved
        ? {
            industryId: resolved.industryId,
            industryName: resolved.industry?.name ?? null,
            customIndustry: resolved.customIndustry,
            source: userPref ? ('user' as const) : ('organization' as const),
          }
        : null,
    };
  }

  async upsertPreference(user: AuthUser, dto: UpsertIndustryPreferenceDto) {
    const scope = dto.scope ?? 'user';
    if (scope === 'organization') {
      const can =
        user.role === SYSTEM_ROLES.SUPER_ADMIN ||
        user.role === SYSTEM_ROLES.OWNER ||
        user.role === SYSTEM_ROLES.MANAGER;
      if (!can) {
        throw new ForbiddenException('Chỉ OWNER/MANAGER/SUPER_ADMIN được đặt ngành mặc định cho tổ chức');
      }
    }

    const { industryId, customIndustry, industryName } = await this.normalizeIndustryInput(dto);

    if (scope === 'organization') {
      const existing = await this.prisma.contentMarketingPreference.findFirst({
        where: { organizationId: user.organizationId, userId: null },
      });
      const row = existing
        ? await this.prisma.contentMarketingPreference.update({
            where: { id: existing.id },
            data: { industryId, customIndustry },
            include: { industry: true },
          })
        : await this.prisma.contentMarketingPreference.create({
            data: {
              organizationId: user.organizationId,
              userId: null,
              industryId,
              customIndustry,
            },
            include: { industry: true },
          });
      return {
        industryId: row.industryId,
        industryName: row.industry?.name ?? industryName,
        customIndustry: row.customIndustry,
        source: 'organization' as const,
      };
    }

    const existing = await this.prisma.contentMarketingPreference.findFirst({
      where: { organizationId: user.organizationId, userId: user.id },
    });
    const row = existing
      ? await this.prisma.contentMarketingPreference.update({
          where: { id: existing.id },
          data: { industryId, customIndustry },
          include: { industry: true },
        })
      : await this.prisma.contentMarketingPreference.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            industryId,
            customIndustry,
          },
          include: { industry: true },
        });

    return {
      industryId: row.industryId,
      industryName: row.industry?.name ?? industryName,
      customIndustry: row.customIndustry,
      source: 'user' as const,
    };
  }

  async adminList() {
    return this.listPublic(undefined, true);
  }

  async adminCreate(dto: CreateContentIndustryDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('name không được trống');
    let slug = (dto.slug?.trim() || slugifyName(name)).toLowerCase();
    const clash = await this.prisma.contentIndustry.findUnique({ where: { slug } });
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;
    const maxSort = await this.prisma.contentIndustry.aggregate({ _max: { sortOrder: true } });
    const created = await this.prisma.contentIndustry.create({
      data: {
        name,
        slug,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 10,
        isActive: dto.isActive ?? true,
        isSystem: false,
      },
    });
    return created;
  }

  async adminUpdate(id: string, dto: UpdateContentIndustryDto) {
    const existing = await this.prisma.contentIndustry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ngành không tồn tại');

    if (dto.slug && dto.slug.trim() !== existing.slug && existing.isSystem) {
      throw new BadRequestException('Không đổi slug ngành hệ thống');
    }

    const data: {
      name?: string;
      slug?: string;
      sortOrder?: number;
      isActive?: boolean;
    } = {};
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.slug != null && !existing.isSystem) data.slug = slugifyName(dto.slug.trim());
    if (dto.sortOrder != null) data.sortOrder = dto.sortOrder;
    if (dto.isActive != null) data.isActive = dto.isActive;

    return this.prisma.contentIndustry.update({ where: { id }, data });
  }

  /** Soft-hide only; system industries cannot be hard-deleted. */
  async adminHide(id: string) {
    const existing = await this.prisma.contentIndustry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ngành không tồn tại');
    if (existing.isSystem) {
      throw new BadRequestException('Không ẩn/xóa ngành hệ thống Spa/Làm đẹp');
    }
    return this.prisma.contentIndustry.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async normalizeIndustryInput(input: {
    industryId?: string | null;
    customIndustry?: string | null;
    industryName?: string | null;
  }): Promise<{
    industryId: string | null;
    industryName: string | null;
    customIndustry: string | null;
  }> {
    const custom = input.customIndustry?.trim() || null;
    if (custom) {
      return { industryId: null, industryName: custom, customIndustry: custom };
    }
    if (input.industryId) {
      const row = await this.prisma.contentIndustry.findFirst({
        where: { id: input.industryId, isActive: true },
      });
      if (!row) throw new BadRequestException('industryId không hợp lệ hoặc đã ẩn');
      return { industryId: row.id, industryName: row.name, customIndustry: null };
    }
    if (input.industryName?.trim()) {
      return {
        industryId: null,
        industryName: input.industryName.trim(),
        customIndustry: null,
      };
    }
    return { industryId: null, industryName: null, customIndustry: null };
  }
}
