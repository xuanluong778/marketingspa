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
