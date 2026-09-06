import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import {
  AdConnectionProvider,
  GoogleAdsCampaignDeployStatus,
  GoogleAdsCampaignDraftStatus,
  prisma,
  Prisma,
} from '@marketingspa/database';
import {
  createDryRunMutatePort,
  executeGoogleAdsCampaignPlan,
  googleAdsStructuredDraftSchema,
  isAdsActionsLive,
  type CreatedGoogleAdsResources,
} from '@marketingspa/shared';
import { decryptSecret } from '../lib/encryption';
import { createLiveGoogleAdsMutatePort, refreshGoogleAccessToken } from '../lib/google-ads-api';

export async function processAdsCampaignDeploy(job: Job, redis?: Redis) {
  const organizationId = String(job.data?.organizationId ?? '');
  const deploymentId = String(job.data?.deploymentId ?? '');
  if (!organizationId || !deploymentId) throw new Error('ads-campaign-deploy payload thiếu ID');

  const deployment = await prisma.googleAdsCampaignDeployment.findFirst({
    where: { id: deploymentId, organizationId },
    include: { draft: true },
  });
  if (!deployment) throw new Error(`Deployment ${deploymentId} không tồn tại`);
  if (deployment.status === GoogleAdsCampaignDeployStatus.SUCCEEDED) {
    return { skipped: true, reason: 'already_succeeded' };
  }

  const lockKey = `ads-campaign-deploy:${organizationId}:${deploymentId}`;
  if (redis) {
    const ok = await redis.set(lockKey, `worker:${job.id}`, 'EX', 180, 'NX');
    if (ok !== 'OK') return { skipped: true, reason: 'lock_held' };
  }

  const live =
    isAdsActionsLive() &&
    String(process.env.ADS_ACTIONS_PROVIDER_WRITE ?? 'false').toLowerCase() === 'true';

  await prisma.googleAdsCampaignDeployment.update({
    where: { id: deploymentId },
    data: {
      status: GoogleAdsCampaignDeployStatus.DEPLOYING,
      attemptCount: { increment: 1 },
      startedAt: deployment.startedAt ?? new Date(),
      providerWriteEnabled: live,
    },
  });
  await prisma.googleAdsCampaignDraft.update({
    where: { id: deployment.draftId },
    data: { status: GoogleAdsCampaignDraftStatus.DEPLOYING },
  });

  const structured = googleAdsStructuredDraftSchema.parse(deployment.draft.structuredDraft);
  let mutate = createDryRunMutatePort(deployment.draft.customerId);

  if (live) {
    const conn = await prisma.adConnection.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: AdConnectionProvider.GOOGLE },
      },
    });
    if (!conn?.encryptedCredentials) throw new Error('Không có Google OAuth credentials');
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY chưa cấu hình');
    const plain = JSON.parse(decryptSecret(conn.encryptedCredentials, key)) as {
      refreshToken?: string;
    };
    if (!plain.refreshToken) throw new Error('Thiếu Google refresh token');
    const accessToken = await refreshGoogleAccessToken(plain.refreshToken);
    mutate = createLiveGoogleAdsMutatePort({
      accessToken,
      customerId: deployment.draft.customerId,
      loginCustomerId: deployment.draft.loginCustomerId,
    });
  }

  const existing = (deployment.createdResources ?? {}) as CreatedGoogleAdsResources;
  const result = await executeGoogleAdsCampaignPlan({
    draft: structured,
    resources: existing,
    mutate,
    onProgress: async (resources, step) => {
      await prisma.googleAdsCampaignDeployment.update({
        where: { id: deploymentId },
        data: {
          createdResources: resources as Prisma.InputJsonValue,
          lastCompletedStep: step,
        },
      });
    },
  });

  const nextStatus = result.completed
    ? GoogleAdsCampaignDeployStatus.SUCCEEDED
    : result.resources.budgetResourceName
      ? GoogleAdsCampaignDeployStatus.PARTIAL
      : GoogleAdsCampaignDeployStatus.FAILED;

  await prisma.googleAdsCampaignDeployment.update({
    where: { id: deploymentId },
    data: {
      status: nextStatus,
      createdResources: result.resources as Prisma.InputJsonValue,
      lastCompletedStep: result.completed ? 'ads' : result.failedStep ?? deployment.lastCompletedStep,
      lastError: result.error ?? null,
      completedAt: result.completed ? new Date() : null,
    },
  });

  await prisma.googleAdsCampaignDraft.update({
    where: { id: deployment.draftId },
    data: {
      status: result.completed
        ? GoogleAdsCampaignDraftStatus.DEPLOYED
        : nextStatus === GoogleAdsCampaignDeployStatus.PARTIAL
          ? GoogleAdsCampaignDraftStatus.PARTIAL
          : GoogleAdsCampaignDraftStatus.FAILED,
      lastError: result.error ?? null,
    },
  });

  if (!result.completed) {
    throw new Error(result.error ?? `deploy_failed_step_${result.failedStep}`);
  }
  return { ok: true, live, resources: result.resources };
}
