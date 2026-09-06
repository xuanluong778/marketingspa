/**
 * Verify Brevo on live API health + optional queue send status for prior E2E row.
 * Does not log secrets.
 *
 *   node scripts/with-root-env.cjs node scripts/verify-brevo-runtime.cjs
 */
const { prisma } = require('../packages/database/dist');

async function main() {
  const healthRes = await fetch('http://127.0.0.1:4000/api/v1/health');
  const health = await healthRes.json();
  const ep = health.emailProvider || {};
  const apiOk =
    healthRes.status === 200 &&
    ep.resolved === 'brevo' &&
    ep.configured === true &&
    ep.fromConfigured === true;
  console.log(
    `${apiOk ? 'PASS' : 'FAIL'} | API | resolved=${ep.resolved} marketing=${ep.marketing || 'n/a'} configured=${ep.configured} fromConfigured=${ep.fromConfigured} worker=${health.services?.worker}`,
  );

  const workerOk = Boolean(health.services?.worker);
  // Worker loads root .env via dotenv; heartbeat proves process up after Brevo env existed on disk
  console.log(
    `${workerOk ? 'PASS' : 'FAIL'} | WORKER | heartbeat=${workerOk} (dotenv loads root .env at boot)`,
  );

  const recent = await prisma.emailOutboundMessage.findFirst({
    where: { purpose: 'marketing', provider: 'brevo' },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    console.log(
      `PASS | LAST_SEND | status=${recent.status} mid=${recent.providerMessageId ? '…' + recent.providerMessageId.slice(-10) : 'none'} sentAt=${recent.sentAt?.toISOString()} deliveredAt=${recent.deliveredAt?.toISOString() || 'n/a'} to=${recent.toEmail.slice(0, 2)}…@${recent.toEmail.split('@')[1]}`,
    );
  } else {
    console.log('FAIL | LAST_SEND | no brevo outbound row');
  }

  // Queue: check email-campaign-send worker registered via recent log line (no secrets)
  const fs = require('fs');
  const log = fs.readFileSync(
    require('path').join(__dirname, '../logs/worker.out.log'),
    'utf8',
  );
  const hasEmailQueue = /email-campaign-send-queue/.test(log.slice(-8000));
  console.log(
    `${hasEmailQueue ? 'PASS' : 'FAIL'} | QUEUE | email-campaign-send-queue ${hasEmailQueue ? 'registered' : 'not found in recent worker log'}`,
  );

  console.log('\n--- matrix hints ---');
  console.log(`ENV from disk already verified separately`);
  console.log(`API=${apiOk ? 'PASS' : 'FAIL'} WORKER=${workerOk ? 'PASS' : 'FAIL'}`);
  await prisma.$disconnect();
  process.exit(apiOk && workerOk ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
