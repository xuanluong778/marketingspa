/**
 * Brevo webhook E2E (live, no mock/poll of Brevo Events API for PASS).
 *
 * 1) Ensure Brevo transactional webhook → https://marketingautoaz.com/api/v1/webhooks/brevo
 * 2) QUEUE send 1 email to Gmail
 * 3) Wait until OUR webhook wrote DELIVERED (EmailEvent metadata.source=brevo_webhook
 *    or EmailWebhookEvent kind=delivered for messageId)
 *
 *   node scripts/with-root-env.cjs node scripts/test-brevo-webhook-e2e.cjs
 */
const path = require('path');
const { createRequire } = require('module');
const reqWorker = createRequire(path.join(__dirname, '../apps/worker/dist/index.js'));
const { Queue } = reqWorker('bullmq');
const IORedis = reqWorker('ioredis');
const { prisma } = require('../packages/database/dist');
const { QUEUE_NAMES } = require('../packages/shared/dist');

const PUBLIC_WEBHOOK =
  (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '') +
  '/api/v1/webhooks/brevo';

function mask(e) {
  const [u, d] = String(e).split('@');
  return `${(u || '').slice(0, 2)}…@${d || ''}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const rows = [];
function record(name, pass, evidence, err) {
  rows.push({ name, pass: Boolean(pass), evidence: String(evidence || ''), err: String(err || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${evidence}${err ? ' | ERR: ' + err : ''}`);
}

async function brevoApi(method, apiPath, body) {
  const key = (process.env.BREVO_API_KEY || '').trim();
  const res = await fetch(`https://api.brevo.com/v3${apiPath}`, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function ensureBrevoWebhook() {
  const secret = (process.env.BREVO_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('BREVO_WEBHOOK_SECRET missing');

  const events = [
    'sent',
    'delivered',
    'hardBounce',
    'softBounce',
    'blocked',
    'invalid',
    'spam',
    'unsubscribed',
    'error',
    'opened',
    'uniqueOpened',
    'click',
    'deferred',
  ];

  const list = await brevoApi('GET', '/webhooks?type=transactional&limit=50');
  const existing = Array.isArray(list.json?.webhooks)
    ? list.json.webhooks
    : Array.isArray(list.json)
      ? list.json
      : [];
  const hit = existing.find((w) => String(w.url || '') === PUBLIC_WEBHOOK);

  const payload = {
    url: PUBLIC_WEBHOOK,
    description: 'MarketingAutoAZ transactional webhook',
    events,
    type: 'transactional',
    headers: [{ key: 'x-maz-brevo-secret', value: secret }],
  };

  if (hit?.id) {
    const upd = await brevoApi('PUT', `/webhooks/${hit.id}`, payload);
    return { id: hit.id, http: upd.status, action: 'updated', url: PUBLIC_WEBHOOK };
  }
  const created = await brevoApi('POST', '/webhooks', payload);
  return {
    id: created.json?.id,
    http: created.status,
    action: 'created',
    url: PUBLIC_WEBHOOK,
    err: created.status >= 300 ? JSON.stringify(created.json).slice(0, 160) : '',
  };
}

async function probeLocalWebhook() {
  const secret = (process.env.BREVO_WEBHOOK_SECRET || '').trim();
  const res = await fetch('http://127.0.0.1:4000/api/v1/webhooks/brevo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-maz-brevo-secret': secret,
    },
    body: JSON.stringify({
      event: 'delivered',
      email: 'probe-not-a-real-send@example.com',
      'message-id': `<probe-${Date.now()}@test.local>`,
      ts_event: Math.floor(Date.now() / 1000),
      id: 0,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if ((process.env.EMAIL_PROVIDER_STUB || '') === '1') {
    record('stub_guard', false, 'stub forbidden', 'EMAIL_PROVIDER_STUB');
    await finish(1);
    return;
  }

  // Endpoint up
  const probe = await probeLocalWebhook();
  record(
    'webhook_endpoint',
    probe.status === 200 && probe.json?.ok === true,
    `http=${probe.status} ok=${probe.json?.ok}`,
    probe.status === 401 ? 'unauthorized_secret' : '',
  );

  const wh = await ensureBrevoWebhook();
  record(
    'brevo_webhook_registered',
    wh.http < 300 && Boolean(wh.id || wh.action === 'updated'),
    `action=${wh.action} http=${wh.http} url=${wh.url} id=${wh.id || 'n/a'}`,
    wh.err || '',
  );

  const to = (process.env.BREVO_TEST_TO || process.env.PLATFORM_SUPER_ADMIN_EMAIL || '').trim();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org || !to) {
    record('fixtures', false, 'missing org/to', '');
    await finish(1);
    return;
  }
  record('fixtures', true, `org=${org.name} to=${mask(to)}`, '');

  const contact = await prisma.emailContact.upsert({
    where: { organizationId_email: { organizationId: org.id, email: to.toLowerCase() } },
    create: {
      organizationId: org.id,
      email: to.toLowerCase(),
      name: 'Brevo Webhook E2E',
      status: 'SUBSCRIBED',
    },
    update: { status: 'SUBSCRIBED' },
  });

  const template = await prisma.emailTemplate.create({
    data: {
      organizationId: org.id,
      name: `Brevo WH Tpl ${Date.now()}`,
      subject: `[Brevo Webhook E2E] ${new Date().toISOString()}`,
      htmlBody:
        '<p>Webhook E2E MarketingAutoAZ &lt;marketing@mail.marketingautoaz.com&gt;</p><p>Please ignore.</p>',
      textBody: 'Brevo webhook E2E',
    },
  });

  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId: org.id,
      name: `Brevo Webhook E2E ${Date.now()}`,
      subject: template.subject,
      templateId: template.id,
      status: 'RUNNING',
      startedAt: new Date(),
      totalRecipients: 1,
    },
  });

  const recipient = await prisma.emailCampaignRecipient.create({
    data: {
      organizationId: org.id,
      campaignId: campaign.id,
      contactId: contact.id,
      email: contact.email,
      status: 'QUEUED',
      queuedAt: new Date(),
      idempotencyKey: `brevo-wh-${Date.now()}`,
    },
  });

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const prefix = process.env.QUEUE_PREFIX || 'marketingspa';
  const queue = new Queue(QUEUE_NAMES.EMAIL_CAMPAIGN_SEND, { connection, prefix });
  await queue.add(
    'send-email',
    {
      organizationId: org.id,
      campaignId: campaign.id,
      recipientId: recipient.id,
    },
    { jobId: `email-send-${recipient.id}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  );
  record('queue_enqueued', true, `recipient=${recipient.id.slice(0, 8)}…`, '');

  // Wait SENT from worker
  let sentRow = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    sentRow = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipient.id } });
    if (sentRow?.status === 'SENT' || sentRow?.status === 'DELIVERED' || sentRow?.providerMessageId) {
      break;
    }
    if (sentRow?.status === 'FAILED') break;
  }
  const sentOk =
    Boolean(sentRow?.providerMessageId) &&
    sentRow?.provider === 'brevo' &&
    (sentRow.status === 'SENT' || sentRow.status === 'DELIVERED');
  record(
    'brevo_sent',
    sentOk,
    `status=${sentRow?.status} provider=${sentRow?.provider} midTail=${sentRow?.providerMessageId ? '…' + sentRow.providerMessageId.slice(-10) : 'none'}`,
    sentRow?.lastError || '',
  );
  if (!sentOk) {
    await queue.close();
    await connection.quit();
    await finish(1);
    return;
  }

  const mid = sentRow.providerMessageId;
  const startedWait = Date.now();
  let webhookDelivered = false;
  let evidence = '';

  // Wait ONLY for our webhook side-effects (no Brevo Events API poll)
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const ev = await prisma.emailEvent.findFirst({
      where: {
        recipientId: recipient.id,
        type: 'DELIVERED',
      },
      orderBy: { occurredAt: 'desc' },
    });
    const meta = ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
    const fromWebhook = meta.source === 'brevo_webhook';

    const whEv = await prisma.emailWebhookEvent.findFirst({
      where: {
        provider: 'brevo',
        eventKind: 'delivered',
        OR: [
          { messageId: mid },
          { messageId: mid?.replace(/^<|>$/g, '') },
          { messageId: mid?.startsWith('<') ? mid : `<${mid}>` },
          { recipientId: recipient.id },
        ],
      },
      orderBy: { processedAt: 'desc' },
    });

    const row = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipient.id } });
    if (fromWebhook && row?.deliveredAt) {
      webhookDelivered = true;
      evidence = `EmailEvent.source=brevo_webhook deliveredAt=${row.deliveredAt.toISOString()} waitMs=${Date.now() - startedWait}`;
      break;
    }
    if (whEv && row?.deliveredAt) {
      webhookDelivered = true;
      evidence = `EmailWebhookEvent.delivered id=${whEv.id.slice(0, 8)}… deliveredAt=${row.deliveredAt.toISOString()} waitMs=${Date.now() - startedWait}`;
      break;
    }
  }

  record(
    'webhook_delivered',
    webhookDelivered,
    evidence || `no webhook DELIVERED within timeout midTail=…${String(mid).slice(-10)}`,
    webhookDelivered ? '' : 'webhook_timeout_or_not_configured_on_brevo',
  );

  // Idempotency: replay same synthetic delivered for this mid should duplicate
  const secret = (process.env.BREVO_WEBHOOK_SECRET || '').trim();
  const replayBody = {
    event: 'delivered',
    email: to,
    'message-id': mid,
    ts_event: Math.floor(Date.now() / 1000),
    id: 999001,
    tags: [`campaignId:${campaign.id}`, `recipientId:${recipient.id}`],
  };
  const r1 = await fetch('http://127.0.0.1:4000/api/v1/webhooks/brevo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-maz-brevo-secret': secret },
    body: JSON.stringify(replayBody),
  });
  const j1 = await r1.json();
  const r2 = await fetch('http://127.0.0.1:4000/api/v1/webhooks/brevo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-maz-brevo-secret': secret },
    body: JSON.stringify(replayBody),
  });
  const j2 = await r2.json();
  record(
    'idempotent',
    r1.status === 200 && r2.status === 200 && (j2.duplicates >= 1 || j2.updated === 0),
    `r1=${JSON.stringify(j1)} r2=${JSON.stringify(j2)}`,
    '',
  );

  await queue.close();
  await connection.quit();

  const pass =
    rows.filter((r) =>
      ['webhook_endpoint', 'brevo_webhook_registered', 'queue_enqueued', 'brevo_sent', 'webhook_delivered'].includes(
        r.name,
      ),
    ).every((r) => r.pass);

  await finish(pass ? 0 : 1);
}

async function finish(code) {
  console.log('\n=== BREVO WEBHOOK E2E ===');
  for (const r of rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}\t${r.name}\t${r.evidence}\t${r.err}`);
  }
  console.log(code === 0 ? '\nBREVO WEBHOOK E2E: PASS' : '\nBREVO WEBHOOK E2E: FAIL');
  await prisma.$disconnect();
  process.exit(code);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  console.log('\nBREVO WEBHOOK E2E: FAIL');
  process.exit(1);
});
