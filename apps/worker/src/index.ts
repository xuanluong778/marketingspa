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
import { processAutoPostPublish, processAutoPostScheduledScan } from './processors/auto-post';
import { processHrmAttendanceRebuild } from './processors/hrm-attendance';
import { processAdsSync } from './processors/ads-sync';
import { processAdsAction } from './processors/ads-action';
import { processVideoTranscription } from './processors/video-transcription';
import { processAffiliateHoldRelease } from './processors/affiliate-hold';

initSentry();

// Fail-fast: Auto Post / Meta tokens yêu cầu AES-256-GCM qua ENCRYPTION_KEY
{
  const key = (process.env.ENCRYPTION_KEY || '').trim();
  if (!key || key.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY chưa cấu hình hoặc quá ngắn (min 16 chars) — worker không được giải mã token plaintext.',
    );
  }
  if (/^(change_me|changeme|test|todo|replace)/i.test(key)) {
    throw new Error('ENCRYPTION_KEY vẫn là giá trị placeholder — đặt khóa production thật.');
  }
}

const redis = createRedisPublisher();
const workers: Worker[] = [];
const WORKER_HEARTBEAT_KEY = 'marketingspa:worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;
const VIDEO_TRANSCRIPTION_LOCK_MS = 3 * 60 * 60 * 1000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function attachWorkerHandlers(worker: Worker, name: string) {
  worker.on('completed', (job) => {
    console.log(`[worker:${name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker:${name}] Job ${job?.id} failed:`, err.message);
    captureException(err, name);
  });
}

async function writeHeartbeat() {
  try {
    await redis.set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 180);
  } catch (err) {
    console.error('[worker] heartbeat failed:', err instanceof Error ? err.message : err);
  }
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
        // Job chuẩn bị cho lịch đăng env-token Fanpage — chưa bật processor publish.
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
    // Meta/Google Ads sync — hierarchy + insights → DB (backoff on Queue job options)
    new Worker(QUEUE_NAMES.ADS_SYNC, (job) => processAdsSync(job, redis), {
      ...opts,
      concurrency: 1,
    }),
    // AdsActionRequest — pause/resume/budget (gated by ADS_ACTIONS_LIVE)
    new Worker(QUEUE_NAMES.ADS_ACTION, (job) => processAdsAction(job, redis), {
      ...opts,
      concurrency: 1,
    }),
    new Worker(QUEUE_NAMES.VIDEO_TRANSCRIPTION, (job) => processVideoTranscription(job), {
      ...opts,
      concurrency: 1,
      lockDuration: VIDEO_TRANSCRIPTION_LOCK_MS,
      stalledInterval: 60_000,
      maxStalledCount: 3,
    }),
    new Worker(QUEUE_NAMES.AFFILIATE_HOLD, (job) => processAffiliateHoldRelease(job), {
      ...opts,
      concurrency: 2,
    }),
  );

  for (const w of workers) {
    attachWorkerHandlers(w, w.name);
  }

  await writeHeartbeat();
  heartbeatTimer = setInterval(() => {
    void writeHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  console.log('🔄 Worker started — queues:');
  Object.values(QUEUE_NAMES).forEach((q) => console.log(`   • ${q}`));
  console.log(`   • heartbeat → ${WORKER_HEARTBEAT_KEY}`);
}

start().catch((err) => {
  captureException(err, 'worker-start');
  process.exit(1);
});

async function shutdown() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  await Promise.all(workers.map((w) => w.close()));
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
