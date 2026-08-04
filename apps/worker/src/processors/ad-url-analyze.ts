import type { Job } from 'bullmq';
import Redis from 'ioredis';
import {
  AD_URL_ANALYZE_LIMITS,
  AD_URL_ANALYZE_STAGE_LABELS,
  adUrlAnalyzeQueuePayloadSchema,
  adUrlAnalyzeRedisKey,
  type AdUrlAnalyzeJobPublic,
  type AdUrlAnalyzeStage,
  type AdUrlAnalyzeStatus,
} from '@marketingspa/shared';
import {
  fetchPublicHtmlSafe,
  SsrfValidationError,
  FetchPublicError,
} from '@marketingspa/shared/dist/ssrf-fetch';
import { analyzeAdUrlContent } from '../lib/ad-url-analyze-ai';
import { bullConnection } from '../config';

function progressForStage(stage: AdUrlAnalyzeStage): number {
  switch (stage) {
    case 'queued':
      return 5;
    case 'validating':
      return 15;
    case 'fetching':
      return 35;
    case 'extracting':
      return 55;
    case 'analyzing':
      return 80;
    case 'completed':
      return 100;
    case 'failed':
    case 'cancelled':
      return 100;
    default:
      return 0;
  }
}

async function loadJob(redis: Redis, jobId: string): Promise<AdUrlAnalyzeJobPublic | null> {
  const raw = await redis.get(adUrlAnalyzeRedisKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdUrlAnalyzeJobPublic;
  } catch {
    return null;
  }
}

async function saveJob(redis: Redis, job: AdUrlAnalyzeJobPublic): Promise<void> {
  await redis.set(
    adUrlAnalyzeRedisKey(job.id),
    JSON.stringify(job),
    'EX',
    AD_URL_ANALYZE_LIMITS.redisTtlSeconds,
  );
}

async function patchJob(
  redis: Redis,
  jobId: string,
  patch: Partial<AdUrlAnalyzeJobPublic> & {
    status?: AdUrlAnalyzeStatus;
    stage?: AdUrlAnalyzeStage;
  },
): Promise<AdUrlAnalyzeJobPublic | null> {
  const current = await loadJob(redis, jobId);
  if (!current) return null;
  if (current.status === 'cancelled') return current;
  const stage = patch.stage ?? current.stage;
  const next: AdUrlAnalyzeJobPublic = {
    ...current,
    ...patch,
    stage,
    stageLabel: AD_URL_ANALYZE_STAGE_LABELS[stage],
    progressPercent: patch.progressPercent ?? progressForStage(stage),
    updatedAt: new Date().toISOString(),
  };
  await saveJob(redis, next);
  return next;
}

export async function processAdUrlAnalyze(job: Job): Promise<{ id: string; ok: boolean }> {
  const payload = adUrlAnalyzeQueuePayloadSchema.parse(job.data);
  const redis = new Redis(bullConnection);
  try {
    const existing = await loadJob(redis, payload.jobId);
    if (!existing) {
      throw new Error('Job state missing in Redis');
    }
    if (existing.status === 'cancelled') {
      return { id: payload.jobId, ok: false };
    }

    await patchJob(redis, payload.jobId, {
      status: 'processing',
      stage: 'validating',
    });

    await patchJob(redis, payload.jobId, { stage: 'fetching' });
    const fetched = await fetchPublicHtmlSafe(payload.sourceUrl, {
      timeoutMs: AD_URL_ANALYZE_LIMITS.fetchTimeoutMs,
      maxBytes: AD_URL_ANALYZE_LIMITS.maxHtmlBytes,
      maxRedirects: AD_URL_ANALYZE_LIMITS.maxRedirects,
    });

    const cancelled = await loadJob(redis, payload.jobId);
    if (cancelled?.status === 'cancelled') {
      return { id: payload.jobId, ok: false };
    }

    await patchJob(redis, payload.jobId, { stage: 'extracting' });
    await patchJob(redis, payload.jobId, { stage: 'analyzing' });

    const result = await analyzeAdUrlContent({
      adPostKind: payload.adPostKind,
      title: fetched.title,
      text: fetched.text,
      finalUrl: fetched.finalUrl,
      brandName: payload.brandName,
    });

    const after = await loadJob(redis, payload.jobId);
    if (after?.status === 'cancelled') {
      return { id: payload.jobId, ok: false };
    }

    await patchJob(redis, payload.jobId, {
      status: 'completed',
      stage: 'completed',
      result,
      completedAt: new Date().toISOString(),
      errorCode: null,
      errorMessage: null,
    });
    return { id: payload.jobId, ok: true };
  } catch (err) {
    const code =
      err instanceof SsrfValidationError
        ? err.code
        : err instanceof FetchPublicError
          ? err.code
          : 'ANALYZE_FAILED';
    const message =
      err instanceof Error ? err.message : 'Phân tích link thất bại.';
    await patchJob(redis, payload.jobId, {
      status: 'failed',
      stage: 'failed',
      errorCode: code,
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
    throw err;
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}
