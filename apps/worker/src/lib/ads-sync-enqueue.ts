/**
 * Enqueue Google Ads sync jobs from worker (scheduled auto-sync scan).
 * Payload ID-only — credentials stay in DB, decrypted only in ads-sync processor.
 */
import { createHash } from 'crypto';
import { Queue } from 'bullmq';
import {
  AdsSyncJobStatus,
  AdsSyncPlatform,
  AdConnectionProvider,
  AdConnectionStatus,
  prisma,
} from '@marketingspa/database';
import { QUEUE_NAMES } from '@marketingspa/shared';
import { bullConnection, queuePrefix } from '../config';

export type AdsSyncEnqueuePayload = {
  organizationId: string;
  connectionId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  jobId: string;
  platform: 'GOOGLE';
};

function buildIdempotencyKey(parts: {
  organizationId: string;
  connectionId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  platform: string;
}): string {
  const raw = [
    parts.organizationId,
    parts.connectionId,
    parts.accountId,
    parts.dateFrom,
    parts.dateTo,
    parts.platform,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

function parseDateOnly(value: string): Date {
  return new Date(value + 'T00:00:00.000Z');
}

function defaultGoogleDateRange(lastSyncAt: Date | null | undefined): {
  dateFrom: string;
  dateTo: string;
  incremental: boolean;
} {
  const dateTo = new Date().toISOString().slice(0, 10);
  if (lastSyncAt) {
    return {
      dateFrom: lastSyncAt.toISOString().slice(0, 10),
      dateTo,
      incremental: true,
    };
  }
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo,
    incremental: false,
  };
}

export async function enqueueGoogleAdsSyncForAccount(opts: {
  organizationId: string;
  connectionId: string;
  userId: string;
  accountId: string;
  loginCustomerId?: string | null;
  lastSyncAt?: Date | null;
  dateFrom?: string;
  dateTo?: string;
  source?: 'manual' | 'auto';
}): Promise<{ queued: boolean; jobId?: string; reused?: boolean; reason?: string }> {
  const running = await prisma.adsSyncJob.findFirst({
    where: {
      organizationId: opts.organizationId,
      platform: AdsSyncPlatform.GOOGLE,
      accountId: opts.accountId,
      status: { in: [AdsSyncJobStatus.QUEUED, AdsSyncJobStatus.RUNNING] },
    },
  });
  if (running) {
    return { queued: false, reason: 'already_running', jobId: running.id };
  }

  const range =
    opts.dateFrom && opts.dateTo
      ? { dateFrom: opts.dateFrom, dateTo: opts.dateTo, incremental: false }
      : defaultGoogleDateRange(opts.lastSyncAt);

  const dateFrom = parseDateOnly(range.dateFrom);
  const dateTo = parseDateOnly(range.dateTo);
  if (dateFrom > dateTo) {
    return { queued: false, reason: 'invalid_date_range' };
  }

  const dateFromKey = range.dateFrom;
  const dateToKey = range.dateTo;
  const idempotencyKey = buildIdempotencyKey({
    organizationId: opts.organizationId,
    connectionId: opts.connectionId,
    accountId: opts.accountId,
    dateFrom: dateFromKey,
    dateTo: dateToKey,
    platform: 'GOOGLE',
  });

  const existingDone = await prisma.adsSyncJob.findUnique({ where: { idempotencyKey } });
  const reuseWindowMs = 60 * 60 * 1000;
  if (
    existingDone?.status === AdsSyncJobStatus.SUCCEEDED &&
    existingDone.finishedAt &&
    Date.now() - existingDone.finishedAt.getTime() < reuseWindowMs
  ) {
    return { queued: false, reused: true, jobId: existingDone.id, reason: 'idempotent_reuse' };
  }

  const maxAttempts = Number(process.env.ADS_SYNC_MAX_ATTEMPTS ?? 5);
  const loginCustomerId = opts.loginCustomerId ?? null;

  let job;
  if (existingDone && existingDone.status !== AdsSyncJobStatus.RUNNING) {
    job = await prisma.adsSyncJob.update({
      where: { id: existingDone.id },
      data: {
        status: AdsSyncJobStatus.QUEUED,
        progressPercent: 0,
        progressMessage: opts.source === 'auto' ? 'Auto-sync Google Ads' : 'Đang xếp hàng Google Ads',
        campaignsSynced: 0,
        attemptCount: 0,
        lastError: null,
        startedAt: null,
        finishedAt: null,
        requestedByUserId: opts.userId,
        metadata: {
          loginCustomerId,
          incremental: range.incremental,
          source: opts.source ?? 'auto',
        },
      },
    });
  } else {
    job = await prisma.adsSyncJob.create({
      data: {
        organizationId: opts.organizationId,
        connectionId: opts.connectionId,
        accountId: opts.accountId,
        platform: AdsSyncPlatform.GOOGLE,
        status: AdsSyncJobStatus.QUEUED,
        dateFrom,
        dateTo,
        idempotencyKey,
        maxAttempts,
        requestedByUserId: opts.userId,
        progressMessage: opts.source === 'auto' ? 'Auto-sync Google Ads' : 'Đang xếp hàng Google Ads',
        metadata: {
          loginCustomerId,
          incremental: range.incremental,
          source: opts.source ?? 'auto',
        },
      },
    });
  }

  const payload: AdsSyncEnqueuePayload = {
    organizationId: opts.organizationId,
    connectionId: opts.connectionId,
    accountId: opts.accountId,
    dateFrom: dateFromKey,
    dateTo: dateToKey,
    jobId: job.id,
    platform: 'GOOGLE',
  };

  const queue = new Queue(QUEUE_NAMES.ADS_SYNC, { connection: bullConnection, prefix: queuePrefix });
  try {
    await queue.add('ads-sync', payload, {
      jobId: `ads-sync-${job.id}`,
      attempts: maxAttempts,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    await prisma.adsSyncJob.update({
      where: { id: job.id },
      data: { bullJobId: `ads-sync-${job.id}` },
    });
  } finally {
    await queue.close();
  }

  return { queued: true, jobId: job.id };
}

export async function scanAndEnqueueGoogleAutoSync(): Promise<{
  scanned: number;
  queued: number;
  skipped: number;
  details: Array<{ organizationId: string; accountId: string; result: string }>;
}> {
  const connections = await prisma.adConnection.findMany({
    where: {
      provider: AdConnectionProvider.GOOGLE,
      status: AdConnectionStatus.CONNECTED,
      encryptedCredentials: { not: null },
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      externalAccountId: true,
      lastSyncAt: true,
      metadata: true,
    },
  });

  let queued = 0;
  let skipped = 0;
  const details: Array<{ organizationId: string; accountId: string; result: string }> = [];

  for (const conn of connections) {
    const linked = await prisma.adGoogleAdsAccount.findMany({
      where: { organizationId: conn.organizationId, connectionId: conn.id, isSelected: true },
      select: { customerId: true, loginCustomerId: true },
    });
    const meta = (conn.metadata ?? {}) as { loginCustomerId?: string | null };
    const targets =
      linked.length > 0
        ? linked.map((a) => ({
            accountId: a.customerId,
            loginCustomerId: a.loginCustomerId,
            lastSyncAt: conn.lastSyncAt,
          }))
        : conn.externalAccountId
          ? [
              {
                accountId: conn.externalAccountId,
                loginCustomerId: meta.loginCustomerId ?? null,
                lastSyncAt: conn.lastSyncAt,
              },
            ]
          : [];

    if (!targets.length) {
      details.push({
        organizationId: conn.organizationId,
        accountId: '-',
        result: 'no_selected_account',
      });
      skipped += 1;
      continue;
    }

    for (const t of targets) {
      const res = await enqueueGoogleAdsSyncForAccount({
        organizationId: conn.organizationId,
        connectionId: conn.id,
        userId: conn.userId,
        accountId: t.accountId,
        loginCustomerId: t.loginCustomerId,
        lastSyncAt: t.lastSyncAt,
        source: 'auto',
      });
      details.push({
        organizationId: conn.organizationId,
        accountId: t.accountId,
        result: res.queued ? 'queued' : (res.reason ?? 'skipped'),
      });
      if (res.queued) queued += 1;
      else skipped += 1;
    }
  }

  return { scanned: connections.length, queued, skipped, details };
}
