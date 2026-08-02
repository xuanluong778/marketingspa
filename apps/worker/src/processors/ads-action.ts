import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import {
  AdsActionRequestStatus,
  AdsActionType,
  AdAutomationAction,
  AdCampaignStatus,
  AdConnectionProvider,
  prisma,
} from '@marketingspa/database';
import { adsActionQueuePayloadSchema, isAdsActionsLive } from '@marketingspa/shared';
import { decryptSecret } from '../lib/encryption';
import {
  MetaPermissionError,
  MetaRateLimitError,
  MetaTokenExpiredError,
  metaListCampaignAdSets,
  metaUpdateCampaignStatus,
  metaUpdateDailyBudget,
} from '../lib/meta-graph-ads';

/**
 * Worker AdsActionRequest.
 * - Payload chỉ ID (organizationId, actionRequestId)
 * - ADS_ACTIONS_LIVE=false → SKIPPED_DISABLED
 * - ADS_ACTIONS_PROVIDER_WRITE=true → gọi Meta Graph (pause/budget)
 * - Redis lock + ownership; không retry permission/token
 */
export async function processAdsAction(job: Job, redis?: Redis) {
  const payload = adsActionQueuePayloadSchema.parse(job.data);
  const { organizationId, actionRequestId } = payload;

  const row = await prisma.adsActionRequest.findFirst({
    where: { id: actionRequestId, organizationId },
  });
  if (!row) {
    throw new Error(`AdsActionRequest ${actionRequestId} không tồn tại`);
  }

  if (
    row.status !== AdsActionRequestStatus.QUEUED &&
    row.status !== AdsActionRequestStatus.APPROVED &&
    row.status !== AdsActionRequestStatus.FAILED
  ) {
    return { skipped: true, reason: `status_${row.status}` };
  }

  if (!isAdsActionsLive()) {
    await prisma.adsActionRequest.update({
      where: { id: actionRequestId },
      data: {
        status: AdsActionRequestStatus.SKIPPED_DISABLED,
        lastError: 'ADS_ACTIONS_LIVE=false — worker từ chối write',
        result: { skipped: true, reason: 'feature_flag_disabled', providerWrite: false },
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: row.approvedByUserId ?? row.requestedByUserId,
        action: 'ADS_ACTION_SKIPPED_DISABLED',
        entityType: 'AdsActionRequest',
        entityId: actionRequestId,
        metadata: { jobId: job.id },
      },
    });
    return { skipped: true, reason: 'feature_flag_disabled' };
  }

  const lockKey = `ads-action-lock:${organizationId}:${actionRequestId}`;
  const lockOwner = `worker:${process.pid}:${job.id}`;
  if (redis) {
    const ok = await redis.set(lockKey, lockOwner, 'EX', 120, 'NX');
    if (ok !== 'OK') {
      return { skipped: true, reason: 'lock_held' };
    }
  }

  await prisma.adsActionRequest.update({
    where: { id: actionRequestId },
    data: {
      status: AdsActionRequestStatus.EXECUTING,
      attemptCount: { increment: 1 },
      executedAt: new Date(),
    },
  });

  const providerWrite =
    row.providerWriteEnabled &&
    String(process.env.ADS_ACTIONS_PROVIDER_WRITE ?? 'false').toLowerCase() === 'true';

  try {
    let providerResult: Record<string, unknown> | null = null;
    if (providerWrite) {
      providerResult = await applyMetaProviderWrite(row);
    }

    const applyResult = await applyLocalOnly(row);

    await prisma.adsActionRequest.update({
      where: { id: actionRequestId },
      data: { status: AdsActionRequestStatus.VERIFYING },
    });

    const verified = await verifyLocal(row, applyResult);
    const resultJson = JSON.parse(
      JSON.stringify({
        providerWrite,
        providerResult,
        localApply: applyResult,
        verify: verified,
      }),
    ) as object;

    await prisma.adsActionRequest.update({
      where: { id: actionRequestId },
      data: {
        status: verified.ok ? AdsActionRequestStatus.SUCCEEDED : AdsActionRequestStatus.FAILED,
        verifiedAt: new Date(),
        result: resultJson,
        lastError: verified.ok ? null : verified.message,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: row.approvedByUserId ?? row.requestedByUserId,
        action: verified.ok ? 'ADS_ACTION_SUCCEEDED' : 'ADS_ACTION_VERIFY_FAILED',
        entityType: 'AdsActionRequest',
        entityId: actionRequestId,
        metadata: JSON.parse(
          JSON.stringify({
            actionType: row.actionType,
            providerWrite,
            providerResult,
            verify: verified,
            requestedByUserId: row.requestedByUserId,
            approvedByUserId: row.approvedByUserId,
          }),
        ),
      },
    });

    if (row.campaignId) {
      await prisma.adAutomationLog.create({
        data: {
          userId: row.approvedByUserId ?? row.requestedByUserId,
          organizationId,
          campaignId: row.campaignId,
          platform: row.platform,
          action:
            row.actionType === AdsActionType.PAUSE_CAMPAIGN
              ? AdAutomationAction.PAUSE
              : row.actionType === AdsActionType.ENABLE_CAMPAIGN
                ? AdAutomationAction.ENABLE
                : AdAutomationAction.RECOMMEND,
          autoMode: row.source === 'RULE' || row.source === 'AI',
          reason: `AdsActionRequest ${actionRequestId} (providerWrite=${providerWrite})`,
          snapshot: JSON.parse(
            JSON.stringify({
              before: row.beforeState,
              after: row.afterState,
              providerResult,
              verify: verified,
            }),
          ),
        },
      });
    }

    return { ok: verified.ok, providerWrite, verify: verified, providerResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent =
      err instanceof MetaPermissionError || err instanceof MetaTokenExpiredError;

    await prisma.adsActionRequest.update({
      where: { id: actionRequestId },
      data: {
        status: AdsActionRequestStatus.FAILED,
        lastError: message,
        result: {
          error: message,
          providerWrite,
          permanent,
          rateLimited: err instanceof MetaRateLimitError,
        },
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: row.approvedByUserId ?? row.requestedByUserId,
        action: 'ADS_ACTION_FAILED',
        entityType: 'AdsActionRequest',
        entityId: actionRequestId,
        metadata: { error: message, permanent },
      },
    });

    // Không retry permission/token — tránh request storm
    if (permanent) {
      return { ok: false, permanent: true, error: message };
    }
    if (err instanceof MetaRateLimitError) {
      // BullMQ sẽ backoff; không spam thêm call trong job
      throw err;
    }
    throw err;
  } finally {
    if (redis) {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end`;
      await redis.eval(script, 1, lockKey, lockOwner);
    }
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
    /* plain */
  }
  return plain;
}

async function applyMetaProviderWrite(row: {
  organizationId: string;
  campaignId: string | null;
  actionType: AdsActionType;
  afterState: unknown;
  proposedBudget: { toNumber?: () => number } | null;
}): Promise<Record<string, unknown>> {
  if (!row.campaignId) {
    return { applied: false, reason: 'no_campaign' };
  }

  const campaign = await prisma.adManagerCampaign.findFirst({
    where: { id: row.campaignId, organizationId: row.organizationId },
  });
  if (!campaign || campaign.platform !== 'META') {
    return { applied: false, reason: 'not_meta_campaign' };
  }

  const conn = await prisma.adConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId: row.organizationId,
        provider: AdConnectionProvider.META,
      },
    },
  });
  if (!conn?.encryptedCredentials) {
    throw new MetaTokenExpiredError('Chưa có Meta AdConnection token');
  }

  const token = decodeMetaAccessToken(conn.encryptedCredentials, conn.metadata);
  const timeoutMs = Number(process.env.ADS_ACTION_TIMEOUT_MS ?? 60_000);
  const after = (row.afterState ?? {}) as { status?: string; budget?: number | null };

  if (
    row.actionType === AdsActionType.PAUSE_CAMPAIGN ||
    row.actionType === AdsActionType.ENABLE_CAMPAIGN ||
    row.actionType === AdsActionType.UPDATE_STATUS
  ) {
    const active =
      after.status === 'ACTIVE' ||
      (row.actionType === AdsActionType.ENABLE_CAMPAIGN && after.status !== 'PAUSED');
    // Không tự ENABLE nếu action là pause-only path mis-set
    if (row.actionType === AdsActionType.ENABLE_CAMPAIGN && !active) {
      return { applied: false, reason: 'enable_blocked' };
    }
    await metaUpdateCampaignStatus(token, campaign.externalId, active, timeoutMs);
    return {
      applied: true,
      field: 'status',
      value: active ? 'ACTIVE' : 'PAUSED',
      externalCampaignId: campaign.externalId,
      metaApi: 'POST /{campaign-id} status',
    };
  }

  if (row.actionType === AdsActionType.ADJUST_BUDGET) {
    const budgetMajor = after.budget ?? (row.proposedBudget?.toNumber?.() ?? null);
    if (budgetMajor == null || budgetMajor <= 0) {
      return { applied: false, reason: 'no_budget' };
    }
    const adSets = await metaListCampaignAdSets(token, campaign.externalId, timeoutMs);
    const adSetId = adSets[0]?.id;
    if (!adSetId) {
      throw new Error('Campaign không có Ad Set để cập nhật ngân sách');
    }
    // Heuristic: nếu budget lớn (>1000) coi như VND (offset 0), ngược lại USD cents
    const dailyBudgetMinor =
      budgetMajor >= 1000 ? Math.round(budgetMajor) : Math.round(budgetMajor * 100);
    await metaUpdateDailyBudget(token, adSetId, dailyBudgetMinor, timeoutMs);
    return {
      applied: true,
      field: 'budget',
      value: budgetMajor,
      adSetId,
      externalCampaignId: campaign.externalId,
      metaApi: 'POST /{adset-id} daily_budget',
    };
  }

  return { applied: false, reason: 'unsupported_action' };
}

async function applyLocalOnly(row: {
  id: string;
  organizationId: string;
  campaignId: string | null;
  actionType: AdsActionType;
  afterState: unknown;
  proposedBudget: { toNumber?: () => number } | null;
}) {
  if (!row.campaignId) {
    return { applied: false, reason: 'no_campaign' };
  }

  const campaign = await prisma.adManagerCampaign.findFirst({
    where: { id: row.campaignId, organizationId: row.organizationId },
  });
  if (!campaign) {
    return { applied: false, reason: 'campaign_not_found' };
  }

  const after = (row.afterState ?? {}) as { status?: string; budget?: number | null };

  if (
    row.actionType === AdsActionType.PAUSE_CAMPAIGN ||
    row.actionType === AdsActionType.ENABLE_CAMPAIGN ||
    row.actionType === AdsActionType.UPDATE_STATUS
  ) {
    const nextStatus =
      after.status === 'PAUSED'
        ? AdCampaignStatus.PAUSED
        : after.status === 'ACTIVE'
          ? AdCampaignStatus.ACTIVE
          : row.actionType === AdsActionType.PAUSE_CAMPAIGN
            ? AdCampaignStatus.PAUSED
            : AdCampaignStatus.ACTIVE;

    await prisma.adManagerCampaign.update({
      where: { id: campaign.id },
      data: { status: nextStatus },
    });
    return { applied: true, field: 'status', value: nextStatus };
  }

  if (row.actionType === AdsActionType.ADJUST_BUDGET) {
    const budget = after.budget ?? null;
    await prisma.adManagerCampaign.update({
      where: { id: campaign.id },
      data: { budget: budget ?? undefined },
    });
    return { applied: true, field: 'budget', value: budget };
  }

  return { applied: false, reason: 'noop_local', note: 'provider_write_not_enabled' };
}

async function verifyLocal(
  row: {
    campaignId: string | null;
    organizationId: string;
    afterState: unknown;
    actionType: AdsActionType;
  },
  applyResult: { applied: boolean; field?: string; value?: unknown; reason?: string },
) {
  if (!row.campaignId) {
    return { ok: true, message: 'no campaign to verify' };
  }
  const campaign = await prisma.adManagerCampaign.findFirst({
    where: { id: row.campaignId, organizationId: row.organizationId },
  });
  if (!campaign) {
    return { ok: false, message: 'campaign missing after apply' };
  }

  const after = (row.afterState ?? {}) as { status?: string; budget?: number | null };

  if (
    row.actionType === AdsActionType.PAUSE_CAMPAIGN ||
    row.actionType === AdsActionType.ENABLE_CAMPAIGN ||
    row.actionType === AdsActionType.UPDATE_STATUS
  ) {
    const expected =
      after.status ?? (row.actionType === AdsActionType.PAUSE_CAMPAIGN ? 'PAUSED' : 'ACTIVE');
    if (applyResult.applied && campaign.status !== expected) {
      return {
        ok: false,
        message: `status expected ${expected}, got ${campaign.status}`,
      };
    }
  }

  return {
    ok: true,
    message: 'local verify ok',
    currentStatus: campaign.status,
    applyResult,
  };
}
