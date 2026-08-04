import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Job } from 'bullmq';
import {
  VIDEO_TRANSCRIPTION_LIMITS,
  VIDEO_TRANSCRIPTION_TEMP_RETENTION_MS,
  buildChunkPlan,
  correctVietnameseTranscript,
  durationsMatch,
  mapVideoDownloadError,
  mergeChunkTranscripts,
  parseGlossaryInput,
  sumCompletedChunkCoverage,
  videoTranscriptionQueuePayloadSchema,
  type TranscriptChunkResult,
  type TranscriptProgressSnapshot,
} from '@marketingspa/shared';
import {
  prisma,
  VideoTranscriptionSourceType,
  VideoTranscriptionStage,
  VideoTranscriptionStatus,
  type Prisma,
} from '@marketingspa/database';
import {
  downloadRemoteVideo,
  extractAudioHq,
  pass1Model,
  pass2Model,
  probeAudioMeta,
  probeDurationSeconds,
  probeRemoteVideoMeta,
  sliceAudioWav,
  twoPassTranscribeChunk,
  type RemoteVideoPlatform,
} from '../lib/video-transcription-stt';

function maxDurationSeconds(): number {
  const n = Number(process.env.VIDEO_TRANSCRIPTION_MAX_DURATION_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : VIDEO_TRANSCRIPTION_LIMITS.maxDurationSeconds;
}

function maxFileBytes(): number {
  const n = Number(process.env.VIDEO_TRANSCRIPTION_MAX_FILE_BYTES);
  return Number.isFinite(n) && n > 0 ? n : VIDEO_TRANSCRIPTION_LIMITS.maxFileBytes;
}

function removeDir(path: string | null | undefined) {
  if (!path) return;
  try {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  } catch (err) {
    console.warn(
      `[video-transcription] cleanup failed ${path}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

function findSourceFile(workDir: string): string | null {
  if (!existsSync(workDir)) return null;
  const files = readdirSync(workDir).filter((f) => f.startsWith('source.'));
  return files[0] ? join(workDir, files[0]) : null;
}

function toRemotePlatform(
  sourceType: VideoTranscriptionSourceType,
): RemoteVideoPlatform | null {
  if (sourceType === VideoTranscriptionSourceType.YOUTUBE) return 'youtube';
  if (sourceType === VideoTranscriptionSourceType.FACEBOOK) return 'facebook';
  if (sourceType === VideoTranscriptionSourceType.TIKTOK) return 'tiktok';
  return null;
}

async function setStage(
  id: string,
  stage: VideoTranscriptionStage,
  extra?: Prisma.VideoTranscriptionUpdateInput,
) {
  await prisma.videoTranscription.update({
    where: { id },
    data: {
      stage,
      status:
        stage === VideoTranscriptionStage.FAILED
          ? VideoTranscriptionStatus.FAILED
          : stage === VideoTranscriptionStage.CANCELLED
            ? VideoTranscriptionStatus.CANCELLED
            : stage === VideoTranscriptionStage.COMPLETED
              ? VideoTranscriptionStatus.COMPLETED
              : VideoTranscriptionStatus.PROCESSING,
      ...extra,
    },
  });
}

async function assertNotCancelled(id: string) {
  const row = await prisma.videoTranscription.findUnique({
    where: { id },
    select: { cancelRequested: true, status: true },
  });
  if (row?.cancelRequested || row?.status === VideoTranscriptionStatus.CANCELLED) {
    throw Object.assign(new Error('Job đã bị hủy'), { code: 'CANCELLED' });
  }
}

function emptyProgress(
  videoDuration: number,
  audioDuration: number,
  plans: ReturnType<typeof buildChunkPlan>,
  existing?: TranscriptChunkResult[],
): TranscriptProgressSnapshot {
  const byIndex = new Map((existing || []).map((c) => [c.index, c]));
  const chunks: TranscriptChunkResult[] = plans.map((p) => {
    const prev = byIndex.get(p.index);
    if (prev?.status === 'completed' && prev.text) {
      return { ...prev, startSec: p.startSec, endSec: p.endSec };
    }
    return {
      index: p.index,
      startSec: p.startSec,
      endSec: p.endSec,
      status: 'pending',
      text: '',
      rawText: '',
      segments: [],
      charCount: 0,
      error: null,
      attempts: prev?.attempts || 0,
    };
  });
  return {
    version: 1,
    audioDurationSeconds: audioDuration,
    videoDurationSeconds: videoDuration,
    processedDurationSeconds: sumCompletedChunkCoverage(chunks),
    chunkCount: chunks.length,
    chunksCompleted: chunks.filter((c) => c.status === 'completed').length,
    firstTimestamp: null,
    lastTimestamp: null,
    resultCharCount: 0,
    chunks,
  };
}

function logProgress(tag: string, id: string, progress: TranscriptProgressSnapshot, extra = '') {
  console.log(
    `[video-transcription] ${tag} id=${id}` +
      ` video=${progress.videoDurationSeconds.toFixed(1)}s` +
      ` audio=${progress.audioDurationSeconds.toFixed(1)}s` +
      ` chunks=${progress.chunkCount}` +
      ` done=${progress.chunksCompleted}` +
      ` processed=${progress.processedDurationSeconds.toFixed(1)}s` +
      ` firstTs=${progress.firstTimestamp ?? '-'}` +
      ` lastTs=${progress.lastTimestamp ?? '-'}` +
      ` chars=${progress.resultCharCount}` +
      (extra ? ` ${extra}` : ''),
  );
}

export async function processVideoTranscription(job: Job): Promise<{ id: string; ok: boolean }> {
  const payload = videoTranscriptionQueuePayloadSchema.parse(job.data);
  const row = await prisma.videoTranscription.findFirst({
    where: {
      id: payload.transcriptionId,
      organizationId: payload.organizationId,
      userId: payload.userId,
    },
  });
  if (!row) {
    console.warn(`[video-transcription] missing row ${payload.transcriptionId}`);
    return { id: payload.transcriptionId, ok: false };
  }

  if (row.cancelRequested || row.status === VideoTranscriptionStatus.CANCELLED) {
    removeDir(row.tempDir);
    await prisma.videoTranscription.update({
      where: { id: row.id },
      data: {
        status: VideoTranscriptionStatus.CANCELLED,
        stage: VideoTranscriptionStage.CANCELLED,
        tempDir: null,
        errorCode: 'CANCELLED',
        errorMessage: 'Job đã bị hủy',
      },
    });
    return { id: row.id, ok: false };
  }

  const workDir = row.tempDir;
  const onlyChunk = payload.chunkIndex;
  const glossary = parseGlossaryInput(row.glossaryTerms || []);
  const language = !row.language || row.language === 'auto' ? 'vi' : row.language;
  const platform = toRemotePlatform(row.sourceType);

  try {
    await prisma.videoTranscription.update({
      where: { id: row.id },
      data: {
        attemptCount: { increment: 1 },
        status: VideoTranscriptionStatus.PROCESSING,
        stage: VideoTranscriptionStage.VALIDATING,
        errorCode: null,
        errorMessage: null,
      },
    });

    if (!workDir) {
      throw Object.assign(new Error('Thiếu thư mục làm việc tạm'), { code: 'NO_TEMP_DIR' });
    }
    mkdirSync(workDir, { recursive: true });
    const chunksDir = join(workDir, 'chunks');
    mkdirSync(chunksDir, { recursive: true });

    await assertNotCancelled(row.id);
    await setStage(row.id, VideoTranscriptionStage.VALIDATING);
    let sourcePath = findSourceFile(workDir);

    if (platform) {
      if (!row.sourceUrl) {
        throw Object.assign(new Error(`Thiếu URL ${platform}`), { code: 'NO_URL' });
      }
      if (!row.sourceTitle || row.durationSeconds == null) {
        try {
          const meta = await probeRemoteVideoMeta(row.sourceUrl, platform);
          if (meta.durationSeconds != null && meta.durationSeconds > maxDurationSeconds()) {
            throw Object.assign(
              new Error(`Video dài hơn ${Math.round(maxDurationSeconds() / 60)} phút`),
              { code: 'DURATION_EXCEEDED' },
            );
          }
          await prisma.videoTranscription.update({
            where: { id: row.id },
            data: {
              sourceTitle: meta.title?.slice(0, 500) ?? row.sourceTitle,
              thumbnailUrl: meta.thumbnailUrl?.slice(0, 2000) ?? row.thumbnailUrl,
              durationSeconds:
                meta.durationSeconds != null
                  ? Math.ceil(meta.durationSeconds)
                  : row.durationSeconds,
            },
          });
        } catch (probeErr) {
          const raw = probeErr instanceof Error ? probeErr.message : String(probeErr);
          if ((probeErr as { code?: string })?.code === 'DURATION_EXCEEDED') throw probeErr;
          const mapped = mapVideoDownloadError(platform, raw);
          console.warn(`[video-transcription] probe soft-fail ${row.id}: ${mapped.message}`);
        }
      }

      if (!sourcePath) {
        await assertNotCancelled(row.id);
        await setStage(row.id, VideoTranscriptionStage.DOWNLOADING);
        try {
          sourcePath = await downloadRemoteVideo(
            row.sourceUrl,
            workDir,
            platform,
            row.durationSeconds || 3600,
            maxFileBytes(),
          );
        } catch (dlErr) {
          const raw = dlErr instanceof Error ? dlErr.message : String(dlErr);
          const mapped = mapVideoDownloadError(platform, raw);
          throw Object.assign(new Error(mapped.message), { code: mapped.code });
        }
      }
    }

    await assertNotCancelled(row.id);

    if (!sourcePath || !existsSync(sourcePath)) {
      throw Object.assign(new Error('Không tìm thấy file nguồn'), { code: 'SOURCE_MISSING' });
    }

    const size = statSync(sourcePath).size;
    if (size > maxFileBytes()) {
      throw Object.assign(new Error(`File vượt ${Math.round(maxFileBytes() / (1024 * 1024))}MB`), {
        code: 'FILE_TOO_LARGE',
      });
    }

    const videoDuration = await probeDurationSeconds(sourcePath);
    if (videoDuration > maxDurationSeconds()) {
      throw Object.assign(
        new Error(`Video dài hơn ${Math.round(maxDurationSeconds() / 60)} phút`),
        { code: 'DURATION_EXCEEDED' },
      );
    }

    const sourceMeta = await probeAudioMeta(sourcePath);
    console.log(
      `[video-transcription] source-audio id=${row.id}` +
        ` platform=${platform || 'upload'}` +
        ` codec=${sourceMeta.codec}` +
        ` bitrate=${sourceMeta.bitRate}` +
        ` rate=${sourceMeta.sampleRate}` +
        ` ch=${sourceMeta.channels}` +
        ` glossary=${glossary.length}` +
        ` lang=${language}` +
        ` pass1=${pass1Model()} pass2=${pass2Model()}`,
    );

    await assertNotCancelled(row.id);
    await setStage(row.id, VideoTranscriptionStage.EXTRACTING_AUDIO);
    const audioPath = join(workDir, 'audio.wav');
    if (!existsSync(audioPath) || statSync(audioPath).size < 100) {
      await extractAudioHq(sourcePath, audioPath, videoDuration);
    }

    let audioDurFinal = await probeDurationSeconds(audioPath);
    if (!durationsMatch(videoDuration, audioDurFinal, Math.max(5, videoDuration * 0.03))) {
      await extractAudioHq(sourcePath, audioPath, videoDuration);
      audioDurFinal = await probeDurationSeconds(audioPath);
      if (!durationsMatch(videoDuration, audioDurFinal, Math.max(5, videoDuration * 0.03))) {
        throw Object.assign(
          new Error(
            `Audio (${audioDurFinal.toFixed(1)}s) không khớp video (${videoDuration.toFixed(1)}s)`,
          ),
          { code: 'AUDIO_DURATION_MISMATCH' },
        );
      }
    }

    const wavMeta = await probeAudioMeta(audioPath);
    const plans = buildChunkPlan(audioDurFinal);
    const existingProgress = (row.chunkProgress || null) as TranscriptProgressSnapshot | null;
    const progress = emptyProgress(videoDuration, audioDurFinal, plans, existingProgress?.chunks);

    const allRetries: Array<{ start: number; end: number; reason: string; model: string }> = [];

    await prisma.videoTranscription.update({
      where: { id: row.id },
      data: {
        durationSeconds: Math.ceil(videoDuration),
        audioDurationSeconds: audioDurFinal,
        fileSizeBytes: BigInt(size),
        chunkCount: progress.chunkCount,
        chunksCompleted: progress.chunksCompleted,
        chunkProgress: progress as unknown as Prisma.InputJsonValue,
        processedDurationSeconds: progress.processedDurationSeconds,
        qualityMeta: {
          sourceCodec: sourceMeta.codec,
          sourceBitRate: sourceMeta.bitRate,
          wavCodec: wavMeta.codec,
          wavSampleRate: wavMeta.sampleRate,
          language,
          glossary,
          platform: platform || 'upload',
          pass1Model: pass1Model(),
          pass2Model: pass2Model(),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    logProgress('plan', row.id, progress, `glossary=${glossary.length}`);
    await assertNotCancelled(row.id);
    await setStage(row.id, VideoTranscriptionStage.TRANSCRIBING);

    const indices =
      onlyChunk != null
        ? [onlyChunk]
        : progress.chunks.filter((c) => c.status !== 'completed').map((c) => c.index);

    let previousTail = '';
    for (const c of progress.chunks) {
      if (c.status === 'completed' && c.rawText) {
        previousTail = c.rawText.slice(-400);
      }
    }

    for (const idx of indices) {
      await assertNotCancelled(row.id);
      const plan = plans.find((p) => p.index === idx);
      const chunkState = progress.chunks.find((c) => c.index === idx);
      if (!plan || !chunkState) {
        throw Object.assign(new Error(`Chunk ${idx} không tồn tại`), { code: 'CHUNK_MISSING' });
      }

      chunkState.status = 'processing';
      chunkState.attempts += 1;
      chunkState.error = null;
      progress.chunksCompleted = progress.chunks.filter((c) => c.status === 'completed').length;
      await prisma.videoTranscription.update({
        where: { id: row.id },
        data: {
          chunkProgress: progress as unknown as Prisma.InputJsonValue,
          chunksCompleted: progress.chunksCompleted,
        },
      });

      const chunkPath = join(chunksDir, `chunk-${String(idx).padStart(4, '0')}.wav`);
      try {
        await sliceAudioWav({
          audioPath,
          outPath: chunkPath,
          startSec: plan.startSec,
          durationSec: plan.durationSec,
        });

        const { result: asr, retries } = await twoPassTranscribeChunk({
          chunkWavPath: chunkPath,
          fullAudioPath: audioPath,
          chunksDir,
          chunkIndex: idx,
          chunkStartSec: plan.startSec,
          chunkEndSec: plan.endSec,
          language,
          glossary,
          previousTail,
          videoTitle: row.sourceTitle || row.originalFilename || row.sourceUrl,
          chunkCount: progress.chunkCount,
        });
        allRetries.push(...retries);

        if (!asr.text) throw new Error('EMPTY_TRANSCRIPT');

        chunkState.status = 'completed';
        chunkState.rawText = asr.text;
        chunkState.text = asr.text;
        chunkState.segments =
          asr.segments.length > 0
            ? asr.segments
            : [{ start: 0, end: plan.durationSec, text: asr.text }];
        chunkState.charCount = asr.text.length;
        chunkState.error = null;
        previousTail = asr.text.slice(-400);

        if (asr.language) {
          await prisma.videoTranscription.update({
            where: { id: row.id },
            data: { detectedLanguage: asr.language },
          });
        }
      } catch (chunkErr) {
        if ((chunkErr as { code?: string })?.code === 'CANCELLED') throw chunkErr;
        chunkState.status = 'failed';
        chunkState.error =
          chunkErr instanceof Error ? chunkErr.message.slice(0, 500) : 'CHUNK_FAILED';
        progress.processedDurationSeconds = sumCompletedChunkCoverage(progress.chunks);
        progress.chunksCompleted = progress.chunks.filter((c) => c.status === 'completed').length;
        await prisma.videoTranscription.update({
          where: { id: row.id },
          data: {
            status: VideoTranscriptionStatus.FAILED,
            stage: VideoTranscriptionStage.FAILED,
            errorCode: 'CHUNK_FAILED',
            errorMessage: `Chunk ${idx}: ${chunkState.error}`,
            chunkProgress: progress as unknown as Prisma.InputJsonValue,
            chunksCompleted: progress.chunksCompleted,
            processedDurationSeconds: progress.processedDurationSeconds,
          },
        });
        logProgress('chunk-failed', row.id, progress);
        throw Object.assign(new Error(chunkState.error), { code: 'CHUNK_FAILED' });
      }

      progress.processedDurationSeconds = sumCompletedChunkCoverage(progress.chunks);
      progress.chunksCompleted = progress.chunks.filter((c) => c.status === 'completed').length;
      await prisma.videoTranscription.update({
        where: { id: row.id },
        data: {
          chunkProgress: progress as unknown as Prisma.InputJsonValue,
          chunksCompleted: progress.chunksCompleted,
          processedDurationSeconds: progress.processedDurationSeconds,
        },
      });
      console.log(
        `[video-transcription] chunk ${idx}/${progress.chunkCount - 1} ok` +
          ` ${plan.startSec.toFixed(1)}-${plan.endSec.toFixed(1)}s` +
          ` chars=${chunkState.charCount} retries=${allRetries.length}`,
      );
    }

    const failed = progress.chunks.filter((c) => c.status === 'failed');
    const pending = progress.chunks.filter((c) => c.status !== 'completed');
    if (failed.length || pending.length) {
      throw Object.assign(
        new Error(`${pending.length} chunk chưa xong (${failed.length} lỗi). Dùng retry chunk.`),
        { code: 'CHUNKS_INCOMPLETE' },
      );
    }

    const processed = sumCompletedChunkCoverage(progress.chunks);
    progress.processedDurationSeconds = processed;
    if (
      !durationsMatch(
        audioDurFinal,
        processed,
        VIDEO_TRANSCRIPTION_LIMITS.durationMatchToleranceSec,
      )
    ) {
      throw Object.assign(
        new Error(
          `Coverage ${processed.toFixed(1)}s ≠ audio ${audioDurFinal.toFixed(1)}s — chưa COMPLETED`,
        ),
        { code: 'COVERAGE_MISMATCH' },
      );
    }

    await assertNotCancelled(row.id);
    await setStage(row.id, VideoTranscriptionStage.CLEANING);
    const merged = mergeChunkTranscripts(
      progress.chunks.map((c) => ({
        index: c.index,
        startSec: c.startSec,
        endSec: c.endSec,
        text: c.rawText || c.text,
        segments: c.segments,
      })),
    );
    const rawMerged = merged.rawMerged;
    if (!rawMerged.trim()) {
      throw Object.assign(new Error('Transcript ghép rỗng'), { code: 'EMPTY_MERGED' });
    }

    const corrected = correctVietnameseTranscript(rawMerged, { glossary });

    progress.firstTimestamp = merged.firstTimestamp;
    progress.lastTimestamp = merged.lastTimestamp;
    progress.resultCharCount = corrected.length;
    progress.processedDurationSeconds = processed;
    progress.chunksCompleted = progress.chunkCount;

    try {
      writeFileSync(join(workDir, 'merged-raw.txt'), rawMerged, 'utf8');
      writeFileSync(join(workDir, 'merged-corrected.txt'), corrected, 'utf8');
    } catch {
      /* ignore */
    }

    const tempExpiresAt = new Date(Date.now() + VIDEO_TRANSCRIPTION_TEMP_RETENTION_MS);
    await prisma.videoTranscription.update({
      where: { id: row.id },
      data: {
        status: VideoTranscriptionStatus.COMPLETED,
        stage: VideoTranscriptionStage.COMPLETED,
        rawTranscript: rawMerged,
        cleanedTranscript: corrected,
        correctedTranscript: corrected,
        audioDurationSeconds: audioDurFinal,
        processedDurationSeconds: processed,
        chunkCount: progress.chunkCount,
        chunksCompleted: progress.chunksCompleted,
        chunkProgress: progress as unknown as Prisma.InputJsonValue,
        qualityMeta: {
          sourceCodec: sourceMeta.codec,
          sourceBitRate: sourceMeta.bitRate,
          wavCodec: wavMeta.codec,
          wavSampleRate: wavMeta.sampleRate,
          language,
          glossary,
          platform: platform || 'upload',
          pass1Model: pass1Model(),
          pass2Model: pass2Model(),
          retries: allRetries,
          rawChars: rawMerged.length,
          correctedChars: corrected.length,
        } as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        tempExpiresAt,
      },
    });
    logProgress(
      'completed',
      row.id,
      progress,
      `retries=${allRetries.length} models=${pass1Model()}/${pass2Model()} tempUntil=${tempExpiresAt.toISOString()}`,
    );
    return { id: row.id, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code || 'PROCESS_FAILED')
        : 'PROCESS_FAILED';

    if (code === 'CANCELLED') {
      removeDir(workDir);
      await prisma.videoTranscription.update({
        where: { id: row.id },
        data: {
          status: VideoTranscriptionStatus.CANCELLED,
          stage: VideoTranscriptionStage.CANCELLED,
          errorCode: 'CANCELLED',
          errorMessage: 'Job đã bị hủy',
          tempDir: null,
          tempExpiresAt: null,
          completedAt: new Date(),
        },
      });
      return { id: row.id, ok: false };
    }

    const attempts = (job.attemptsMade ?? 0) + 1;
    const maxAttempts = job.opts.attempts ?? VIDEO_TRANSCRIPTION_LIMITS.maxAttempts;
    const keepTemp =
      code === 'CHUNK_FAILED' || code === 'CHUNKS_INCOMPLETE' || code === 'COVERAGE_MISMATCH';
    const finalFail = attempts >= maxAttempts && !keepTemp;

    await prisma.videoTranscription.update({
      where: { id: row.id },
      data: {
        status: VideoTranscriptionStatus.FAILED,
        stage: VideoTranscriptionStage.FAILED,
        errorCode: code.slice(0, 80),
        errorMessage: message.slice(0, 4000),
        ...(finalFail && !keepTemp
          ? {
              tempDir: null,
              tempExpiresAt: null,
              completedAt: new Date(),
            }
          : {}),
      },
    });

    if (finalFail && !keepTemp) {
      removeDir(workDir);
    }

    console.error(`[video-transcription] failed ${row.id}:`, message);
    if (!finalFail && !keepTemp) throw err instanceof Error ? err : new Error(message);
    return { id: row.id, ok: false };
  }
}
