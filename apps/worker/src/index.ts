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
  processAutomationMessage,
  processBackup,
  processCampaignSend,
  processDailyReport,
  processLeadAlertScan,
} from './processors/jobs';
import {
  processAutoPostPublish,
  processAutoPostScheduledScan,
} from './processors/auto-post';
import { processHrmAttendanceRebuild } from './processors/hrm-attendance';

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
    new Worker(QUEUE_NAMES.AUTO_POST_PUBLISH, (job) => {
      if (job.name === 'scan-due-scheduled') return processAutoPostScheduledScan();
      // Job chuẩn bị cho lịch đăng env-token Fanpage — chưa bật processor publish.
      if (job.name === 'meta-fanpage-publish') {
        console.warn(
          '[auto-post] meta-fanpage-publish nhận job nhưng chưa kích hoạt schedule processor — bỏ qua.',
        );
        return { skipped: true, reason: 'meta_fanpage_schedule_not_enabled' };
      }
      return processAutoPostPublish(job);
    }, opts),
    new Worker(QUEUE_NAMES.HRM_ATTENDANCE_REBUILD, (job) => processHrmAttendanceRebuild(job), {
      ...opts,
      concurrency: 2,
    }),
  );

  for (const w of workers) {
    attachWorkerHandlers(w, w.name);
  }

  console.log('🔄 Worker started — queues:');
  Object.values(QUEUE_NAMES).forEach((q) => console.log(`   • ${q}`));
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
