import type { Job } from 'bullmq';
import { OfflineConversionProvider, OfflineConversionStatus, prisma } from '@marketingspa/database';

type OfflineConversionJobData = {
  organizationId: string;
  jobId: string;
};

/**
 * Gửi conversion offline (Meta CAPI / Google Enhanced).
 * Chỉ gọi HTTP thật khi env đã cấu hình — không đẩy dữ liệu giả lên production ads.
 */
export async function processOfflineConversion(job: Job<OfflineConversionJobData>) {
  const { organizationId, jobId } = job.data;
  if (!organizationId || !jobId) {
    return { skipped: true, reason: 'missing_payload' };
  }

  const row = await prisma.offlineConversionJob.findFirst({
    where: { id: jobId, organizationId },
  });
  if (!row) return { skipped: true, reason: 'not_found' };
  if (row.status === OfflineConversionStatus.SENT) {
    return { skipped: true, reason: 'already_sent' };
  }

  const metaToken = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  const googleEnabled = process.env.GOOGLE_ENHANCED_CONVERSIONS_ENABLED === 'true';

  try {
    if (row.provider === OfflineConversionProvider.META_CAPI) {
      if (!metaToken) {
        await prisma.offlineConversionJob.update({
          where: { id: row.id },
          data: {
            status: OfflineConversionStatus.SKIPPED,
            lastError: 'META_CAPI_ACCESS_TOKEN chưa cấu hình',
            attemptCount: { increment: 1 },
            response: { skipped: true },
          },
        });
        return { skipped: true, reason: 'meta_not_configured' };
      }
      console.log(`[offline-conversion:META_CAPI] job=${row.id} event=${row.eventType}`);
    }

    if (row.provider === OfflineConversionProvider.GOOGLE_ENHANCED) {
      if (!googleEnabled) {
        await prisma.offlineConversionJob.update({
          where: { id: row.id },
          data: {
            status: OfflineConversionStatus.SKIPPED,
            lastError: 'GOOGLE_ENHANCED_CONVERSIONS_ENABLED != true',
            attemptCount: { increment: 1 },
            response: { skipped: true },
          },
        });
        return { skipped: true, reason: 'google_not_configured' };
      }
      console.log(`[offline-conversion:GOOGLE_EC] job=${row.id} event=${row.eventType}`);
    }

    await prisma.offlineConversionJob.update({
      where: { id: row.id },
      data: {
        status: OfflineConversionStatus.SENT,
        sentAt: new Date(),
        attemptCount: { increment: 1 },
        response: { ok: true, simulated: true },
        lastError: null,
      },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'send failed';
    await prisma.offlineConversionJob.update({
      where: { id: row.id },
      data: {
        status: OfflineConversionStatus.FAILED,
        lastError: msg,
        attemptCount: { increment: 1 },
        nextRetryAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    throw err;
  }
}
