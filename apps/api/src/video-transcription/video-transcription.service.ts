import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, createWriteStream, existsSync, readdirSync, statSync } from 'fs';
import { basename, extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { Queue } from 'bullmq';
import {
  VIDEO_TRANSCRIPTION_LIMITS,
  classifyVideoSourceUrl,
  isAllowedVideoTranscriptionHost,
  parseGlossaryInput,
  resolveDailyTranscriptionQuota,
  videoTranscriptionQueuePayloadSchema,
  type VideoTranscriptionQueuePayload,
  type VideoUrlProbeResult,
  CREDIT_FEATURE_CODES,
} from '@marketingspa/shared';
import { assertPublicHttpUrl } from '@marketingspa/shared/dist/ssrf-fetch';
import {
  VideoTranscriptionSourceType,
  VideoTranscriptionStage,
  VideoTranscriptionStatus,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../common/services/rate-limit.service';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { BillingService } from '../billing/billing.service';
import { CreditService } from '../credit/credit.service';
import { VIDEO_TRANSCRIPTION_QUEUE } from '../queue/queue.constants';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { CreateVideoTranscriptionDto } from './dto/video-transcription.dto';
import { parseStrictBool } from './dto/video-transcription.dto';
import {
  ALLOWED_MEDIA_EXT,
  ALLOWED_MEDIA_MIME,
  ensureOrgWorkDir,
  removeWorkDir,
} from './video-transcription-files';
import { probeVideoUrlMeta } from './video-transcription-remote';

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
    private readonly credit: CreditService,
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
    sourceTitle?: string | null;
    thumbnailUrl?: string | null;
    originalFilename: string | null;
    language: string;
    ownershipConfirmed: boolean;
    keepVideo?: boolean;
    cancelRequested?: boolean;
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
    tempDir?: string | null;
    tempExpiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
  }) {
    const stageMap: Record<VideoTranscriptionStage, string> = {
      QUEUED: 'queued',
      VALIDATING: 'validating',
      DOWNLOADING: 'downloading',
      EXTRACTING_AUDIO: 'extracting_audio',
      TRANSCRIBING: 'transcribing',
      CLEANING: 'cleaning',
      COMPLETED: 'completed',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
    };
    const statusMap: Record<VideoTranscriptionStatus, string> = {
      PENDING: 'pending',
      PROCESSING: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
    };
    const sourceMap: Record<VideoTranscriptionSourceType, string> = {
      UPLOAD: 'upload',
      YOUTUBE: 'youtube',
      FACEBOOK: 'facebook',
      TIKTOK: 'tiktok',
    };
    const progress = row.chunkProgress as
      | {
          chunkCount?: number;
          chunksCompleted?: number;
          currentChunkIndex?: number | null;
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
            asrEndSec?: number | null;
          }>;
        }
      | null;

    const keepVideo = Boolean(row.keepVideo);
    const videoDownloadAvailable = Boolean(
      keepVideo &&
        row.tempDir &&
        (!row.tempExpiresAt || row.tempExpiresAt.getTime() > Date.now()) &&
        this.findVideoSourceInDir(row.tempDir),
    );
    const transcriptDownloadAvailable = Boolean(
      (row.cleanedTranscript || row.correctedTranscript || row.rawTranscript)?.trim(),
    );

    return {
      id: row.id,
      status: statusMap[row.status],
      stage: stageMap[row.stage],
      sourceType: sourceMap[row.sourceType],
      sourceUrl: row.sourceUrl,
      sourceTitle: row.sourceTitle ?? null,
      thumbnailUrl: row.thumbnailUrl ?? null,
      originalFilename: row.originalFilename,
      language: row.language,
      ownershipConfirmed: row.ownershipConfirmed,
      keepVideo,
      cancelRequested: row.cancelRequested ?? false,
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
      currentChunkIndex:
        progress?.currentChunkIndex != null && Number.isFinite(progress.currentChunkIndex)
          ? progress.currentChunkIndex
          : null,
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
        asrEndSec: c.asrEndSec ?? null,
      })),
      fileSizeBytes: row.fileSizeBytes != null ? Number(row.fileSizeBytes) : null,
      detectedLanguage: row.detectedLanguage,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      attemptCount: row.attemptCount,
      videoDownloadAvailable,
      transcriptDownloadAvailable,
      tempExpiresAt: row.tempExpiresAt?.toISOString() ?? null,
      maxDurationSeconds: this.maxDurationSeconds(),
      maxFileBytes: this.maxFileBytes(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  private findSourceInDir(dir: string | null | undefined): string | null {
    if (!dir || !existsSync(dir)) return null;
    try {
      const files = readdirSync(dir).filter((f) => f.startsWith('source.'));
      return files[0] ? join(dir, files[0]) : null;
    } catch {
      return null;
    }
  }

  /** Full-video files only — never promote pure audio sources as downloadable video. */
  private findVideoSourceInDir(dir: string | null | undefined): string | null {
    if (!dir || !existsSync(dir)) return null;
    const videoExt = new Set([
      '.mp4',
      '.mkv',
      '.mov',
      '.avi',
      '.m4v',
      '.flv',
      '.webm',
    ]);
    const audioOnlyExt = new Set([
      '.m4a',
      '.mp3',
      '.aac',
      '.ogg',
      '.opus',
      '.wav',
      '.flac',
      '.weba',
    ]);
    try {
      const files = readdirSync(dir).filter((f) => f.startsWith('source.'));
      for (const f of files) {
        const ext = extname(f).toLowerCase();
        if (audioOnlyExt.has(ext)) continue;
        if (videoExt.has(ext) || (!ext && f === 'source')) {
          return join(dir, f);
        }
        // unknown container — only when keepVideo path produced it; still return if not audio-only
        if (!audioOnlyExt.has(ext)) return join(dir, f);
      }
      return null;
    } catch {
      return null;
    }
  }

  private mapSourceType(
    sourceType: string,
  ): VideoTranscriptionSourceType {
    if (sourceType === 'youtube') return VideoTranscriptionSourceType.YOUTUBE;
    if (sourceType === 'facebook') return VideoTranscriptionSourceType.FACEBOOK;
    if (sourceType === 'tiktok') return VideoTranscriptionSourceType.TIKTOK;
    return VideoTranscriptionSourceType.UPLOAD;
  }

  async probeUrl(user: AuthUser, url: string): Promise<VideoUrlProbeResult> {
    this.rateLimit.assertWithinLimit(
      `video-transcription-probe:${user.organizationId}:${user.id}`,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitMax * 2,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitWindowMs,
      'Bạn đã kiểm tra URL quá nhiều lần. Thử lại sau vài phút.',
    );

    const classified = classifyVideoSourceUrl(url);
    if (!classified.ok || !classified.platform) {
      return {
        ok: false,
        errorCode: classified.errorCode || 'UNSUPPORTED_URL',
        message: classified.message || 'URL không được hỗ trợ',
      };
    }

    try {
      await assertPublicHttpUrl(url, {
        skipCommerceHostBlock: true,
        allowHost: isAllowedVideoTranscriptionHost,
      });
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code || 'SSRF_BLOCKED')
          : 'SSRF_BLOCKED';
      return {
        ok: false,
        platform: classified.platform,
        errorCode: code,
        message: err instanceof Error ? err.message : 'URL bị chặn vì lý do bảo mật',
      };
    }

    try {
      const meta = await probeVideoUrlMeta(url, classified.platform);
      if (
        meta.durationSeconds != null &&
        meta.durationSeconds > this.maxDurationSeconds()
      ) {
        return {
          ok: false,
          platform: classified.platform,
          sourceType: classified.platform,
          url,
          title: meta.title,
          thumbnailUrl: meta.thumbnailUrl,
          durationSeconds: meta.durationSeconds,
          errorCode: 'DURATION_EXCEEDED',
          message: `Video dài hơn ${Math.round(this.maxDurationSeconds() / 60)} phút.`,
        };
      }
      return {
        ok: true,
        platform: classified.platform,
        sourceType: classified.platform,
        url,
        title: meta.title,
        thumbnailUrl: meta.thumbnailUrl,
        durationSeconds: meta.durationSeconds,
      };
    } catch (err) {
      return {
        ok: false,
        platform: classified.platform,
        sourceType: classified.platform,
        url,
        errorCode:
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: string }).code || 'PROBE_FAILED')
            : 'PROBE_FAILED',
        message: err instanceof Error ? err.message : 'Không kiểm tra được URL',
      };
    }
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
        message:
          'Nhập link YouTube / Facebook / TikTok công khai hoặc tải lên file video/audio.',
      });
    }
    if (hasFile && sourceUrl) {
      throw new BadRequestException({
        code: 'SOURCE_CONFLICT',
        message: 'Chỉ chọn một nguồn: link URL hoặc file upload.',
      });
    }

    let sourceType: VideoTranscriptionSourceType = VideoTranscriptionSourceType.UPLOAD;
    let normalizedUrl: string | null = null;
    if (sourceUrl) {
      const classified = classifyVideoSourceUrl(sourceUrl);
      if (!classified.ok || !classified.sourceType || classified.sourceType === 'upload') {
        throw new BadRequestException({
          code: classified.errorCode || 'UNSUPPORTED_URL',
          message: classified.message || 'URL không được hỗ trợ',
        });
      }
      try {
        await assertPublicHttpUrl(sourceUrl, {
          skipCommerceHostBlock: true,
          allowHost: isAllowedVideoTranscriptionHost,
        });
      } catch (err) {
        throw new BadRequestException({
          code:
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: string }).code || 'SSRF_BLOCKED')
              : 'SSRF_BLOCKED',
          message: err instanceof Error ? err.message : 'URL bị chặn vì lý do bảo mật',
        });
      }
      sourceType = this.mapSourceType(classified.sourceType);
      normalizedUrl = sourceUrl;
    }

    if (hasFile && file) {
      this.validateUpload(file);
    }

    const language = (dto.language || 'vi').trim() || 'vi';
    const requestGlossary = parseGlossaryInput(dto.glossary);
    // Upload: keep media for download. Remote URLs: keepVideo must be EXPLICIT true (default false).
    // Re-parse with strict helper — protect against Boolean("false")===true pipe bugs.
    const keepVideo = hasFile
      ? true
      : parseStrictBool((dto as { keepVideo?: unknown }).keepVideo, false);
    this.logger.log(
      `video-transcription create keepVideo raw=${String((dto as { keepVideo?: unknown }).keepVideo)} ` +
        `parsed=${keepVideo} hasFile=${hasFile}`,
    );

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
        sourceTitle: dto.sourceTitle?.trim()?.slice(0, 500) || null,
        thumbnailUrl: dto.thumbnailUrl?.trim()?.slice(0, 2000) || null,
        durationSeconds:
          dto.durationSeconds != null && Number.isFinite(dto.durationSeconds)
            ? Math.ceil(dto.durationSeconds)
            : null,
        originalFilename: hasFile && file ? basename(file.originalname).slice(0, 500) : null,
        language,
        ownershipConfirmed: true,
        keepVideo,
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
    await this.cleanupIfExpired(row);
    const fresh = await this.findOwned(user, id);
    return this.toPublic(fresh);
  }

  private async cleanupIfExpired(row: {
    id: string;
    tempDir: string | null;
    tempExpiresAt: Date | null;
  }) {
    if (!row.tempDir || !row.tempExpiresAt) return;
    if (row.tempExpiresAt.getTime() > Date.now()) return;
    removeWorkDir(row.tempDir);
    await this.prisma.videoTranscription.update({
      where: { id: row.id },
      data: { tempDir: null, tempExpiresAt: null },
    });
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.findOwned(user, id);
    if (
      row.status === VideoTranscriptionStatus.COMPLETED ||
      row.status === VideoTranscriptionStatus.CANCELLED
    ) {
      throw new BadRequestException({
        code: 'NOT_CANCELLABLE',
        message: 'Job đã kết thúc — không thể hủy.',
      });
    }

    this.rateLimit.assertWithinLimit(
      `video-transcription-cancel:${user.organizationId}:${user.id}`,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitMax,
      VIDEO_TRANSCRIPTION_LIMITS.rateLimitWindowMs,
      'Bạn đã hủy quá nhiều lần. Thử lại sau vài phút.',
    );

    for (const suffix of ['all', ...Array.from({ length: 64 }, (_, i) => String(i))]) {
      try {
        const bullJob = await this.queue.getJob(`video-transcription-${id}-${suffix}`);
        if (bullJob) await bullJob.remove();
      } catch {
        /* ignore */
      }
    }

    removeWorkDir(row.tempDir);
    const updated = await this.prisma.videoTranscription.update({
      where: { id: row.id },
      data: {
        cancelRequested: true,
        status: VideoTranscriptionStatus.CANCELLED,
        stage: VideoTranscriptionStage.CANCELLED,
        errorCode: 'CANCELLED',
        errorMessage: 'Job đã bị hủy bởi người dùng',
        tempDir: null,
        tempExpiresAt: null,
        completedAt: new Date(),
      },
    });
    return this.toPublic(updated);
  }

  async downloadVideo(user: AuthUser, id: string): Promise<{ file: StreamableFile; filename: string }> {
    const row = await this.findOwned(user, id);
    if (!row.keepVideo) {
      throw new BadRequestException({
        code: 'VIDEO_NOT_KEPT',
        message:
          'Job này không lưu video tạm. Bật «Lưu video tạm để tải xuống» khi tạo yêu cầu mới.',
      });
    }
    await this.cleanupIfExpired(row);
    const fresh = await this.findOwned(user, id);
    const source = this.findVideoSourceInDir(fresh.tempDir);
    if (!source || !existsSync(source)) {
      throw new BadRequestException({
        code: 'VIDEO_GONE',
        message:
          'File video tạm không còn (đã hết hạn hoặc chưa tải xong). Chỉ giữ tạm ~30 phút sau khi hoàn tất.',
      });
    }
    const ext = extname(source) || '.mp4';
    const filename = `video-${id.slice(0, 8)}${ext}`;
    const stream = createReadStream(source);
    return {
      file: new StreamableFile(stream, {
        type: 'application/octet-stream',
        disposition: `attachment; filename="${filename}"`,
        length: statSync(source).size,
      }),
      filename,
    };
  }

  async downloadTranscript(
    user: AuthUser,
    id: string,
  ): Promise<{ file: StreamableFile; filename: string }> {
    const row = await this.findOwned(user, id);
    const text = (
      row.cleanedTranscript ||
      row.correctedTranscript ||
      row.rawTranscript ||
      ''
    ).trim();
    if (!text) {
      throw new BadRequestException({
        code: 'TRANSCRIPT_EMPTY',
        message: 'Chưa có transcript hợp lệ để tải.',
      });
    }
    const filename = `transcript-${id.slice(0, 8)}.txt`;
    const buf = Buffer.from(text, 'utf8');
    return {
      file: new StreamableFile(buf, {
        type: 'text/plain; charset=utf-8',
        disposition: `attachment; filename="${filename}"`,
        length: buf.length,
      }),
      filename,
    };
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
    if (
      row.status !== VideoTranscriptionStatus.FAILED &&
      row.status !== VideoTranscriptionStatus.CANCELLED
    ) {
      throw new BadRequestException('Chỉ thử lại được job đã thất bại hoặc đã hủy.');
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

    // Ensure work dir still usable for upload; remote URLs can re-download
    if (row.sourceType === VideoTranscriptionSourceType.UPLOAD) {
      const work = row.tempDir || ensureOrgWorkDir(user.organizationId, row.id).absolute;
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
        cancelRequested: false,
        errorCode: null,
        errorMessage: null,
        rawTranscript: null,
        cleanedTranscript: null,
        completedAt: null,
        tempExpiresAt: null,
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
    const existing = await this.prisma.videoTranscription.findFirst({
      where: {
        id: transcriptionId,
        organizationId: user.organizationId,
        userId: user.id,
      },
      select: { keepVideo: true },
    });
    const payload: VideoTranscriptionQueuePayload = videoTranscriptionQueuePayloadSchema.parse({
      organizationId: user.organizationId,
      transcriptionId,
      userId: user.id,
      // explicit false — never Boolean(undefined)||true
      keepVideo: existing?.keepVideo === true,
      ...(chunkIndex != null ? { chunkIndex } : {}),
    });
    this.logger.log(
      `video-transcription enqueue id=${transcriptionId} keepVideo=${payload.keepVideo}`,
    );

    const cost = await this.credit.getFeatureCost(CREDIT_FEATURE_CODES.VIDEO_TRANSCRIBE);
    const ok = await this.credit.checkAvailable(user.organizationId, cost);
    if (!ok) {
      const bal = await this.credit.getBalance(user.organizationId);
      throw new BadRequestException({
        code: 'INSUFFICIENT_CREDITS',
        message: 'Không đủ AI Credit',
        required: cost,
        available: bal.available,
      });
    }

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
        status: { notIn: [VideoTranscriptionStatus.FAILED, VideoTranscriptionStatus.CANCELLED] },
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
