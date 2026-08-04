/**
 * Teleprompter source snapshots — tenant-scoped by organization + user.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { UpsertTeleprompterSourceDto } from './dto/content-marketing.dto';

function mapRow(row: {
  id: string;
  organizationId: string;
  userId: string;
  clientContentId: string | null;
  sourceType: string;
  sourceRoute: string | null;
  sourceTitle: string;
  originalScript: string;
  editedScript: string;
  videoHook: string | null;
  facebookPost: string | null;
  estimatedDuration: number;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    contentId: row.id,
    sourceContentId: row.clientContentId || row.id,
    clientContentId: row.clientContentId,
    sourceType: row.sourceType,
    sourceRoute: row.sourceRoute,
    sourceTitle: row.sourceTitle,
    originalScript: row.originalScript,
    editedScript: row.editedScript,
    videoHook: row.videoHook,
    facebookPost: row.facebookPost,
    estimatedDuration: row.estimatedDuration,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TeleprompterSourceService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(user: AuthUser, dto: UpsertTeleprompterSourceDto) {
    const editedScript = (dto.editedScript || dto.originalScript || '').trim();
    if (!editedScript) {
      throw new ForbiddenException('Kịch bản trống');
    }
    const originalScript = (dto.originalScript || editedScript).trim();
    const sourceTitle = (dto.sourceTitle || 'Kịch bản quay video').trim().slice(0, 500);
    const sourceType = (dto.sourceType || 'manual').trim().slice(0, 40);
    const clientContentId = dto.clientContentId?.trim() || dto.sourceContentId?.trim() || null;
    const estimatedDuration =
      Number(dto.estimatedDuration) > 0
        ? Math.round(Number(dto.estimatedDuration))
        : Math.max(
            5,
            Math.round(
              (editedScript.split(/\s+/).filter(Boolean).length / 150) * 60,
            ),
          );

    const data = {
      sourceType,
      sourceRoute: dto.sourceRoute?.trim()?.slice(0, 500) || null,
      sourceTitle,
      originalScript,
      editedScript,
      videoHook: dto.videoHook?.trim() || null,
      facebookPost: dto.facebookPost?.trim() || null,
      estimatedDuration,
      clientContentId,
    };

    // Prefer update by explicit id (must belong to same org + user)
    if (dto.id?.trim()) {
      const existing = await this.prisma.contentTeleprompterSource.findFirst({
        where: {
          id: dto.id.trim(),
          organizationId: user.organizationId,
          userId: user.id,
        },
      });
      if (!existing) {
        throw new NotFoundException('Không tìm thấy kịch bản hoặc không có quyền truy cập');
      }
      const row = await this.prisma.contentTeleprompterSource.update({
        where: { id: existing.id },
        data,
      });
      return mapRow(row);
    }

    if (clientContentId) {
      const existing = await this.prisma.contentTeleprompterSource.findFirst({
        where: {
          organizationId: user.organizationId,
          userId: user.id,
          clientContentId,
        },
      });
      if (existing) {
        const row = await this.prisma.contentTeleprompterSource.update({
          where: { id: existing.id },
          data,
        });
        return mapRow(row);
      }
    }

    const row = await this.prisma.contentTeleprompterSource.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        ...data,
      },
    });
    return mapRow(row);
  }

  async getById(user: AuthUser, id: string) {
    const row = await this.prisma.contentTeleprompterSource.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        userId: user.id,
      },
    });
    if (!row) {
      // Same response whether missing or other tenant — no leak
      throw new NotFoundException('Không tìm thấy kịch bản hoặc không có quyền truy cập');
    }
    return mapRow(row);
  }
}
