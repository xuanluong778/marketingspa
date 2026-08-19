/**
 * Teleprompter browser recordings — multipart/chunk upload to disk storage.
 * Lives in ContentMarketingModule (no standalone Teleprompter Nest module).
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  absoluteFromKey,
  assemblePartsAsync,
  buildStorageKey,
  ensureRecordingDirs,
  filenameFromTitle,
  listWrittenParts,
  maxRecordingFileBytes,
  mimeCompatible,
  objectExists,
  objectSize,
  openObjectStream,
  partsDirFromKey,
  removeRecordingObject,
  sanitizeTitle,
  signDownloadToken,
  sniffContainerMime,
  TELEPROMPTER_RECORDING_LIMITS,
  validateInitParams,
  verifyDownloadToken,
  writePart,
} from './teleprompter-recording-files';

function mapPublic(row: {
  id: string;
  organizationId: string;
  userId: string;
  teleprompterSourceId: string | null;
  title: string;
  recordingType: string;
  mimeType: string;
  size: number;
  duration: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  teleprompterSource?: { id: string; sourceTitle: string } | null;
}) {
  return {
    id: row.id,
    title: row.title,
    recordingType: row.recordingType,
    mimeType: row.mimeType,
    size: row.size,
    duration: row.duration,
    status: row.status,
    teleprompterSourceId: row.teleprompterSourceId,
    sourceTitle: row.teleprompterSource?.sourceTitle ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TeleprompterRecordingService {
  private readonly log = new Logger(TeleprompterRecordingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private ownedWhere(user: AuthUser, id: string) {
    return {
      id,
      organizationId: user.organizationId,
      userId: user.id,
      deletedAt: null as Date | null,
    };
  }

  private async findOwnedOrThrow(user: AuthUser, id: string) {
    const row = await this.prisma.contentTeleprompterRecording.findFirst({
      where: this.ownedWhere(user, id),
      include: {
        teleprompterSource: { select: { id: true, sourceTitle: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy recording hoặc không có quyền truy cập');
    }
    return row;
  }

  async cleanupStaleUploads(limit = 50): Promise<number> {
    const cutoff = new Date(Date.now() - TELEPROMPTER_RECORDING_LIMITS.incompleteTtlMs);
    const stale = await this.prisma.contentTeleprompterRecording.findMany({
      where: {
        status: { in: ['uploading', 'failed', 'cancelled'] },
        deletedAt: null,
        updatedAt: { lt: cutoff },
      },
      take: limit,
      select: { id: true, storageKey: true },
    });
    let n = 0;
    for (const row of stale) {
      removeRecordingObject(row.storageKey);
      await this.prisma.contentTeleprompterRecording.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), status: 'cancelled' },
      });
      n += 1;
    }
    if (n) this.log.log(`Cleaned ${n} stale teleprompter uploads`);
    return n;
  }

  async initUpload(
    user: AuthUser,
    dto: {
      title: string;
      recordingType: string;
      mimeType: string;
      size: number;
      duration?: number;
      teleprompterSourceId?: string;
      partSize?: number;
    },
  ) {
    await this.cleanupStaleUploads(20);

    const check = validateInitParams({
      title: dto.title,
      recordingType: dto.recordingType,
      mimeType: dto.mimeType,
      size: dto.size,
      duration: dto.duration,
      partSize: dto.partSize,
    });
    if (!check.ok) throw new BadRequestException(check.message);

    let teleprompterSourceId: string | null = null;
    if (dto.teleprompterSourceId?.trim()) {
      const src = await this.prisma.contentTeleprompterSource.findFirst({
        where: {
          id: dto.teleprompterSourceId.trim(),
          organizationId: user.organizationId,
          userId: user.id,
        },
        select: { id: true },
      });
      if (!src) {
        throw new BadRequestException('teleprompterSourceId không hợp lệ hoặc không thuộc bạn');
      }
      teleprompterSourceId = src.id;
    }

    const id = randomUUID();
    const mimeType = dto.mimeType.split(';')[0]!.trim().toLowerCase();
    const storageKey = buildStorageKey(user.organizationId, id, mimeType);
    ensureRecordingDirs(storageKey);

    const partSize = dto.partSize || TELEPROMPTER_RECORDING_LIMITS.defaultPartSize;
    const totalParts = Math.ceil(dto.size / partSize);

    const row = await this.prisma.contentTeleprompterRecording.create({
      data: {
        id,
        organizationId: user.organizationId,
        userId: user.id,
        teleprompterSourceId,
        title: sanitizeTitle(dto.title),
        recordingType: dto.recordingType,
        mimeType,
        size: Math.round(dto.size),
        duration: Math.max(0, Math.round(dto.duration || 0)),
        storageKey,
        status: 'uploading',
      },
    });

    return {
      id: row.id,
      uploadId: row.id,
      status: row.status,
      partSize,
      maxPartSize: TELEPROMPTER_RECORDING_LIMITS.maxPartSize,
      totalParts,
      maxFileBytes: maxRecordingFileBytes(),
      expiresInSec: Math.floor(TELEPROMPTER_RECORDING_LIMITS.incompleteTtlMs / 1000),
    };
  }

  async uploadPart(
    user: AuthUser,
    id: string,
    partNumber: number,
    file: { buffer?: Buffer; size?: number; mimetype?: string } | undefined,
    rawBuffer?: Buffer,
  ) {
    const row = await this.findOwnedOrThrow(user, id);
    if (row.status !== 'uploading') {
      throw new BadRequestException('Recording không ở trạng thái uploading');
    }

    const body = rawBuffer ?? file?.buffer;
    if (!body || !body.length) {
      throw new BadRequestException('Thiếu dữ liệu part');
    }
    if (body.length > TELEPROMPTER_RECORDING_LIMITS.maxPartSize) {
      throw new PayloadTooLargeException('Part vượt giới hạn');
    }

    if (partNumber === 1) {
      const sniffed = sniffContainerMime(body);
      if (!mimeCompatible(row.mimeType, sniffed, row.recordingType)) {
        await this.prisma.contentTeleprompterRecording.update({
          where: { id: row.id },
          data: { status: 'failed' },
        });
        throw new BadRequestException(
          `MIME spoofing hoặc định dạng không khớp (declared=${row.mimeType}, sniffed=${sniffed ?? 'unknown'})`,
        );
      }
    }

    const partsDir = partsDirFromKey(row.storageKey);
    const writtenParts = listWrittenParts(row.storageKey);
    let running = body.length;
    for (const n of writtenParts) {
      if (n === partNumber) continue;
      const p = join(partsDir, String(n));
      if (existsSync(p)) running += statSync(p).size;
    }
    if (running > row.size + TELEPROMPTER_RECORDING_LIMITS.maxPartSize) {
      throw new PayloadTooLargeException('Tổng dung lượng upload vượt quá size đã khai báo');
    }
    if (running > maxRecordingFileBytes()) {
      throw new PayloadTooLargeException('File vượt giới hạn hệ thống');
    }

    try {
      const result = await writePart(row.storageKey, partNumber, body);
      await this.prisma.contentTeleprompterRecording.update({
        where: { id: row.id },
        data: { updatedAt: new Date() },
      });
      return {
        id: row.id,
        partNumber,
        etag: result.etag,
        bytes: result.bytes,
        receivedParts: listWrittenParts(row.storageKey).length,
      };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Upload part thất bại');
    }
  }

  async completeUpload(
    user: AuthUser,
    id: string,
    dto: { parts?: Array<{ partNumber: number; etag?: string }> },
  ) {
    const row = await this.findOwnedOrThrow(user, id);
    if (row.status !== 'uploading') {
      throw new BadRequestException('Recording không ở trạng thái uploading');
    }

    const onDisk = listWrittenParts(row.storageKey);
    if (!onDisk.length) {
      throw new BadRequestException('Chưa có part nào được upload');
    }

    let expected = onDisk;
    if (dto.parts?.length) {
      const claimed = dto.parts.map((p) => p.partNumber).sort((a, b) => a - b);
      for (const n of claimed) {
        if (!onDisk.includes(n)) {
          throw new BadRequestException(`Thiếu part ${n} trên server — upload lỗi giữa chừng`);
        }
      }
      for (let i = 1; i <= claimed.length; i++) {
        if (!claimed.includes(i)) {
          throw new BadRequestException(`Part không liên tục — thiếu part ${i}`);
        }
      }
      expected = claimed;
    } else {
      for (let i = 1; i <= onDisk.length; i++) {
        if (!onDisk.includes(i)) {
          throw new BadRequestException(`Upload lỗi giữa chừng — thiếu part ${i}`);
        }
      }
    }

    let finalSize: number;
    try {
      finalSize = await assemblePartsAsync(row.storageKey, expected);
    } catch (err) {
      await this.prisma.contentTeleprompterRecording.update({
        where: { id: row.id },
        data: { status: 'failed' },
      });
      throw new BadRequestException(err instanceof Error ? err.message : 'Ghép file thất bại');
    }

    if (finalSize > maxRecordingFileBytes()) {
      removeRecordingObject(row.storageKey);
      await this.prisma.contentTeleprompterRecording.update({
        where: { id: row.id },
        data: { status: 'failed', deletedAt: new Date() },
      });
      throw new PayloadTooLargeException('File vượt giới hạn sau khi ghép');
    }

    if (finalSize > row.size * 1.05 + 1024) {
      removeRecordingObject(row.storageKey);
      await this.prisma.contentTeleprompterRecording.update({
        where: { id: row.id },
        data: { status: 'failed', deletedAt: new Date() },
      });
      throw new BadRequestException('Dung lượng thực tế vượt size đã khai báo');
    }

    const updated = await this.prisma.contentTeleprompterRecording.update({
      where: { id: row.id },
      data: { status: 'ready', size: finalSize },
      include: {
        teleprompterSource: { select: { id: true, sourceTitle: true } },
      },
    });
    return mapPublic(updated);
  }

  async cancelUpload(user: AuthUser, id: string) {
    const row = await this.findOwnedOrThrow(user, id);
    if (row.status === 'ready') {
      throw new BadRequestException('Không thể cancel recording đã ready — dùng xóa');
    }
    removeRecordingObject(row.storageKey);
    const updated = await this.prisma.contentTeleprompterRecording.update({
      where: { id: row.id },
      data: { status: 'cancelled', deletedAt: new Date() },
      include: {
        teleprompterSource: { select: { id: true, sourceTitle: true } },
      },
    });
    return mapPublic(updated);
  }

  async list(user: AuthUser, query: { limit?: number; cursor?: string; status?: string }) {
    await this.cleanupStaleUploads(10);
    const take = Math.min(Math.max(query.limit || 30, 1), 100);
    const rows = await this.prisma.contentTeleprompterRecording.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        deletedAt: null,
        status: query.status || 'ready',
        ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        teleprompterSource: { select: { id: true, sourceTitle: true } },
      },
    });
    return {
      items: rows.map(mapPublic),
      nextCursor: rows.length === take ? rows[rows.length - 1]!.createdAt.toISOString() : null,
    };
  }

  async detail(user: AuthUser, id: string) {
    const row = await this.findOwnedOrThrow(user, id);
    return mapPublic(row);
  }

  async rename(user: AuthUser, id: string, title: string) {
    await this.findOwnedOrThrow(user, id);
    const updated = await this.prisma.contentTeleprompterRecording.update({
      where: { id },
      data: { title: sanitizeTitle(title) },
      include: {
        teleprompterSource: { select: { id: true, sourceTitle: true } },
      },
    });
    return mapPublic(updated);
  }

  /**
   * Soft-delete metadata. Object policy: delete storage object immediately;
   * keep metadata row with deletedAt for audit (no storage path ever returned).
   */
  async softDelete(user: AuthUser, id: string) {
    const row = await this.findOwnedOrThrow(user, id);
    removeRecordingObject(row.storageKey);
    await this.prisma.contentTeleprompterRecording.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    return { id: row.id, deleted: true };
  }

  async createDownloadUrl(user: AuthUser, id: string) {
    const row = await this.findOwnedOrThrow(user, id);
    if (row.status !== 'ready' || !objectExists(row.storageKey)) {
      throw new BadRequestException('Recording chưa sẵn sàng để tải');
    }
    const ttl = TELEPROMPTER_RECORDING_LIMITS.downloadUrlTtlSec;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const token = signDownloadToken({
      recordingId: row.id,
      organizationId: user.organizationId,
      userId: user.id,
      exp,
    });
    const port = this.config.get<number>('PORT', 4000);
    const base =
      this.config.get<string>('API_PUBLIC_URL')?.replace(/\/$/, '') || `http://127.0.0.1:${port}`;
    const path = `/api/v1/content-marketing/teleprompter-signed/${row.id}?token=${encodeURIComponent(token)}`;
    return {
      url: `${base}${path}`,
      path,
      expiresAt: new Date(exp * 1000).toISOString(),
      expiresIn: ttl,
      filename: filenameFromTitle(row.title, row.mimeType),
    };
  }

  async streamDownloadByToken(id: string, token: string): Promise<StreamableFile> {
    const payload = verifyDownloadToken(token);
    if (!payload || payload.recordingId !== id) {
      throw new UnauthorizedException('Signed URL không hợp lệ hoặc đã hết hạn');
    }
    const row = await this.prisma.contentTeleprompterRecording.findFirst({
      where: {
        id,
        organizationId: payload.organizationId,
        userId: payload.userId,
        deletedAt: null,
        status: 'ready',
      },
    });
    if (!row || !objectExists(row.storageKey)) {
      throw new NotFoundException('Recording không còn tồn tại');
    }
    const abs = absoluteFromKey(row.storageKey);
    const stream = createReadStream(abs);
    const filename = filenameFromTitle(row.title, row.mimeType);
    return new StreamableFile(stream, {
      type: row.mimeType,
      disposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
      length: objectSize(row.storageKey) || undefined,
    });
  }

  async streamOwned(user: AuthUser, id: string): Promise<StreamableFile> {
    const row = await this.findOwnedOrThrow(user, id);
    if (row.status !== 'ready' || !objectExists(row.storageKey)) {
      throw new BadRequestException('Recording chưa sẵn sàng');
    }
    return new StreamableFile(
      openObjectStream(row.storageKey) as ReturnType<typeof createReadStream>,
      {
        type: row.mimeType,
        disposition: `attachment; filename="${filenameFromTitle(row.title, row.mimeType).replace(/"/g, '')}"`,
        length: objectSize(row.storageKey) || undefined,
      },
    );
  }
}
