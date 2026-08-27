import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });
config({ path: path.resolve(__dirname, '../../.env') });
config();
process.env.PROCESS_ROLE = process.env.PROCESS_ROLE || 'worker';
if (!process.env.DATABASE_CONNECTION_LIMIT) {
  process.env.DATABASE_CONNECTION_LIMIT = '8';
}
import { Worker } from 'bullmq';
import { hostname } from 'os';
import { prisma } from '@marketingspa/database';
import { AD_URL_ANALYZE_LIMITS, BULLMQ_JOB_RETENTION, QUEUE_NAMES } from '@marketingspa/shared';
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
import { processAdUrlAnalyze } from './processors/ad-url-analyze';
import { processAffiliateHoldRelease } from './processors/affiliate-hold';
import { processMessagingWebhook } from './processors/messaging-webhook';
import { processMessagingCampaignPlan } from './processors/messaging-campaign-plan';
import { processMessagingCampaignDispatch } from './processors/messaging-campaign-dispatch';
import { processMessagingSend } from './processors/messaging-send';
import { processOfflineConversion } from './processors/offline-conversion';
import { processMarketingAutopilotOutcomeScan } from './processors/marketing-autopilot-outcome-scan';
import { processMarketingAutopilotMission } from './processors/marketing-autopilot-mission';
import { processEmailCampaignPlan } from './processors/email-campaign-plan';
import { processEmailCampaignSend, processEmailNotOpenFollowup } from './processors/email-campaign-send';
import { processEmailCampaignScheduledScan } from './processors/email-campaign-scheduled-scan';
import { processZaloOaTokenRefresh } from './processors/zalo-oa-token-refresh';

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
/** Distributed singleton — second worker process must exit. */
const WORKER_SINGLETON_KEY = 'marketingspa:worker:singleton';
const SINGLETON_TTL_SEC = 90;
const HEARTBEAT_INTERVAL_MS = 30_000;
const VIDEO_TRANSCRIPTION_LOCK_MS = 3 * 60 * 60 * 1000;
const ADS_SYNC_LOCK_MS = Math.max(
  60_000,
  Number(process.env.ADS_SYNC_TIMEOUT_MS || 300_000) + 60_000,
);
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const singletonToken = `${process.pid}:${hostname()}:${Date.now()}`;
let singletonHeld = false;

function attachWorkerHandlers(worker: Worker, name: string) {
  worker.on('completed', (job) => {
    console.log(`[worker:${name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    const msg = String(err?.message || err).replace(
      /postgres(?:ql)?:\/\/[^@\s'"]+@/gi,
      'postgresql://***@',
    );
    console.error(`[worker:${name}] Job ${job?.id} failed:`, msg);
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

function singletonEnabled(): boolean {
  const v = (process.env.WORKER_SINGLETON_GUARD || '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

async function acquireWorkerSingleton(): Promise<void> {
  if (!singletonEnabled()) {
    console.warn('[worker] WORKER_SINGLETON_GUARD disabled — dual workers allowed (dev only)');
    return;
  }
  // Retry briefly so PM2 restart can take over after old process releases lock.
  const attempts = 8;
  for (let i = 0; i < attempts; i++) {
    const ok = await redis.set(
      WORKER_SINGLETON_KEY,
      singletonToken,
      'EX',
      SINGLETON_TTL_SEC,
      'NX',
    );
    if (ok === 'OK') {
      singletonHeld = true;
      console.log(`[worker] singleton lock acquired → ${WORKER_SINGLETON_KEY}`);
      return;
    }
    const holder = await redis.get(WORKER_SINGLETON_KEY);
    console.warn(
      `[worker] singleton busy (attempt ${i + 1}/${attempts}) holder=${holder ? 'set' : 'empty'}`,
    );
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.error(
    '[worker] FATAL: another worker already holds marketingspa:worker:singleton — exiting',
  );
  process.exit(1);
}

async function renewWorkerSingleton(): Promise<void> {
  if (!singletonHeld || !singletonEnabled()) return;
  try {
    const cur = await redis.get(WORKER_SINGLETON_KEY);
    if (cur !== singletonToken) {
      console.error('[worker] singleton lock lost — exiting');
      process.exit(1);
    }
    await redis.expire(WORKER_SINGLETON_KEY, SINGLETON_TTL_SEC);
  } catch (err) {
    console.error('[worker] singleton renew failed:', err instanceof Error ? err.message : err);
  }
}

async function releaseWorkerSingleton(): Promise<void> {
  if (!singletonHeld) return;
  try {
    const cur = await redis.get(WORKER_SINGLETON_KEY);
    if (cur === singletonToken) {
      await redis.del(WORKER_SINGLETON_KEY);
    }
  } catch {
    /* ignore */
  }
  singletonHeld = false;
}

async function start() {
  await acquireWorkerSingleton();
  await registerRepeatableJobs();

  const opts = {
    connection: bullConnection,
    prefix: queuePrefix,
    concurrency: 2,
    removeOnComplete: { ...BULLMQ_JOB_RETENTION.complete },
    removeOnFail: { ...BULLMQ_JOB_RETENTION.fail },
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
      lockDuration: ADS_SYNC_LOCK_MS,
      stalledInterval: 60_000,
      maxStalledCount: 2,
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
    new Worker(QUEUE_NAMES.AD_URL_ANALYZE, (job) => processAdUrlAnalyze(job), {
      ...opts,
      concurrency: 2,
      lockDuration: AD_URL_ANALYZE_LIMITS.jobTimeoutMs + 30_000,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }),
    new Worker(QUEUE_NAMES.AFFILIATE_HOLD, (job) => processAffiliateHoldRelease(job), {
      ...opts,
      concurrency: 2,
    }),
    // Messaging — webhook ingest + campaign plan/dispatch/send
    new Worker(
      QUEUE_NAMES.MESSAGING_WEBHOOK,
      (job) => processMessagingWebhook(job, redis),
      { ...opts, concurrency: 2 },
    ),
    new Worker(
      QUEUE_NAMES.MESSAGING_CAMPAIGN_PLAN,
      (job) => processMessagingCampaignPlan(job, redis),
      { ...opts, concurrency: 1 },
    ),
    new Worker(
      QUEUE_NAMES.MESSAGING_CAMPAIGN_DISPATCH,
      (job) => processMessagingCampaignDispatch(job, redis),
      { ...opts, concurrency: 1 },
    ),
    new Worker(QUEUE_NAMES.MESSAGING_SEND, (job) => processMessagingSend(job, redis), {
      ...opts,
      concurrency: 3,
    }),
    new Worker(QUEUE_NAMES.OFFLINE_CONVERSION, (job) => processOfflineConversion(job), {
      ...opts,
      concurrency: 1,
    }),
    new Worker(
      QUEUE_NAMES.MARKETING_AUTOPILOT_OUTCOME_EVAL,
      (job) => processMarketingAutopilotOutcomeScan(job),
      { ...opts, concurrency: 1 },
    ),
    new Worker(
      QUEUE_NAMES.MARKETING_AUTOPILOT_MISSION,
      (job) => processMarketingAutopilotMission(job),
      { ...opts, concurrency: 2 },
    ),
    new Worker(
      QUEUE_NAMES.EMAIL_CAMPAIGN_PLAN,
      async (job) => {
        if (job.name === 'scan-due-scheduled-email-campaigns') {
          return processEmailCampaignScheduledScan(job);
        }
        return processEmailCampaignPlan(job);
      },
      { ...opts, concurrency: 1 },
    ),
    new Worker(
      QUEUE_NAMES.EMAIL_CAMPAIGN_SEND,
      (job) => {
        if (job.name === 'email-not-open-followup') {
          return processEmailNotOpenFollowup(job, redis);
        }
        return processEmailCampaignSend(job, redis);
      },
      {
        ...opts,
        concurrency: 3,
        limiter: {
          max: Math.max(1, Number(process.env.EMAIL_SEND_RATE_PER_SEC || 14) || 14),
          duration: 1000,
        },
      },
    ),
    // Zalo OA auto-refresh access token (scan + per-connection refresh)
    new Worker(
      QUEUE_NAMES.ZALO_OA_TOKEN_REFRESH,
      (job) => processZaloOaTokenRefresh(job),
      { ...opts, concurrency: 2 },
    ),
  );

  for (const w of workers) {
    attachWorkerHandlers(w, w.name);
  }

  await writeHeartbeat();
  heartbeatTimer = setInterval(() => {
    void writeHeartbeat();
    void renewWorkerSingleton();
  }, HEARTBEAT_INTERVAL_MS);

  console.log('🔄 Worker started — queues:');
  Object.values(QUEUE_NAMES).forEach((q) => console.log(`   • ${q}`));
  console.log(`   • heartbeat → ${WORKER_HEARTBEAT_KEY}`);
  console.log(`   • singleton → ${WORKER_SINGLETON_KEY} (guard=${singletonEnabled() ? 'on' : 'off'})`);
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
  await releaseWorkerSingleton();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
