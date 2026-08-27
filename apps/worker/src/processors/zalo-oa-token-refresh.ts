import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@marketingspa/shared';
import { bullConnection, queuePrefix } from '../config';
import {
  listZaloOaConnectionsDueForRefresh,
  refreshZaloOaConnection,
} from '../lib/zalo-token-refresh';

export type ZaloOaTokenRefreshJobData = {
  connectionId?: string;
  organizationId?: string;
};

/**
 * Cron scan: enqueue refresh từng OA sắp hết hạn (multi-tenant, 1 job / connection).
 * Job name: scan-due-zalo-oa-tokens | refresh-connection
 */
export async function processZaloOaTokenRefresh(job: Job<ZaloOaTokenRefreshJobData>) {
  if (job.name === 'refresh-connection' && job.data?.connectionId) {
    const result = await refreshZaloOaConnection(job.data.connectionId);
    return result;
  }

  // Default / scan-due-zalo-oa-tokens
  const due = await listZaloOaConnectionsDueForRefresh(40);
  if (!due.length) {
    return { scanned: 0, enqueued: 0 };
  }

  const queue = new Queue(QUEUE_NAMES.ZALO_OA_TOKEN_REFRESH, {
    connection: bullConnection,
    prefix: queuePrefix,
  });

  let enqueued = 0;
  try {
    for (const row of due) {
      await queue.add(
        'refresh-connection',
        {
          connectionId: row.id,
          organizationId: row.organizationId,
        },
        {
          jobId: `zalo-oa-refresh-${row.id}-${Math.floor(Date.now() / 600_000)}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
      enqueued += 1;
    }
  } finally {
    await queue.close();
  }

  console.log(
    `[zalo-refresh] scan due=${due.length} enqueued=${enqueued} (no tokens logged)`,
  );
  return { scanned: due.length, enqueued };
}
