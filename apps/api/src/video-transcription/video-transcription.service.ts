import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createWriteStream } from 'fs';
import { basename, extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { Queue } from 'bullmq';
import {
  VIDEO_TRANSCRIPTION_LIMITS,
  classifyVideoSourceUrl,
  parseGlossaryInput,
  resolveDailyTranscriptionQuota,
  videoTranscriptionQueuePayloadSchema,
  type VideoTranscriptionQueuePayload,
} from '@marketingspa/shared';
import {
  VideoTranscriptionSourceType,
  VideoTranscriptionStage,
  VideoTranscriptionStatus,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../common/services/rate-limit.service';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { BillingService } from '../billing/billing.service';
import { VIDEO_TRANSCRIPTION_QUEUE } from '../queue/queue.constants';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { CreateVideoTranscriptionDto } from './dto/video-transcription.dto';
import {
  ALLOWED_MEDIA_EXT,
  ALLOWED_MEDIA_MIME,
  ensureOrgWorkDir,
  removeWorkDir,
} from './video-transcription-files';

type UploadedFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
  stream?: Readable;
};

@Injectable()
export class VideoTranscriptionService {
  private readonly logger = new Logger(VideoTranscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly queueEnqueue: QueueEnqueueService,
    private readonly billing: BillingService,
    @Inject(VIDEO_TRANSCRIPTION_QUEUE) private readonly queue: Queue,
  ) {}

  private maxFileBytes(): number {
    const n = Number(process.env.VIDEO_TRANSCRIPTION_MAX_FILE_BYTES);
    return Number.isFinite(n) && n > 0 ? n : VIDEO_TRANSCRIPTION_LIMITS.maxFileBytes;
  }

  private maxDurationSeconds(): number {
    const n = Number(process.env.VIDEO_TRANSCRIPTION_MAX_DURATION_SECONDS);
    return Number.isFinite(n) && n > 0 ? n : VIDEO_TRANSCRIPTION_LIMITS.maxDurationSeconds;
  }

  toPublic(row: {
    id: string;
    organizationId: string;
    userId: string;
    status: VideoTranscriptionStatus;
    stage: VideoTranscriptionStage;
    sourceType: VideoTranscriptionSourceType;
    sourceUrl: string | null;
    originalFilename: string | null;
    language: string;
    ownershipConfirmed: boolean;
    glossaryTerms?: string[];
    rawTranscript: string | null;
    cleanedTranscript: string | null;
    correctedTranscript?: string | null;
    qualityMeta?: unknown;
    durationSeconds: number | null;
    audioDurationSeconds?: number | null;
    processedDurationSeconds?: number | null;
    chunkCount?: number | null;
    chunksCompleted?: number | null;
    chunkProgress?: unknown;
    fileSizeBytes: bigint | null;
    detectedLanguage: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    attemptCount: number;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
  }) {
    const stageMap: Record<VideoTranscriptionStage, string> = {
      QUEUED: 'queued',
      VALIDATING: 'validating',
      EXTRACTING_AUDIO: 'extracting_audio',
      TRANSCRIBING: 'transcribing',
      CLEANING: 'cleaning',
      COMPLETED: 'completed',
      FAILED: 'failed',
    };
    const statusMap: Record<VideoTranscriptionStatus, string> = {
      PENDING: 'pending',
      PROCESSING: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed',
    };
    const sourceMap: Record<VideoTranscriptionSourceType, string> = {
      UPLOAD: 'upload',
      YOUTUBE: 'youtube',
    };
    const progress = row.chunkProgress as
      | {
          chunkCount?: number;
          chunksCompleted?: number;
          audioDurationSeconds?: number;
          processedDurationSeconds?: number;
          firstTimestamp?: number | null;
          lastTimestamp?: number | null;
          resultCharCount?: number;
          chunks?: Array<{
            index: number;
            startSec: number;
            endSec: number;
            status: string;
            charCount: number;
            error?: string | null;
          }>;
        }
      | null;

    return {
      id: row.id,
      status: statusMap[row.status],
      stage: stageMap[row.stage],
      sourceType: sourceMap[row.sourceType],
      sourceUrl: row.sourceUrl,
      originalFilename: row.originalFilename,
      language: row.language,
      ownershipConfirmed: row.ownershipConfirmed,
      glossaryTerms: row.glossaryTerms ?? [],
      rawTranscript: row.rawTranscript,
      cleanedTranscript: row.cleanedTranscript,
      correctedTranscript: row.correctedTranscript ?? row.cleanedTranscript,
      qualityMeta: row.qualityMeta ?? null,
      durationSeconds: row.durationSeconds,
      audioDurationSeconds: row.audioDurationSeconds ?? progress?.audioDurationSeconds ?? null,
      processedDurationSeconds:
        row.processedDurationSeconds ?? progress?.processedDurationSeconds ?? null,
      chunkCount: row.chunkCount ?? progress?.chunkCount ?? null,
      chunksCompleted: row.chunksCompleted ?? progress?.chunksCompleted ?? null,
      firstTimestamp: progress?.firstTimestamp ?? null,
      lastTimestamp: progress?.lastTimestamp ?? null,
      resultCharCount:
        progress?.resultCharCount ??
        (row.cleanedTranscript ? row.cleanedTranscript.length : null),
      chunks: (progress?.chunks || []).map((c) => ({
        index: c.index,
        startSec: c.startSec,
        endSec: c.endSec,
        status: c.status,
        charCount: c.charCount,
        error: c.error ?? null,
      })),
      fileSizeBytes: row.fileSizeBytes != null ? Number(row.fileSizeBytes) : null,
      detectedLanguage: row.detectedLanguage,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      attemptCount: row.attemptCount,
      maxDurationSeconds: this.maxDurationSeconds(),
      maxFileBytes: this.maxFileBytes(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  async create(
    user: AuthUser,
    dto: CreateVideoTranscriptionDto,
    file?: UploadedFile,
  ) {
    if (!dto.ownershipConfirmed) {
      throw new BadRequestException({
        code: 'OWNERSHIP_REQUIRED',
        message:
          'Bạn phải xác nhận video thuộc quyền sở hữu hoặc bạn có quyền sử dụng hợp pháp trước khi tiếp tục.',
      });
    }

    this.rateLimit.assertWithinLimit(
      `video-transcription:${user.organizationId}:${user.id}`,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitMax,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitWindowMs,
      'Bạn đã gửi quá nhiều yêu cầu lấy văn bản. Thử lại sau vài phút.',
    );

    await this.assertDailyQuota(user);

    const hasFile = Boolean(file && (file.size > 0 || file.buffer?.length));
    const sourceUrl = dto.sourceUrl?.trim() || '';
    if (!hasFile && !sourceUrl) {
      throw new BadRequestException({
        code: 'SOURCE_REQUIRED',
        message: 'Nhập link YouTube hoặc tải lên file video/audio.',
      });
    }
    if (hasFile && sourceUrl) {
      throw new BadRequestException({
        code: 'SOURCE_CONFLICT',
        message: 'Chỉ chọn một nguồn: link YouTube hoặc file upload.',
      });
    }

    let sourceType: VideoTranscriptionSourceType = VideoTranscriptionSourceType.UPLOAD;
    let normalizedUrl: string | null = null;
    if (sourceUrl) {
      const classified = classifyVideoSourceUrl(sourceUrl);
      if (!classified.ok || !classified.sourceType) {
        throw new BadRequestException({
          code: classified.errorCode || 'UNSUPPORTED_URL',
          message: classified.message || 'URL không được hỗ trợ',
        });
      }
      sourceType =
        classified.sourceType === 'youtube'
          ? VideoTranscriptionSourceType.YOUTUBE
          : VideoTranscriptionSourceType.UPLOAD;
      normalizedUrl = sourceUrl;
    }

    if (hasFile && file) {
      this.validateUpload(file);
    }

    const language = (dto.language || 'vi').trim() || 'vi';
    const requestGlossary = parseGlossaryInput(dto.glossary);

    // Merge with saved org/user glossary
    const saved = await this.prisma.videoTranscriptionGlossary.findUnique({
      where: {
        organizationId_userId: {
          organizationId: user.organizationId,
          userId: user.id,
        },
      },
    });
    const glossary = parseGlossaryInput([...(saved?.terms || []), ...requestGlossary]);

    if (requestGlossary.length) {
      await this.prisma.videoTranscriptionGlossary.upsert({
        where: {
          organizationId_userId: {
            organizationId: user.organizationId,
            userId: user.id,
          },
        },
        create: {
          organizationId: user.organizationId,
          userId: user.id,
          terms: glossary,
        },
        update: { terms: glossary },
      });
    }

    const row = await this.prisma.videoTranscription.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        status: VideoTranscriptionStatus.PENDING,
        stage: VideoTranscriptionStage.QUEUED,
        sourceType,
        sourceUrl: normalizedUrl,
        originalFilename: hasFile && file ? basename(file.originalname).slice(0, 500) : null,
        language,
        ownershipConfirmed: true,
        glossaryTerms: glossary,
        fileSizeBytes: hasFile && file ? BigInt(file.size) : null,
        attemptCount: 0,
      },
    });

    const work = ensureOrgWorkDir(user.organizationId, row.id);
    try {
      if (hasFile && file) {
        const ext = this.safeExt(file.originalname);
        const dest = join(work.absolute, `source${ext}`);
        await this.writeUpload(file, dest);
      }

      await this.prisma.videoTranscription.update({
        where: { id: row.id },
        data: {
          tempDir: work.absolute,
          workDirRelative: work.relative,
        },
      });

      const updated = await this.enqueue(user, row.id);
      this.logger.log(
        `Created video transcription ${row.id} org=${user.organizationId} type=${sourceType}`,
      );
      return updated;
    } catch (err) {
      removeWorkDir(work.absolute);
      await this.prisma.videoTranscription.update({
        where: { id: row.id },
        data: {
          status: VideoTranscriptionStatus.FAILED,
          stage: VideoTranscriptionStage.FAILED,
          errorCode: 'ENQUEUE_FAILED',
          errorMessage: err instanceof Error ? err.message : 'Enqueue failed',
          tempDir: null,
        },
      });
      throw err;
    }
  }

  async getById(user: AuthUser, id: string) {
    const row = await this.findOwned(user, id);
    return this.toPublic(row);
  }

  async updateText(user: AuthUser, id: string, cleanedTranscript: string) {
    const row = await this.findOwned(user, id);
    if (row.status !== VideoTranscriptionStatus.COMPLETED) {
      throw new BadRequestException('Chỉ chỉnh sửa được khi đã hoàn tất chuyển văn bản.');
    }
    const updated = await this.prisma.videoTranscription.update({
      where: { id: row.id },
      data: { cleanedTranscript: cleanedTranscript.trim() },
    });
    return this.toPublic(updated);
  }

  async retry(user: AuthUser, id: string) {
    const row = await this.findOwned(user, id);
    if (row.status !== VideoTranscriptionStatus.FAILED) {
      throw new BadRequestException('Chỉ thử lại được job đã thất bại.');
    }
    if (row.attemptCount >= VIDEO_TRANSCRIPTION_LIMITS.maxAttempts) {
      throw new BadRequestException({
        code: 'MAX_ATTEMPTS',
        message: `Đã hết số lần thử lại (${VIDEO_TRANSCRIPTION_LIMITS.maxAttempts}).`,
      });
    }

    this.rateLimit.assertWithinLimit(
      `video-transcription-retry:${user.organizationId}:${user.id}`,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitMax,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitWindowMs,
      'Bạn đã thử lại quá nhiều lần. Thử lại sau vài phút.',
    );

    await this.assertDailyQuota(user);

    // Ensure work dir still usable for upload; YouTube can re-download
    if (row.sourceType === VideoTranscriptionSourceType.UPLOAD) {
      const work = row.tempDir || ensureOrgWorkDir(user.organizationId, row.id).absolute;
      const { readdirSync, existsSync } = await import('fs');
      if (!existsSync(work) || readdirSync(work).length === 0) {
        throw new BadRequestException({
          code: 'SOURCE_GONE',
          message: 'File tạm đã bị xóa. Vui lòng tải lại video và tạo yêu cầu mới.',
        });
      }
    } else {
      const work = ensureOrgWorkDir(user.organizationId, row.id);
      await this.prisma.videoTranscription.update({
        where: { id: row.id },
        data: { tempDir: work.absolute, workDirRelative: work.relative },
      });
    }

    await this.prisma.videoTranscription.update({
      where: { id: row.id },
      data: {
        status: VideoTranscriptionStatus.PENDING,
        stage: VideoTranscriptionStage.QUEUED,
        errorCode: null,
        errorMessage: null,
        rawTranscript: null,
        cleanedTranscript: null,
        completedAt: null,
        // Keep chunkProgress so completed chunks can be reused
      },
    });

    return this.enqueue(user, row.id);
  }

  async retryChunk(user: AuthUser, id: string, chunkIndex: number) {
    const row = await this.findOwned(user, id);
    if (!row.tempDir) {
      throw new BadRequestException({
        code: 'SOURCE_GONE',
        message: 'File tạm đã bị xóa. Vui lòng tạo yêu cầu mới.',
      });
    }
    const progress = row.chunkProgress as { chunks?: Array<{ index: number; status: string }> } | null;
    const chunk = progress?.chunks?.find((c) => c.index === chunkIndex);
    if (!chunk) {
      throw new BadRequestException({
        code: 'CHUNK_MISSING',
        message: `Không tìm thấy chunk #${chunkIndex}`,
      });
    }

    this.rateLimit.assertWithinLimit(
      `video-transcription-chunk-retry:${user.organizationId}:${user.id}`,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitMax,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitWindowMs,
      'Bạn đã thử lại quá nhiều lần. Thử lại sau vài phút.',
    );

    // Mark chunk pending so worker redoes it
    if (progress?.chunks) {
      const nextChunks = progress.chunks.map((c) =>
        c.index === chunkIndex ? { ...c, status: 'pending', error: null } : c,
      );
      await this.prisma.videoTranscription.update({
        where: { id: row.id },
        data: {
          status: VideoTranscriptionStatus.PENDING,
          stage: VideoTranscriptionStage.QUEUED,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          chunkProgress: { ...progress, chunks: nextChunks },
        },
      });
    }

    return this.enqueue(user, row.id, chunkIndex);
  }

  private async enqueue(user: AuthUser, transcriptionId: string, chunkIndex?: number) {
    const payload: VideoTranscriptionQueuePayload = videoTranscriptionQueuePayloadSchema.parse({
      organizationId: user.organizationId,
      transcriptionId,
      userId: user.id,
      ...(chunkIndex != null ? { chunkIndex } : {}),
    });

    await this.queueEnqueue.add(this.queue, 'video-transcription', payload, {
      jobId: `video-transcription-${transcriptionId}-${chunkIndex ?? 'all'}`,
      attempts: VIDEO_TRANSCRIPTION_LIMITS.maxAttempts,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    const updated = await this.prisma.videoTranscription.update({
      where: { id: transcriptionId },
      data: {
        status: VideoTranscriptionStatus.PENDING,
        stage: VideoTranscriptionStage.QUEUED,
        bullJobId: `video-transcription-${transcriptionId}`,
      },
    });
    return this.toPublic(updated);
  }

  async getGlossary(user: AuthUser) {
    const row = await this.prisma.videoTranscriptionGlossary.findUnique({
      where: {
        organizationId_userId: {
          organizationId: user.organizationId,
          userId: user.id,
        },
      },
    });
    return { terms: row?.terms ?? [] };
  }

  private async findOwned(user: AuthUser, id: string) {
    const row = await this.prisma.videoTranscription.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        userId: user.id,
      },
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy yêu cầu hoặc không có quyền truy cập');
    }
    return row;
  }

  private async assertDailyQuota(user: AuthUser) {
    const ent = await this.billing.hasValidEntitlement(user.organizationId);
    if (!ent.ok) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Cần gói dịch vụ hợp lệ để dùng tính năng lấy văn bản từ video.',
      });
    }

    let planCode: string | null = null;
    const sub = await this.prisma.subscription.findFirst({
      where: { organizationId: user.organizationId },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    planCode = sub?.plan?.code ?? null;
    const quota = resolveDailyTranscriptionQuota(planCode, !!ent.isTrial);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const used = await this.prisma.videoTranscription.count({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        createdAt: { gte: start },
        status: { not: VideoTranscriptionStatus.FAILED },
      },
    });

    if (used >= quota) {
      throw new ForbiddenException({
        code: 'QUOTA_EXCEEDED',
        message: `Đã hết hạn mức ${quota} lần lấy văn bản/ngày theo gói hiện tại.`,
        quota,
        used,
      });
    }
  }

  private validateUpload(file: UploadedFile) {
    if (file.size > this.maxFileBytes()) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File tối đa ${Math.round(this.maxFileBytes() / (1024 * 1024))}MB.`,
      });
    }
    const ext = this.safeExt(file.originalname).toLowerCase();
    if (!ALLOWED_MEDIA_EXT.has(ext)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: `Định dạng không hỗ trợ (${ext || 'unknown'}). Dùng mp4, mov, webm, mp3, wav, m4a…`,
      });
    }
    if (file.mimetype && !ALLOWED_MEDIA_MIME.has(file.mimetype)) {
      this.logger.warn(`Unusual mime ${file.mimetype} for ${file.originalname} — allowing by ext`);
    }
  }

  private safeExt(filename: string): string {
    const ext = extname(filename || '').toLowerCase();
    return ext && ext.length <= 10 ? ext : '.mp4';
  }

  private async writeUpload(file: UploadedFile, dest: string): Promise<void> {
    if (file.buffer && file.buffer.length) {
      const { writeFileSync, unlinkSync } = await import('fs');
      writeFileSync(dest, file.buffer);
      return;
    }
    if (file.path) {
      const { copyFileSync, unlinkSync } = await import('fs');
      copyFileSync(file.path, dest);
      try {
        unlinkSync(file.path);
      } catch {
        /* incoming temp */
      }
      return;
    }
    if (file.stream) {
      await pipeline(file.stream, createWriteStream(dest));
      return;
    }
    throw new BadRequestException('Không đọc được file upload');
  }
}
