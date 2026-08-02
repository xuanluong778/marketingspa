/**
 * Voice profile for “Góc nhìn & Chính kiến” — per user / organization.
 */
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { SYSTEM_ROLES } from '../common/constants/roles';
import type { UpsertOpinionVoiceProfileDto } from './dto/content-marketing.dto';

function cleanList(arr?: string[], max = 20, maxLen = 120): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, max)
    .map((s) => s.slice(0, maxLen));
}

function mapRow(row: {
  pronoun: string | null;
  preferredWords: string[];
  avoidWords: string[];
  openingPhrases: string[];
  closingPhrases: string[];
  sampleParagraph: string | null;
  userId: string | null;
}) {
  return {
    pronoun: row.pronoun,
    preferredWords: row.preferredWords,
    avoidWords: row.avoidWords,
    openingPhrases: row.openingPhrases,
    closingPhrases: row.closingPhrases,
    sampleParagraph: row.sampleParagraph,
    source: (row.userId ? 'user' : 'organization') as 'user' | 'organization',
  };
}

@Injectable()
export class OpinionVoiceProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(user: AuthUser) {
    const [userRow, orgRow] = await Promise.all([
      this.prisma.contentOpinionVoiceProfile.findFirst({
        where: { organizationId: user.organizationId, userId: user.id },
      }),
      this.prisma.contentOpinionVoiceProfile.findFirst({
        where: { organizationId: user.organizationId, userId: null },
      }),
    ]);
    const resolved = userRow ?? orgRow ?? null;
    return {
      user: userRow ? mapRow(userRow) : null,
      organization: orgRow ? mapRow(orgRow) : null,
      resolved: resolved
        ? {
            ...mapRow(resolved),
            source: userRow ? ('user' as const) : ('organization' as const),
          }
        : null,
    };
  }

  async upsertProfile(user: AuthUser, dto: UpsertOpinionVoiceProfileDto) {
    const scope = dto.scope ?? 'user';
    if (scope === 'organization') {
      const can =
        user.role === SYSTEM_ROLES.SUPER_ADMIN ||
        user.role === SYSTEM_ROLES.OWNER ||
        user.role === SYSTEM_ROLES.MANAGER;
      if (!can) {
        throw new ForbiddenException(
          'Chỉ OWNER/MANAGER/SUPER_ADMIN được lưu giọng nói mặc định tổ chức',
        );
      }
    }

    const data = {
      pronoun: dto.pronoun?.trim() || null,
      preferredWords: cleanList(dto.preferredWords),
      avoidWords: cleanList(dto.avoidWords),
      openingPhrases: cleanList(dto.openingPhrases, 10, 200),
      closingPhrases: cleanList(dto.closingPhrases, 10, 200),
      sampleParagraph: dto.sampleParagraph?.trim()?.slice(0, 4000) || null,
    };

    const whereUserId = scope === 'organization' ? null : user.id;
    const existing = await this.prisma.contentOpinionVoiceProfile.findFirst({
      where: { organizationId: user.organizationId, userId: whereUserId },
    });

    const row = existing
      ? await this.prisma.contentOpinionVoiceProfile.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.contentOpinionVoiceProfile.create({
          data: {
            organizationId: user.organizationId,
            userId: whereUserId,
            ...data,
          },
        });

    return mapRow(row);
  }
}
