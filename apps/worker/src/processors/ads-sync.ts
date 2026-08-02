import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import {
  AdsSyncJobStatus,
  AdConnectionStatus,
  FacebookAdsConnectionStatus,
  FacebookAdsSyncStatus,
  prisma,
} from '@marketingspa/database';
import { WS_EVENTS } from '@marketingspa/shared';
import { decryptSecret } from '../lib/encryption';
import { publishRealtime } from '../lib/realtime';
import { acquireAdsSyncLock, releaseAdsSyncLock, renewAdsSyncLock } from '../lib/ads-sync-lock';
import {
  fetchMetaAdAccount,
  fetchMetaAds,
  fetchMetaAdSets,
  fetchMetaCampaignInsights,
  fetchMetaCampaigns,
  fetchMetaDailyCampaignInsights,
  MetaPermissionError,
  MetaRateLimitError,
  MetaTokenExpiredError,
} from '../lib/meta-graph-ads';
import { mapMetaInsight } from '../lib/ads-insight-mapper';
import {
  upsertDailyCampaignStats,
  upsertMetaAdAccount,
  upsertMetaAds,
  upsertMetaAdSets,
  upsertMetaCampaigns,
} from '../lib/ads-hierarchy-persist';
import {
  fetchGoogleAdGroups,
  fetchGoogleAds,
  fetchGoogleCampaigns,
  fetchGoogleCustomerDetail,
  fetchGoogleDailyMetrics,
  GoogleAdsPermissionError,
  GoogleAdsRateLimitError,
  GoogleAdsTokenExpiredError,
  refreshGoogleAccessToken,
} from '../lib/google-ads-api';
import {
  upsertGoogleAdAccount,
  upsertGoogleAdGroups,
  upsertGoogleAdsCreatives,
  upsertGoogleCampaigns,
  upsertGoogleDailyStats,
} from '../lib/google-ads-persist';

export type AdsSyncJobData = {
  organizationId: string;
  connectionId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  jobId: string;
  platform: 'META' | 'GOOGLE';
};

function assertSafePayload(data: AdsSyncJobData) {
  const json = JSON.stringify(data);
  if (/access[_-]?token|refresh[_-]?token|encryptedCredentials|bearer\s/i.test(json)) {
    throw new Error('Ads sync payload chứa credential — từ chối xử lý');
  }
}

function decodeMetaAccessToken(encrypted: string, metadata: unknown): string {
  const key = process.env.ENCRYPTION_KEY ?? '';
  const plain = decryptSecret(encrypted, key);
  const meta = (metadata ?? {}) as { legacyTokenCipher?: boolean };
  if (meta.legacyTokenCipher) return plain;
  try {
    const parsed = JSON.parse(plain) as { accessToken?: string };
    if (parsed.accessToken) return parsed.accessToken;
  } catch {
    /* plain token */
  }
  return plain;
}

function decodeGoogleRefreshToken(encrypted: string): string {
  const key = process.env.ENCRYPTION_KEY ?? '';
  const plain = decryptSecret(encrypted, key);
  try {
    const parsed = JSON.parse(plain) as { refreshToken?: string };
    if (parsed.refreshToken) return parsed.refreshToken;
  } catch {
    /* plain */
  }
  return plain;
}

async function updateProgress(
  redis: Redis,
  organizationId: string,
  jobId: string,
  patch: {
    progressPercent?: number;
    progressMessage?: string;
    status?: AdsSyncJobStatus;
    campaignsSynced?: number;
    lastError?: string | null;
  },
) {
  const row = await prisma.adsSyncJob.update({
    where: { id: jobId },
    data: {
      ...(patch.progressPercent !== undefined && { progressPercent: patch.progressPercent }),
      ...(patch.progressMessage !== undefined && { progressMessage: patch.progressMessage }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.campaignsSynced !== undefined && { campaignsSynced: patch.campaignsSynced }),
      ...(patch.lastError !== undefined && { lastError: patch.lastError }),
    },
  });

  await publishRealtime(redis, organizationId, WS_EVENTS.ADS_SYNC_PROGRESS, {
    jobId: row.id,
    status: row.status,
    progressPercent: row.progressPercent,
    progressMessage: row.progressMessage,
    campaignsSynced: row.campaignsSynced,
    accountId: row.accountId,
    platform: row.platform,
    lastError: row.lastError,
  });
}

/**
 * Worker Ads sync:
 * - Ownership check (org + connectionId)
 * - Decrypt token từ DB (không từ payload)
 * - Distributed lock platform+account
 * - Idempotent upsert snapshots
 * - Timeout / Retry-After / exponential BullMQ backoff
 */
export async function processAdsSync(job: Job<AdsSyncJobData>, redis: Redis) {
  const data = job.data;
  assertSafePayload(data);

  const { organizationId, connectionId, accountId, dateFrom, dateTo, jobId, platform } = data;
  if (!organizationId || !connectionId || !accountId || !jobId) {
    return { skipped: true, reason: 'missing_payload' };
  }

  const timeoutMs = Number(process.env.ADS_SYNC_TIMEOUT_MS ?? 300_000);
  const lockOwner = `worker:${process.pid}:${job.id}`;

  const syncJob = await prisma.adsSyncJob.findFirst({
    where: { id: jobId, organizationId },
  });
  if (!syncJob) return { skipped: true, reason: 'job_not_found' };
  if (syncJob.status === AdsSyncJobStatus.SUCCEEDED) {
    return { skipped: true, reason: 'already_succeeded' };
  }
  if (syncJob.status === AdsSyncJobStatus.CANCELLED) {
    return { skipped: true, reason: 'cancelled' };
  }

  // Ownership: connection thuộc đúng org + id
  const connection = await prisma.adConnection.findFirst({
    where: { id: connectionId, organizationId },
  });
  if (!connection?.encryptedCredentials) {
    await updateProgress(redis, organizationId, jobId, {
      status: AdsSyncJobStatus.FAILED,
      progressPercent: 100,
      progressMessage: 'Connection không hợp lệ',
      lastError: 'connection_not_found_or_no_credentials',
    });
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: syncJob.requestedByUserId,
        action: 'ADS_SYNC_FAILED',
        entityType: 'ADS_SYNC_JOB',
        entityId: jobId,
        metadata: { reason: 'ownership_or_credentials', accountId, platform },
      },
    });
    return { failed: true, reason: 'ownership' };
  }

  if (connection.externalAccountId && connection.externalAccountId !== accountId) {
    // Cho phép accountId từ FacebookAdsConnection selected — vẫn phải khớp org
    const meta = await prisma.facebookAdsConnection.findUnique({ where: { organizationId } });
    if (meta?.selectedAdAccountId !== accountId) {
      await updateProgress(redis, organizationId, jobId, {
        status: AdsSyncJobStatus.FAILED,
        lastError: 'account_mismatch',
        progressPercent: 100,
        progressMessage: 'Account không thuộc connection',
      });
      return { failed: true, reason: 'account_mismatch' };
    }
  }

  const lock = await acquireAdsSyncLock(redis, platform, accountId, lockOwner, timeoutMs + 60_000);
  if (!lock.ok) {
    // Để BullMQ retry với exponential backoff
    const err = new Error('Ads sync lock busy — tài khoản đang được đồng bộ');
    (err as Error & { delayMs?: number }).delayMs = 15_000;
    throw err;
  }

  const renewTimer = setInterval(
    () => {
      void renewAdsSyncLock(redis, lock.key, lockOwner, timeoutMs + 60_000);
    },
    Math.max(30_000, Math.floor(timeoutMs / 3)),
  );

  try {
    await prisma.adsSyncJob.update({
      where: { id: jobId },
      data: {
        status: AdsSyncJobStatus.RUNNING,
        startedAt: new Date(),
        attemptCount: { increment: 1 },
        lockedAt: new Date(),
        lockOwner,
        progressPercent: 5,
        progressMessage: 'Đã khóa account, bắt đầu đồng bộ',
        lastError: null,
      },
    });
    await publishRealtime(redis, organizationId, WS_EVENTS.ADS_SYNC_PROGRESS, {
      jobId,
      status: AdsSyncJobStatus.RUNNING,
      progressPercent: 5,
      progressMessage: 'Đã khóa account, bắt đầu đồng bộ',
      accountId,
      platform,
    });

    if (platform === 'GOOGLE') {
      const refreshToken = decodeGoogleRefreshToken(connection.encryptedCredentials);
      const loginCustomerId =
        syncJob.metadata && typeof syncJob.metadata === 'object'
          ? ((syncJob.metadata as { loginCustomerId?: string | null }).loginCustomerId ?? null)
          : null;
      const metaLogin =
        typeof (connection.metadata as { loginCustomerId?: string } | null)?.loginCustomerId ===
        'string'
          ? (connection.metadata as { loginCustomerId: string }).loginCustomerId
          : null;
      const loginId = loginCustomerId || metaLogin;

      await updateProgress(redis, organizationId, jobId, {
        progressPercent: 12,
        progressMessage: 'Làm mới access token Google',
      });

      const accessToken = await Promise.race([
        refreshGoogleAccessToken(refreshToken),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Ads sync timeout after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);

      const metaFetch = async <T>(fn: () => Promise<T>): Promise<T> =>
        Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Ads sync timeout after ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);

      await updateProgress(redis, organizationId, jobId, {
        progressPercent: 20,
        progressMessage: 'Đồng bộ Google hierarchy',
      });

      const customer = await metaFetch(() =>
        fetchGoogleCustomerDetail(accessToken, accountId, loginId, timeoutMs),
      );
      const campaigns = await metaFetch(() =>
        fetchGoogleCampaigns(accessToken, accountId, loginId, timeoutMs),
      );
      const adGroups = await metaFetch(() =>
        fetchGoogleAdGroups(accessToken, accountId, loginId, timeoutMs),
      );
      const ads = await metaFetch(() => fetchGoogleAds(accessToken, accountId, loginId, timeoutMs));
      const daily = await metaFetch(() =>
        fetchGoogleDailyMetrics(accessToken, accountId, loginId, dateFrom, dateTo, timeoutMs),
      );

      await updateProgress(redis, organizationId, jobId, {
        progressPercent: 55,
        progressMessage: `Upsert ${campaigns.length} campaigns / ${adGroups.length} ad groups`,
      });

      const googleTz = customer?.timeZone ?? 'UTC';
      const googleCurrency = customer?.currencyCode ?? 'USD';
      const adAccountRow = await upsertGoogleAdAccount(
        organizationId,
        accountId,
        customer?.descriptiveName ?? accountId,
        googleCurrency,
        googleTz,
      );
      const campaignIdMap = await upsertGoogleCampaigns(organizationId, adAccountRow.id, campaigns);
      const adSetIdMap = await upsertGoogleAdGroups(
        organizationId,
        adAccountRow.id,
        campaignIdMap,
        adGroups,
      );
      const adsSynced = await upsertGoogleAdsCreatives(
        organizationId,
        adAccountRow.id,
        campaignIdMap,
        adSetIdMap,
        ads,
      );
      const dailySynced = await upsertGoogleDailyStats(organizationId, campaignIdMap, daily, {
        currency: googleCurrency,
        timezone: googleTz,
      });

      await materializeGoogleInsights(
        organizationId,
        connection.userId,
        accountId,
        new Date(dateFrom + 'T00:00:00.000Z'),
        new Date(dateTo + 'T00:00:00.000Z'),
        campaignIdMap,
        daily,
        { currency: googleCurrency, timezone: googleTz },
      );

      const syncedAt = new Date();
      const syncMeta = {
        accountsSynced: 1,
        campaignsSynced: campaignIdMap.size,
        adSetsSynced: adSetIdMap.size,
        adsSynced,
        dailyRowsSynced: dailySynced,
      };

      await prisma.adConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: syncedAt,
          lastError: null,
          status: AdConnectionStatus.CONNECTED,
        },
      });

      await prisma.adsSyncJob.update({
        where: { id: jobId },
        data: {
          status: AdsSyncJobStatus.SUCCEEDED,
          progressPercent: 100,
          progressMessage: 'Hoàn tất Google Ads',
          campaignsSynced: campaignIdMap.size,
          finishedAt: syncedAt,
          lockedAt: null,
          lockOwner: null,
          lastError: null,
          metadata: {
            ...((syncJob.metadata as object) ?? {}),
            ...syncMeta,
          },
        },
      });

      await publishRealtime(redis, organizationId, WS_EVENTS.ADS_SYNC_PROGRESS, {
        jobId,
        status: AdsSyncJobStatus.SUCCEEDED,
        progressPercent: 100,
        progressMessage: 'Hoàn tất Google Ads',
        accountId,
        platform,
        ...syncMeta,
      });

      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: syncJob.requestedByUserId,
          action: 'ADS_SYNC_SUCCEEDED',
          entityType: 'ADS_SYNC_JOB',
          entityId: jobId,
          metadata: {
            platform,
            accountId,
            dateFrom,
            dateTo,
            ...syncMeta,
            attempt: job.attemptsMade + 1,
          },
        },
      });

      return { ok: true, ...syncMeta };
    }

    if (platform !== 'META') {
      await updateProgress(redis, organizationId, jobId, {
        status: AdsSyncJobStatus.FAILED,
        progressPercent: 100,
        progressMessage: 'Platform không hỗ trợ',
        lastError: 'unsupported_platform',
      });
      return { failed: true, reason: 'unsupported_platform' };
    }

    // Token chỉ giải mã ngay trước khi gọi Meta — không đưa vào payload / không log
    const accessToken = decodeMetaAccessToken(connection.encryptedCredentials, connection.metadata);

    const campaignFilterId =
      syncJob.metadata && typeof syncJob.metadata === 'object'
        ? ((syncJob.metadata as { campaignId?: string | null }).campaignId ?? undefined)
        : undefined;

    await updateProgress(redis, organizationId, jobId, {
      progressPercent: 12,
      progressMessage: 'Đồng bộ account + hierarchy từ Meta',
    });

    const metaFetch = async <T>(fn: () => Promise<T>): Promise<T> =>
      Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Ads sync timeout after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);

    const accountDetail = await metaFetch(() =>
      fetchMetaAdAccount(accessToken, accountId, timeoutMs),
    );
    const campaigns = await metaFetch(() =>
      fetchMetaCampaigns(accessToken, accountId, timeoutMs, campaignFilterId || undefined),
    );
    await updateProgress(redis, organizationId, jobId, {
      progressPercent: 22,
      progressMessage: `Account OK — ${campaigns.length} campaigns`,
    });

    const adsets = await metaFetch(() =>
      fetchMetaAdSets(accessToken, accountId, timeoutMs, campaignFilterId || undefined),
    );
    const ads = await metaFetch(() =>
      fetchMetaAds(accessToken, accountId, timeoutMs, campaignFilterId || undefined),
    );
    await updateProgress(redis, organizationId, jobId, {
      progressPercent: 32,
      progressMessage: `${adsets.length} ad sets, ${ads.length} ads`,
    });

    const rangeInsights = await metaFetch(() =>
      fetchMetaCampaignInsights({
        accessToken,
        adAccountId: accountId,
        dateFrom,
        dateTo,
        campaignId: campaignFilterId || undefined,
        timeoutMs,
      }),
    );
    const dailyInsights = await metaFetch(() =>
      fetchMetaDailyCampaignInsights({
        accessToken,
        adAccountId: accountId,
        dateFrom,
        dateTo,
        campaignId: campaignFilterId || undefined,
        timeoutMs,
      }),
    );

    await updateProgress(redis, organizationId, jobId, {
      progressPercent: 48,
      progressMessage: `Insights: ${rangeInsights.length} range, ${dailyInsights.length} daily — upsert`,
    });

    const dateFromD = new Date(dateFrom + 'T00:00:00.000Z');
    const dateToD = new Date(dateTo + 'T00:00:00.000Z');
    const syncedAt = new Date();

    // Ensure FB metadata connection exists for FK snapshots
    await prisma.facebookAdsConnection.upsert({
      where: { organizationId },
      create: {
        organizationId,
        connectedByUserId: connection.userId,
        selectedAdAccountId: accountId,
        status: FacebookAdsConnectionStatus.SYNCING,
      },
      update: {
        selectedAdAccountId: accountId,
        status: FacebookAdsConnectionStatus.SYNCING,
      },
    });

    const fbLog = await prisma.facebookAdsSyncLog.create({
      data: {
        organizationId,
        adAccountId: accountId,
        dateFrom: dateFromD,
        dateTo: dateToD,
        syncStartedAt: new Date(),
        status: FacebookAdsSyncStatus.RUNNING,
      },
    });

    // Persist hierarchy (org-scoped AdAccount / AdCampaign / AdSet / AdCreative)
    const metaCurrency = accountDetail.currency ?? 'USD';
    const metaTz = accountDetail.timezone_name ?? 'UTC';
    const adAccountRow = await upsertMetaAdAccount(organizationId, accountDetail);
    const campaignIdMap = await upsertMetaCampaigns(organizationId, adAccountRow.id, campaigns);
    const adSetIdMap = await upsertMetaAdSets(
      organizationId,
      adAccountRow.id,
      campaignIdMap,
      adsets,
    );
    const adsSynced = await upsertMetaAds(
      organizationId,
      adAccountRow.id,
      campaignIdMap,
      adSetIdMap,
      ads,
    );
    const dailySynced = await upsertDailyCampaignStats(
      organizationId,
      campaignIdMap,
      dailyInsights,
      { currency: metaCurrency, timezone: metaTz },
    );

    await updateProgress(redis, organizationId, jobId, {
      progressPercent: 65,
      progressMessage: 'Upsert campaign snapshots',
    });

    let synced = 0;
    for (const raw of rangeInsights) {
      const mapped = mapMetaInsight(raw);
      if (!mapped) continue;

      await prisma.facebookAdsCampaignSnapshot.upsert({
        where: {
          organizationId_campaignId_dateFrom_dateTo: {
            organizationId,
            campaignId: mapped.campaignId,
            dateFrom: dateFromD,
            dateTo: dateToD,
          },
        },
        create: {
          organizationId,
          adAccountId: accountId,
          campaignId: mapped.campaignId,
          campaignName: mapped.campaignName,
          objective: mapped.objective,
          campaignType: mapped.campaignType,
          dateFrom: dateFromD,
          dateTo: dateToD,
          spend: mapped.spend,
          impressions: mapped.impressions,
          reach: mapped.reach,
          frequency: mapped.frequency,
          cpm: mapped.cpm,
          cpc: mapped.cpc,
          ctr: mapped.ctr,
          clicks: mapped.clicks,
          results: mapped.results,
          costPerResult: mapped.costPerResult,
          purchaseRoas: mapped.purchaseRoas,
          resultRate: mapped.resultRate,
          syncedAt,
        },
        update: {
          campaignName: mapped.campaignName,
          objective: mapped.objective,
          campaignType: mapped.campaignType,
          spend: mapped.spend,
          impressions: mapped.impressions,
          reach: mapped.reach,
          frequency: mapped.frequency,
          cpm: mapped.cpm,
          cpc: mapped.cpc,
          ctr: mapped.ctr,
          clicks: mapped.clicks,
          results: mapped.results,
          costPerResult: mapped.costPerResult,
          purchaseRoas: mapped.purchaseRoas,
          resultRate: mapped.resultRate,
          syncedAt,
          adAccountId: accountId,
        },
      });
      synced += 1;
    }

    await updateProgress(redis, organizationId, jobId, {
      progressPercent: 80,
      progressMessage: 'Materialize AdInsight',
      campaignsSynced: synced,
    });

    await materializeInsights(organizationId, connection.userId, accountId, dateFromD, dateToD, {
      currency: metaCurrency,
      timezone: metaTz,
    });

    const syncMeta = {
      accountsSynced: 1,
      campaignsSynced: synced,
      campaignsHierarchy: campaigns.length,
      adSetsSynced: adSetIdMap.size,
      adsSynced,
      dailyRowsSynced: dailySynced,
    };

    await prisma.facebookAdsSyncLog.update({
      where: { id: fbLog.id },
      data: {
        status: FacebookAdsSyncStatus.SUCCESS,
        syncFinishedAt: new Date(),
        campaignsSynced: synced,
      },
    });

    await prisma.facebookAdsConnection.update({
      where: { organizationId },
      data: {
        status: FacebookAdsConnectionStatus.CONNECTED,
        lastSyncAt: syncedAt,
        lastSyncStatus: FacebookAdsSyncStatus.SUCCESS,
        lastSyncError: null,
      },
    });

    await prisma.adConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncAt: syncedAt,
        lastError: null,
        status: AdConnectionStatus.CONNECTED,
      },
    });

    await prisma.adsSyncJob.update({
      where: { id: jobId },
      data: {
        status: AdsSyncJobStatus.SUCCEEDED,
        progressPercent: 100,
        progressMessage: 'Hoàn tất',
        campaignsSynced: synced,
        finishedAt: new Date(),
        lockedAt: null,
        lockOwner: null,
        lastError: null,
        metadata: {
          ...((syncJob.metadata as object) ?? {}),
          ...syncMeta,
        },
      },
    });

    await publishRealtime(redis, organizationId, WS_EVENTS.ADS_SYNC_PROGRESS, {
      jobId,
      status: AdsSyncJobStatus.SUCCEEDED,
      progressPercent: 100,
      progressMessage: 'Hoàn tất',
      accountId,
      platform,
      ...syncMeta,
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: syncJob.requestedByUserId,
        action: 'ADS_SYNC_SUCCEEDED',
        entityType: 'ADS_SYNC_JOB',
        entityId: jobId,
        metadata: {
          platform,
          accountId,
          dateFrom,
          dateTo,
          ...syncMeta,
          attempt: job.attemptsMade + 1,
        },
      },
    });

    return { ok: true, ...syncMeta };
  } catch (err) {
    if (err instanceof MetaRateLimitError || err instanceof GoogleAdsRateLimitError) {
      const retryAfterMs = err.retryAfterMs;
      await updateProgress(redis, organizationId, jobId, {
        status: AdsSyncJobStatus.QUEUED,
        progressMessage: `Rate limit — retry after ${retryAfterMs}ms`,
        lastError: err.message,
      });
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: syncJob.requestedByUserId,
          action: 'ADS_SYNC_RETRY',
          entityType: 'ADS_SYNC_JOB',
          entityId: jobId,
          metadata: {
            platform,
            accountId,
            reason: 'retry_after',
            retryAfterMs,
            attempt: job.attemptsMade + 1,
          },
        },
      });
      await job.moveToDelayed(Date.now() + retryAfterMs);
      throw err;
    }

    if (err instanceof MetaTokenExpiredError || err instanceof GoogleAdsTokenExpiredError) {
      if (platform === 'GOOGLE') {
        await prisma.adConnection.updateMany({
          where: { id: connectionId, organizationId },
          data: { status: AdConnectionStatus.TOKEN_EXPIRED, lastError: err.message },
        });
      } else {
        await prisma.facebookAdsConnection.updateMany({
          where: { organizationId },
          data: {
            status: FacebookAdsConnectionStatus.TOKEN_EXPIRED,
            lastSyncStatus: FacebookAdsSyncStatus.FAILED,
            lastSyncError: err.message,
          },
        });
        await prisma.adConnection.updateMany({
          where: { id: connectionId, organizationId },
          data: { status: AdConnectionStatus.TOKEN_EXPIRED, lastError: err.message },
        });
      }
      await prisma.adsSyncJob.update({
        where: { id: jobId },
        data: {
          status: AdsSyncJobStatus.FAILED,
          progressPercent: 100,
          progressMessage: 'Token hết hạn — cần kết nối lại',
          lastError: err.message,
          finishedAt: new Date(),
          lockedAt: null,
          lockOwner: null,
        },
      });
      await publishRealtime(redis, organizationId, WS_EVENTS.ADS_SYNC_PROGRESS, {
        jobId,
        status: AdsSyncJobStatus.FAILED,
        progressPercent: 100,
        progressMessage: 'Token hết hạn — cần kết nối lại',
        accountId,
        platform,
        lastError: err.message,
      });
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: syncJob.requestedByUserId,
          action: 'ADS_SYNC_FAILED',
          entityType: 'ADS_SYNC_JOB',
          entityId: jobId,
          metadata: { platform, accountId, reason: 'token_expired', error: err.message },
        },
      });
      return { failed: true, reason: 'token_expired' };
    }

    if (err instanceof MetaPermissionError || err instanceof GoogleAdsPermissionError) {
      if (platform === 'GOOGLE') {
        await prisma.adConnection.updateMany({
          where: { id: connectionId, organizationId },
          data: {
            status: AdConnectionStatus.INSUFFICIENT_PERMISSIONS,
            lastError: err.message,
          },
        });
      } else {
        await prisma.facebookAdsConnection.updateMany({
          where: { organizationId },
          data: {
            status: FacebookAdsConnectionStatus.NO_AD_ACCOUNT_ACCESS,
            lastSyncStatus: FacebookAdsSyncStatus.FAILED,
            lastSyncError: err.message,
          },
        });
        await prisma.adConnection.updateMany({
          where: { id: connectionId, organizationId },
          data: {
            status: AdConnectionStatus.INSUFFICIENT_PERMISSIONS,
            lastError: err.message,
          },
        });
      }
      await prisma.adsSyncJob.update({
        where: { id: jobId },
        data: {
          status: AdsSyncJobStatus.FAILED,
          progressPercent: 100,
          progressMessage: 'Thiếu quyền Ads',
          lastError: err.message,
          finishedAt: new Date(),
          lockedAt: null,
          lockOwner: null,
        },
      });
      await publishRealtime(redis, organizationId, WS_EVENTS.ADS_SYNC_PROGRESS, {
        jobId,
        status: AdsSyncJobStatus.FAILED,
        progressPercent: 100,
        progressMessage: 'Thiếu quyền Ads',
        accountId,
        platform,
        lastError: err.message,
      });
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: syncJob.requestedByUserId,
          action: 'ADS_SYNC_FAILED',
          entityType: 'ADS_SYNC_JOB',
          entityId: jobId,
          metadata: { platform, accountId, reason: 'permission', error: err.message },
        },
      });
      return { failed: true, reason: 'permission' };
    }

    const msg = err instanceof Error ? err.message : 'sync_failed';
    const attempts = job.attemptsMade + 1;
    const maxAttempts = syncJob.maxAttempts ?? 5;
    const terminal = attempts >= maxAttempts;
    const lockBusy = msg.includes('lock busy');

    if (!lockBusy) {
      await prisma.adsSyncJob.update({
        where: { id: jobId },
        data: {
          status: terminal ? AdsSyncJobStatus.FAILED : AdsSyncJobStatus.QUEUED,
          lastError: msg,
          progressMessage: terminal ? 'Thất bại' : 'Chờ retry (exponential backoff)',
          progressPercent: terminal ? 100 : syncJob.progressPercent,
          finishedAt: terminal ? new Date() : null,
          lockedAt: null,
          lockOwner: null,
        },
      });

      if (platform === 'META') {
        await prisma.facebookAdsConnection.updateMany({
          where: { organizationId },
          data: {
            lastSyncStatus: FacebookAdsSyncStatus.FAILED,
            lastSyncError: msg,
            status: FacebookAdsConnectionStatus.CONNECTED,
          },
        });
      } else {
        await prisma.adConnection.updateMany({
          where: { id: connectionId, organizationId },
          data: { lastError: msg },
        });
      }
      await publishRealtime(redis, organizationId, WS_EVENTS.ADS_SYNC_PROGRESS, {
        jobId,
        status: terminal ? AdsSyncJobStatus.FAILED : AdsSyncJobStatus.QUEUED,
        progressPercent: terminal ? 100 : syncJob.progressPercent,
        progressMessage: msg,
        accountId,
        platform,
        lastError: msg,
      });

      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: syncJob.requestedByUserId,
          action: terminal ? 'ADS_SYNC_FAILED' : 'ADS_SYNC_RETRY',
          entityType: 'ADS_SYNC_JOB',
          entityId: jobId,
          metadata: { platform, accountId, error: msg, attempt: attempts },
        },
      });
    }

    throw err instanceof Error ? err : new Error(msg);
  } finally {
    clearInterval(renewTimer);
    await releaseAdsSyncLock(redis, lock.key, lockOwner);
  }
}

async function materializeInsights(
  organizationId: string,
  userId: string,
  adAccountId: string,
  dateFrom: Date,
  dateTo: Date,
  opts: { currency: string; timezone: string },
) {
  const { normalizeAdsMetrics } = await import('@marketingspa/shared');
  const { decimalString } = await import('../lib/ads-metrics-normalize');
  const snapshots = await prisma.facebookAdsCampaignSnapshot.findMany({
    where: { organizationId, dateFrom, dateTo },
  });

  let account = await prisma.adPlatformAccount.findFirst({
    where: { organizationId, platform: 'META', externalId: adAccountId },
  });
  if (!account) {
    account = await prisma.adPlatformAccount.create({
      data: {
        userId,
        organizationId,
        platform: 'META',
        externalId: adAccountId,
        name: adAccountId,
        currency: opts.currency,
        timezone: opts.timezone,
      },
    });
  } else {
    account = await prisma.adPlatformAccount.update({
      where: { id: account.id },
      data: { currency: opts.currency, timezone: opts.timezone },
    });
  }

  const dateKey = dateFrom.toISOString().slice(0, 10);

  for (const snap of snapshots) {
    const spend = Number(snap.spend);
    const results = Number(snap.results);
    const conversionValue = snap.purchaseRoas ? spend * Number(snap.purchaseRoas) : 0;
    const normalized = normalizeAdsMetrics({
      impressions: snap.impressions,
      reach: snap.reach,
      clicks: snap.clicks,
      spend,
      conversions: results,
      conversionValue,
      currency: opts.currency,
      date: dateKey,
      conversionActions: [
        {
          type: snap.campaignType || 'meta.results',
          count: results,
          value: conversionValue || undefined,
        },
      ],
      recomputeRates: true,
    });
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          50 +
            ((normalized.conversionValue - normalized.spend) / Math.max(normalized.spend, 1)) * 20,
        ),
      ),
    );

    const campaign = await prisma.adManagerCampaign.upsert({
      where: {
        userId_platform_externalId: {
          userId,
          platform: 'META',
          externalId: snap.campaignId,
        },
      },
      create: {
        userId,
        organizationId,
        accountId: account.id,
        platform: 'META',
        externalId: snap.campaignId,
        name: snap.campaignName,
        status: 'ACTIVE',
        objective: snap.objective,
        lastSyncedAt: snap.syncedAt,
      },
      update: {
        name: snap.campaignName,
        organizationId,
        lastSyncedAt: snap.syncedAt,
      },
    });

    await prisma.adInsight.upsert({
      where: {
        userId_platform_externalCampaignId_dateFrom_dateTo: {
          userId,
          platform: 'META',
          externalCampaignId: snap.campaignId,
          dateFrom,
          dateTo,
        },
      },
      create: {
        userId,
        organizationId,
        campaignId: campaign.id,
        platform: 'META',
        externalCampaignId: snap.campaignId,
        campaignName: snap.campaignName,
        dateFrom,
        dateTo,
        date: dateFrom,
        spend: decimalString(normalized.spend) ?? '0',
        revenue: decimalString(normalized.conversionValue) ?? '0',
        conversionValue: decimalString(normalized.conversionValue) ?? '0',
        impressions: Math.trunc(normalized.impressions),
        clicks: Math.trunc(normalized.clicks),
        ctr: decimalString(normalized.ctr),
        cpc: decimalString(normalized.cpc),
        cpm: decimalString(normalized.cpm),
        reach: Math.trunc(normalized.reach),
        frequency: Number(snap.frequency),
        conversions: decimalString(normalized.conversions) ?? '0',
        leads: 0,
        cpa: decimalString(normalized.cpa),
        cpl: null,
        roas: decimalString(normalized.roas),
        currency: normalized.currency,
        timezone: opts.timezone,
        conversionActions: normalized.conversionActions,
        efficiencyScore: score,
        syncedAt: snap.syncedAt,
        rawMetrics: { source: 'ads-sync-worker' },
      },
      update: {
        organizationId,
        campaignId: campaign.id,
        campaignName: snap.campaignName,
        date: dateFrom,
        spend: decimalString(normalized.spend) ?? '0',
        revenue: decimalString(normalized.conversionValue) ?? '0',
        conversionValue: decimalString(normalized.conversionValue) ?? '0',
        impressions: Math.trunc(normalized.impressions),
        clicks: Math.trunc(normalized.clicks),
        ctr: decimalString(normalized.ctr),
        cpc: decimalString(normalized.cpc),
        cpm: decimalString(normalized.cpm),
        reach: Math.trunc(normalized.reach),
        conversions: decimalString(normalized.conversions) ?? '0',
        cpa: decimalString(normalized.cpa),
        roas: decimalString(normalized.roas),
        currency: normalized.currency,
        timezone: opts.timezone,
        conversionActions: normalized.conversionActions,
        efficiencyScore: score,
        syncedAt: snap.syncedAt,
      },
    });
  }
}

async function materializeGoogleInsights(
  organizationId: string,
  userId: string,
  customerId: string,
  dateFrom: Date,
  dateTo: Date,
  campaignIdByExternal: Map<string, string>,
  dailyRows: Record<string, unknown>[],
  opts: { currency: string; timezone: string },
) {
  const { normalizeAdsMetrics } = await import('@marketingspa/shared');
  const { decimalString } = await import('../lib/ads-metrics-normalize');

  const byCampaign = new Map<
    string,
    {
      name: string;
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      conversionValue: number;
    }
  >();
  for (const row of dailyRows) {
    const camp = row.campaign as { id?: string; name?: string };
    const metrics = row.metrics as {
      impressions?: string;
      clicks?: string;
      costMicros?: string;
      conversions?: number;
      conversionsValue?: number;
    };
    if (!camp?.id) continue;
    const id = String(camp.id);
    const cur = byCampaign.get(id) ?? {
      name: camp.name ?? id,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      conversionValue: 0,
    };
    cur.impressions += Number(metrics?.impressions ?? 0) || 0;
    cur.clicks += Number(metrics?.clicks ?? 0) || 0;
    cur.spend += (Number(metrics?.costMicros ?? 0) || 0) / 1_000_000;
    cur.conversions += Number(metrics?.conversions ?? 0) || 0;
    cur.conversionValue += Number(metrics?.conversionsValue ?? 0) || 0;
    byCampaign.set(id, cur);
  }

  let account = await prisma.adPlatformAccount.findFirst({
    where: { organizationId, platform: 'GOOGLE', externalId: customerId.replace(/-/g, '') },
  });
  if (!account) {
    account = await prisma.adPlatformAccount.create({
      data: {
        userId,
        organizationId,
        platform: 'GOOGLE',
        externalId: customerId.replace(/-/g, ''),
        name: customerId,
        currency: opts.currency,
        timezone: opts.timezone,
      },
    });
  } else {
    account = await prisma.adPlatformAccount.update({
      where: { id: account.id },
      data: { currency: opts.currency, timezone: opts.timezone },
    });
  }

  const syncedAt = new Date();
  const dateKey = dateFrom.toISOString().slice(0, 10);

  for (const [externalId, m] of byCampaign) {
    const normalized = normalizeAdsMetrics({
      impressions: m.impressions,
      reach: 0,
      clicks: m.clicks,
      spend: m.spend,
      conversions: m.conversions,
      conversionValue: m.conversionValue,
      currency: opts.currency,
      date: dateKey,
      conversionActions: [
        {
          type: 'google.conversions',
          count: m.conversions,
          value: m.conversionValue || undefined,
        },
      ],
      recomputeRates: true,
    });
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          50 +
            ((normalized.conversions * 10 - normalized.spend) / Math.max(normalized.spend, 1)) * 10,
        ),
      ),
    );

    const campaign = await prisma.adManagerCampaign.upsert({
      where: {
        userId_platform_externalId: {
          userId,
          platform: 'GOOGLE',
          externalId,
        },
      },
      create: {
        userId,
        organizationId,
        accountId: account.id,
        platform: 'GOOGLE',
        externalId,
        name: m.name,
        status: 'ACTIVE',
        lastSyncedAt: syncedAt,
      },
      update: {
        name: m.name,
        organizationId,
        lastSyncedAt: syncedAt,
      },
    });

    await prisma.adInsight.upsert({
      where: {
        userId_platform_externalCampaignId_dateFrom_dateTo: {
          userId,
          platform: 'GOOGLE',
          externalCampaignId: externalId,
          dateFrom,
          dateTo,
        },
      },
      create: {
        userId,
        organizationId,
        campaignId: campaign.id,
        platform: 'GOOGLE',
        externalCampaignId: externalId,
        campaignName: m.name,
        dateFrom,
        dateTo,
        date: dateFrom,
        spend: decimalString(normalized.spend) ?? '0',
        revenue: decimalString(normalized.conversionValue) ?? '0',
        conversionValue: decimalString(normalized.conversionValue) ?? '0',
        impressions: Math.trunc(normalized.impressions),
        clicks: Math.trunc(normalized.clicks),
        ctr: decimalString(normalized.ctr),
        cpc: decimalString(normalized.cpc),
        cpm: decimalString(normalized.cpm),
        reach: Math.trunc(normalized.reach),
        frequency: 0,
        conversions: decimalString(normalized.conversions) ?? '0',
        leads: 0,
        cpa: decimalString(normalized.cpa),
        cpl: null,
        roas: decimalString(normalized.roas),
        currency: normalized.currency,
        timezone: opts.timezone,
        conversionActions: normalized.conversionActions,
        efficiencyScore: score,
        syncedAt,
        rawMetrics: {
          source: 'ads-sync-worker-google',
          hierarchyId: campaignIdByExternal.get(externalId),
        },
      },
      update: {
        organizationId,
        campaignId: campaign.id,
        campaignName: m.name,
        date: dateFrom,
        spend: decimalString(normalized.spend) ?? '0',
        revenue: decimalString(normalized.conversionValue) ?? '0',
        conversionValue: decimalString(normalized.conversionValue) ?? '0',
        impressions: Math.trunc(normalized.impressions),
        clicks: Math.trunc(normalized.clicks),
        ctr: decimalString(normalized.ctr),
        cpc: decimalString(normalized.cpc),
        cpm: decimalString(normalized.cpm),
        conversions: decimalString(normalized.conversions) ?? '0',
        cpa: decimalString(normalized.cpa),
        roas: decimalString(normalized.roas),
        currency: normalized.currency,
        timezone: opts.timezone,
        conversionActions: normalized.conversionActions,
        efficiencyScore: score,
        syncedAt,
      },
    });
  }
}
