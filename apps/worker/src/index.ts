import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });
config({ path: path.resolve(__dirname, '../../.env') });
config();
import { Worker } from 'bullmq';
import { prisma } from '@marketingspa/database';
import { QUEUE_NAMES } from '@marketingspa/shared';
import { bullConnection, createRedisPublisher, queuePrefix } from './config';
import { initSentry, captureException } from './sentry';
import { registerRepeatableJobs } from './schedulers/register-jobs';
import {
  processAppointmentReminders,
  processBackup,
  processCampaignSend,
  processDailyReport,
  processLeadAlertScan,
} from './processors/jobs';
import { processAutomationMessage } from './processors/automation-run';
import { processAutoPostPublish, processAutoPostScheduledScan } from './processors/auto-post';
import { processHrmAttendanceRebuild } from './processors/hrm-attendance';
import { processOfflineConversion } from './processors/offline-conversion';
import { processMessagingWebhook } from './processors/messaging-webhook';
import { processMessagingCampaignPlan } from './processors/messaging-campaign-plan';
import { processMessagingCampaignDispatch } from './processors/messaging-campaign-dispatch';
import { processMessagingSend } from './processors/messaging-send';
import { processMessagingCampaignScheduledScan } from './processors/messaging-campaign-scheduled-scan';
import { processAdsSync } from './processors/ads-sync';
import { processAdsAction } from './processors/ads-action';
import { processAffiliateHoldRelease } from './processors/affiliate-hold';

initSentry();

const redis = createRedisPublisher();
const workers: Worker[] = [];

function attachWorkerHandlers(worker: Worker, name: string) {
  worker.on('completed', (job) => {
    console.log(`[worker:${name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker:${name}] Job ${job?.id} failed:`, err.message);
    captureException(err, name);
  });
}

async function start() {
  await registerRepeatableJobs();

  const opts = {
    connection: bullConnection,
    prefix: queuePrefix,
    concurrency: 2,
  };

  workers.push(
    new Worker(QUEUE_NAMES.CAMPAIGN_SEND, (job) => processCampaignSend(job), opts),
    new Worker(QUEUE_NAMES.LEAD_ALERT, () => processLeadAlertScan(redis), {
      ...opts,
      concurrency: 1,
    }),
    new Worker(QUEUE_NAMES.APPOINTMENT_REMINDER, () => processAppointmentReminders(redis), {
      ...opts,
      concurrency: 1,
    }),
    new Worker(QUEUE_NAMES.AUTOMATION_MESSAGE, (job) => processAutomationMessage(job), opts),
    new Worker(QUEUE_NAMES.DAILY_REPORT, () => processDailyReport(redis), {
      ...opts,
      concurrency: 1,
    }),
    new Worker(QUEUE_NAMES.BACKUP, () => processBackup(), { ...opts, concurrency: 1 }),
    new Worker(
      QUEUE_NAMES.AUTO_POST_PUBLISH,
      async (job) => {
        if (job.name === 'scan-due-scheduled') return processAutoPostScheduledScan(redis);
        if (job.name === 'meta-fanpage-publish') {
          console.warn(
            '[auto-post] meta-fanpage-publish nhận job nhưng chưa kích hoạt schedule processor — bỏ qua.',
          );
          return { skipped: true, reason: 'meta_fanpage_schedule_not_enabled' };
        }
        return processAutoPostPublish(job, redis);
      },
      opts,
    ),
    new Worker(QUEUE_NAMES.HRM_ATTENDANCE_REBUILD, (job) => processHrmAttendanceRebuild(job), {
      ...opts,
      concurrency: 2,
    }),
    new Worker(QUEUE_NAMES.OFFLINE_CONVERSION, (job) => processOfflineConversion(job), {
      ...opts,
      concurrency: 2,
    }),
    new Worker(QUEUE_NAMES.MESSAGING_WEBHOOK, (job) => processMessagingWebhook(job, redis), {
      ...opts,
      concurrency: 4,
    }),
    new Worker(
      QUEUE_NAMES.MESSAGING_CAMPAIGN_PLAN,
      async (job) => {
        if (job.name === 'scan-due-scheduled-campaigns') {
          return processMessagingCampaignScheduledScan(job);
        }
        return processMessagingCampaignPlan(job, redis);
      },
      {
        ...opts,
        concurrency: 2,
      },
    ),
    new Worker(
      QUEUE_NAMES.MESSAGING_CAMPAIGN_DISPATCH,
      (job) => processMessagingCampaignDispatch(job, redis),
      { ...opts, concurrency: 3 },
    ),
    new Worker(QUEUE_NAMES.MESSAGING_SEND, (job) => processMessagingSend(job, redis), {
      ...opts,
      concurrency: 5,
    }),
    new Worker(QUEUE_NAMES.ADS_SYNC, (job) => processAdsSync(job, redis), {
      ...opts,
      concurrency: 2,
      // Timeout cứng bổ sung ở processor (ADS_SYNC_TIMEOUT_MS); BullMQ lockDuration rộng hơn
      lockDuration: Number(process.env.ADS_SYNC_TIMEOUT_MS ?? 180_000) + 60_000,
    }),
    new Worker(QUEUE_NAMES.ADS_ACTION, (job) => processAdsAction(job, redis), {
      ...opts,
      concurrency: 2,
    }),
    new Worker(QUEUE_NAMES.AFFILIATE_HOLD, (job) => processAffiliateHoldRelease(job), {
      ...opts,
      concurrency: 2,
    }),
  );

  for (const w of workers) {
    attachWorkerHandlers(w, w.name);
  }

  console.log('🔄 Worker started — queues:');
  Object.values(QUEUE_NAMES).forEach((q) => console.log(`   • ${q}`));

  const heartbeat = async () => {
    try {
      await redis.set('marketingspa:worker:heartbeat', String(Date.now()), 'EX', 120);
    } catch {
      /* ignore */
    }
  };
  await heartbeat();
  setInterval(heartbeat, 30_000);
}

start().catch((err) => {
  captureException(err, 'worker-start');
  process.exit(1);
});

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
