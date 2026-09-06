/**
 * Enqueue 1 marketing email via BullMQ email-campaign-send-queue → Brevo (live).
 *   node scripts/with-root-env.cjs node scripts/test-brevo-queue-send.cjs
 */
const path = require('path');
const { createRequire } = require('module');
const reqWorker = createRequire(path.join(__dirname, '../apps/worker/dist/index.js'));
const { Queue } = reqWorker('bullmq');
const IORedis = reqWorker('ioredis');
const { prisma } = require('../packages/database/dist');
const { QUEUE_NAMES } = require('../packages/shared/dist');

function mask(e) {
  const [u, d] = String(e).split('@');
  return `${(u || '').slice(0, 2)}…@${d || ''}`;
}

async function main() {
  if ((process.env.EMAIL_PROVIDER_STUB || '') === '1') {
    console.log('FAIL | stub forbidden');
    process.exit(1);
  }
  const to = (process.env.BREVO_TEST_TO || process.env.PLATFORM_SUPER_ADMIN_EMAIL || '').trim();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org || !to) throw new Error('missing org/to');

  const contact = await prisma.emailContact.upsert({
    where: { organizationId_email: { organizationId: org.id, email: to.toLowerCase() } },
    create: { organizationId: org.id, email: to.toLowerCase(), name: 'Brevo E2E', status: 'SUBSCRIBED' },
    update: { status: 'SUBSCRIBED' },
  });

  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId: org.id,
      name: `Brevo Queue E2E ${Date.now()}`,
      subject: `[Brevo Queue] MarketingAutoAZ ${new Date().toISOString()}`,
      status: 'RUNNING',
      startedAt: new Date(),
      totalRecipients: 1,
    },
  });

  // Minimal inline template body via EmailTemplate or use campaign subject only —
  // worker requires template. Create one.
  const template = await prisma.emailTemplate.create({
    data: {
      organizationId: org.id,
      name: `Brevo E2E Tpl ${Date.now()}`,
      subject: campaign.subject,
      htmlBody: '<p>Queue→Brevo E2E from <strong>MarketingAutoAZ</strong> &lt;marketing@mail.marketingautoaz.com&gt;</p>',
      textBody: 'Queue Brevo E2E MarketingAutoAZ',
    },
  });
  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { templateId: template.id },
  });

  const recipient = await prisma.emailCampaignRecipient.create({
    data: {
      organizationId: org.id,
      campaignId: campaign.id,
      contactId: contact.id,
      email: contact.email,
      status: 'QUEUED',
      queuedAt: new Date(),
      idempotencyKey: `brevo-q-${Date.now()}`,
    },
  });

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const prefix = process.env.BULL_PREFIX || process.env.QUEUE_PREFIX || 'marketingspa';
  const queue = new Queue(QUEUE_NAMES.EMAIL_CAMPAIGN_SEND, { connection, prefix });
  const jobId = `email-send-${recipient.id}`;
  await queue.add(
    'send-email',
    { organizationId: org.id, campaignId: campaign.id, recipientId: recipient.id },
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  console.log(`PASS | QUEUE_ENQUEUE | jobId=${jobId} to=${mask(to)} campaign=${campaign.id.slice(0, 8)}…`);

  let row = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    row = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipient.id } });
    if (row && ['SENT', 'DELIVERED', 'FAILED', 'SKIPPED'].includes(row.status)) break;
  }

  console.log(
    `${row?.status === 'SENT' || row?.status === 'DELIVERED' ? 'PASS' : 'FAIL'} | QUEUE_SEND | status=${row?.status} provider=${row?.provider} midTail=${row?.providerMessageId ? '…' + row.providerMessageId.slice(-10) : 'none'} error=${row?.lastError || ''}`,
  );

  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(row?.provider === 'brevo' && row?.providerMessageId ? 0 : 1);
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
