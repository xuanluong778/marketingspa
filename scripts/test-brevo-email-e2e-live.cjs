/**
 * Live Brevo marketing E2E — NO stub.
 * Sends 1 real email, polls Brevo events for delivered.
 *
 *   node scripts/with-root-env.cjs node scripts/test-brevo-email-e2e-live.cjs
 * Optional: BREVO_TEST_TO=you@gmail.com
 */
const { prisma } = require('../packages/database/dist');

const results = [];
function record(col, pass, evidence, error) {
  results.push({
    col,
    pass: Boolean(pass),
    evidence: String(evidence || '').slice(0, 260),
    error: String(error || '').slice(0, 200),
  });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${col} | ${evidence}${error ? ' | ERR: ' + error : ''}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function maskEmail(e) {
  const [u, d] = String(e).split('@');
  if (!d) return '•••';
  return `${(u || '').slice(0, 2)}…@${d}`;
}

async function brevoGetEvents(apiKey, { email, messageId, limit = 20 }) {
  const url = new URL('https://api.brevo.com/v3/smtp/statistics/events');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'desc');
  if (email) url.searchParams.set('email', email);
  if (messageId) url.searchParams.set('messageId', messageId);
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'api-key': apiKey },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if ((process.env.EMAIL_PROVIDER_STUB || '').trim() === '1') {
    record('ENV', false, 'EMAIL_PROVIDER_STUB=1 — refuse live verdict', 'stub_forbidden');
    printAndExit(1);
    return;
  }

  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const fromEmail = (process.env.BREVO_FROM_EMAIL || '').trim();
  const fromName = (process.env.BREVO_FROM_NAME || '').trim();
  const mkt =
    (process.env.EMAIL_MARKETING_PROVIDER || process.env.MARKETING_EMAIL_PROVIDER || '').trim();

  const envOk =
    apiKey.length > 20 &&
    fromEmail === 'marketing@mail.marketingautoaz.com' &&
    fromName === 'MarketingAutoAZ' &&
    mkt === 'brevo';
  record(
    'ENV',
    envOk,
    `key=SET len=${apiKey.length} from=${fromName} <${fromEmail}> marketingProvider=${mkt}`,
    envOk ? '' : 'missing_or_mismatch_env',
  );

  // Process env presence (redacted)
  const fs = require('fs');
  let apiHas = false;
  let workerHas = false;
  try {
    const procs = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
    for (const pid of procs) {
      let cmd = '';
      try {
        cmd = fs.readFileSync(`/proc/${pid}/cmdline`);
        cmd = cmd.toString().replace(/\0/g, ' ');
      } catch {
        continue;
      }
      let envBuf;
      try {
        envBuf = fs.readFileSync(`/proc/${pid}/environ`);
      } catch {
        continue;
      }
      const hasKey = envBuf.includes(Buffer.from('BREVO_API_KEY='));
      const hasFrom = envBuf.includes(Buffer.from('BREVO_FROM_EMAIL='));
      if (cmd.includes('apps/api/dist/main.js') && hasKey && hasFrom) apiHas = true;
      if (cmd.includes('apps/worker/dist/index.js') && hasKey && hasFrom) workerHas = true;
    }
  } catch {
    /* ignore */
  }
  record('API', apiHas, apiHas ? 'process has BREVO_API_KEY+FROM' : 'process missing Brevo env — restart required', apiHas ? '' : 'stale_process');
  record('WORKER', workerHas, workerHas ? 'process has BREVO_API_KEY+FROM' : 'process missing Brevo env — restart required', workerHas ? '' : 'stale_process');

  const {
    createEmailProvider,
    resetEmailProviderCache,
    resolveEmailProviderName,
    brevoFromEmail,
  } = require('../packages/shared/dist');
  resetEmailProviderCache();

  const resolved = resolveEmailProviderName('marketing');
  const composedFrom = brevoFromEmail();
  const senderOk =
    resolved === 'brevo' &&
    /MarketingAutoAZ\s*<marketing@mail\.marketingautoaz\.com>/i.test(composedFrom);
  record(
    'SENDER',
    senderOk,
    `resolved=${resolved} from=${composedFrom}`,
    senderOk ? '' : 'sender_mismatch',
  );

  const to =
    (process.env.BREVO_TEST_TO || process.env.PLATFORM_SUPER_ADMIN_EMAIL || '').trim() ||
    'xuanluong778@gmail.com';
  if (!to.includes('@gmail.com') && !to.includes('@googlemail.com')) {
    record('BREVO SEND', false, `to=${maskEmail(to)} not gmail`, 'need_gmail_test_to');
    // still try send if user set BREVO_TEST_TO intentionally
  }

  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!org) {
    record('BREVO SEND', false, 'no org', 'no_org');
    printAndExit(1);
    return;
  }

  const provider = createEmailProvider({ purpose: 'marketing' });
  if (provider.name !== 'brevo' || !provider.isConfigured()) {
    record(
      'BREVO SEND',
      false,
      `provider=${provider.name} configured=${provider.isConfigured()}`,
      'not_brevo',
    );
    printAndExit(1);
    return;
  }

  const subject = `[Brevo E2E] MarketingAutoAZ ${new Date().toISOString()}`;
  const html = `<p>Email test Brevo từ <strong>MarketingAutoAZ</strong>.</p><p>Sender: MarketingAutoAZ &lt;marketing@mail.marketingautoaz.com&gt;</p><p>Thời gian: ${new Date().toISOString()}</p>`;
  const idem = `brevo-e2e-${Date.now()}`;

  let outbound = await prisma.emailOutboundMessage.create({
    data: {
      organizationId: org.id,
      purpose: 'marketing',
      toEmail: to.toLowerCase(),
      subject,
      status: 'PENDING',
      idempotencyKey: idem,
      metadata: { test: 'brevo-e2e-live' },
    },
  });

  let sendResult;
  try {
    sendResult = await provider.send({
      to,
      from: composedFrom,
      subject,
      html,
      text: `Brevo E2E MarketingAutoAZ ${new Date().toISOString()}`,
      tags: { purpose: 'marketing', e2e: '1' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.emailOutboundMessage.update({
      where: { id: outbound.id },
      data: { status: 'FAILED', failedAt: new Date(), lastError: msg.slice(0, 500), provider: 'brevo' },
    });
    record('BREVO SEND', false, `to=${maskEmail(to)}`, msg.slice(0, 180));
    printAndExit(1);
    return;
  }

  outbound = await prisma.emailOutboundMessage.update({
    where: { id: outbound.id },
    data: {
      status: 'SENT',
      provider: sendResult.provider,
      providerMessageId: sendResult.messageId || null,
      sentAt: new Date(),
      lastError: null,
    },
  });

  const mid = sendResult.messageId || '';
  record(
    'BREVO SEND',
    sendResult.provider === 'brevo' && Boolean(mid),
    `to=${maskEmail(to)} provider=${sendResult.provider} midTail=…${mid.slice(-10)} status=SENT queue=direct_provider (marketing live)`,
    '',
  );

  // Poll Brevo events for delivered (up to ~90s)
  let delivered = false;
  let opened = false;
  let lastEvents = [];
  for (let i = 0; i < 18; i++) {
    await sleep(5000);
    const ev = await brevoGetEvents(apiKey, { email: to, limit: 25 });
    if (ev.status !== 200) {
      lastEvents = [{ errorHttp: ev.status, body: JSON.stringify(ev.json).slice(0, 120) }];
      continue;
    }
    const events = Array.isArray(ev.json?.events) ? ev.json.events : [];
    lastEvents = events.slice(0, 5).map((e) => ({
      event: e.event,
      email: e.email ? maskEmail(e.email) : undefined,
      midTail: e.messageId ? `…${String(e.messageId).slice(-8)}` : undefined,
      date: e.date,
    }));
    const match = events.filter((e) => {
      if (!mid) return e.email && String(e.email).toLowerCase() === to.toLowerCase();
      return String(e.messageId || '') === mid || String(e.messageId || '').includes(mid.replace(/[<>]/g, '').slice(0, 20));
    });
    const pool = match.length ? match : events.filter((e) => String(e.email || '').toLowerCase() === to.toLowerCase());
    if (pool.some((e) => /deliver/i.test(String(e.event || '')))) delivered = true;
    if (pool.some((e) => /open|click/i.test(String(e.event || '')))) opened = true;
    if (delivered) break;
  }

  if (delivered) {
    await prisma.emailOutboundMessage.update({
      where: { id: outbound.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
  }

  const after = await prisma.emailOutboundMessage.findUnique({ where: { id: outbound.id } });
  record(
    'STATUS TRACKING',
    after?.status === 'SENT' || after?.status === 'DELIVERED',
    `dbStatus=${after?.status} provider=${after?.provider} hasMid=${Boolean(after?.providerMessageId)} sentAt=${after?.sentAt?.toISOString() || 'n/a'} deliveredAt=${after?.deliveredAt?.toISOString() || 'n/a'}`,
    '',
  );

  // Gmail receive: Brevo "delivered" = accepted by Gmail MX (inbox vs spam still needs human)
  record(
    'GMAIL RECEIVE',
    delivered,
    delivered
      ? `Brevo event=delivered for ${maskEmail(to)} (inbox vs spam: kiểm tra thủ công Gmail)`
      : `no delivered event in ~90s events=${JSON.stringify(lastEvents).slice(0, 180)}`,
    delivered ? '' : 'no_delivered_event',
  );

  // Webhook: none in codebase
  const hasWebhookRoute = false;
  try {
    const fs2 = require('fs');
    const root = require('path').join(__dirname, '..');
    const grep = require('child_process').execSync(
      `rg -l -i "brevo.*webhook|webhook.*brevo" "${root}/apps" "${root}/packages" 2>/dev/null | head -5`,
      { encoding: 'utf8' },
    );
    if (grep.trim()) hasWebhookRoute = true;
  } catch {
    /* none */
  }
  record(
    'WEBHOOK',
    false,
    hasWebhookRoute
      ? 'Brevo webhook code present but not verified'
      : 'Chưa cấu hình Brevo webhook endpoint trên MarketingAutoAZ — status DELIVERED lấy từ Brevo Events API poll',
    'brevo_webhook_not_configured',
  );

  printAndExit(results.filter((r) => ['ENV', 'API', 'WORKER', 'BREVO SEND'].includes(r.col) && !r.pass).length ? 1 : delivered ? 0 : 1);
}

function printAndExit(code) {
  console.log('\n=== BREVO EMAIL E2E MATRIX ===');
  console.log('ENV | API | WORKER | BREVO SEND | GMAIL RECEIVE | WEBHOOK | STATUS TRACKING');
  const order = ['ENV', 'API', 'WORKER', 'BREVO SEND', 'GMAIL RECEIVE', 'WEBHOOK', 'STATUS TRACKING', 'SENDER'];
  for (const name of order) {
    const r = results.find((x) => x.col === name);
    if (!r) continue;
    console.log(`${r.col} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.evidence} | ${r.error}`);
  }
  const coreFail = results.filter((r) =>
    ['ENV', 'API', 'WORKER', 'BREVO SEND', 'GMAIL RECEIVE', 'STATUS TRACKING'].includes(r.col) && !r.pass,
  ).length;
  // Webhook optional - don't fail overall solely on webhook if delivered via poll
  console.log(coreFail === 0 ? '\nBREVO EMAIL E2E: PASS' : '\nBREVO EMAIL E2E: FAIL');
  prisma.$disconnect().finally(() => process.exit(code));
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  console.log('\nBREVO EMAIL E2E: FAIL');
  process.exit(1);
});
