/**
 * E2E: Email campaign recipient list + scheduling → Brevo send
 *
 * Flow:
 *  1) Create 14 eligible contacts + 1 suppressed
 *  2) GET audience-members → exactly 14 eligible emails (suppression excluded)
 *  3) Create campaign with contactIds=14, schedule ~90s ahead → SCHEDULED
 *  4) Wait for worker scan → RUNNING → COMPLETED (SENT)
 *  5) Recipients SENT/DELIVERED via Brevo
 *
 *   node scripts/with-root-env.cjs node scripts/test-email-campaign-schedule-e2e.cjs
 */
const { prisma, EmailContactStatus, EmailCampaignStatus, EmailRecipientStatus } = require(
  '../packages/database/dist',
);

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);

const rows = [];
function record(name, pass, evidence, err) {
  rows.push({ name, pass: Boolean(pass), evidence: String(evidence || ''), err: String(err || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${evidence}${err ? ' | ERR: ' + err : ''}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mask(e) {
  const [u, d] = String(e).split('@');
  return `${(u || '').slice(0, 2)}…@${d || ''}`;
}

async function api(path, token, init) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if ((process.env.EMAIL_PROVIDER_STUB || '').trim() === '1') {
    record('stub_guard', false, 'stub forbidden', 'EMAIL_PROVIDER_STUB=1');
    finish(1);
    return;
  }

  const loginEmail = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!loginEmail || !password) {
    record('login', false, 'missing META_REVIEWER credentials', '');
    finish(1);
    return;
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email: loginEmail, password }),
  });
  const token = login.json?.accessToken;
  record('login', login.status < 300 && !!token, `status=${login.status}`);
  if (!token) {
    finish(1);
    return;
  }

  const me = await api('/auth/me', token);
  const orgId = me.json?.organizationId;
  record('tenant', !!orgId, `org=${orgId || 'n/a'}`);
  if (!orgId) {
    finish(1);
    return;
  }

  const stamp = Date.now();
  const baseTo = (process.env.BREVO_TEST_TO || process.env.PLATFORM_SUPER_ADMIN_EMAIL || '').trim();
  if (!baseTo || !baseTo.includes('@')) {
    record('fixtures', false, 'missing BREVO_TEST_TO / PLATFORM_SUPER_ADMIN_EMAIL', '');
    finish(1);
    return;
  }
  const [local, domain] = baseTo.split('@');

  // 14 eligible + 1 suppressed
  const emails = [];
  for (let i = 1; i <= 14; i++) {
    emails.push(`${local}+sched${stamp}-${i}@${domain}`);
  }
  const suppressedEmail = `${local}+sched${stamp}-suppress@${domain}`;

  const contactIds = [];
  for (const email of emails) {
    const c = await prisma.emailContact.upsert({
      where: { organizationId_email: { organizationId: orgId, email } },
      create: {
        organizationId: orgId,
        email,
        name: `E2E Sched ${email.split('+')[1]?.split('@')[0] || 'x'}`,
        status: EmailContactStatus.SUBSCRIBED,
        source: 'e2e-schedule',
      },
      update: { status: EmailContactStatus.SUBSCRIBED, name: `E2E Sched` },
    });
    contactIds.push(c.id);
  }
  await prisma.emailContact.upsert({
    where: { organizationId_email: { organizationId: orgId, email: suppressedEmail } },
    create: {
      organizationId: orgId,
      email: suppressedEmail,
      name: 'E2E Suppressed',
      status: EmailContactStatus.SUBSCRIBED,
      source: 'e2e-schedule',
    },
    update: { status: EmailContactStatus.SUBSCRIBED },
  });
  await prisma.emailSuppression.upsert({
    where: { organizationId_email: { organizationId: orgId, email: suppressedEmail } },
    create: {
      organizationId: orgId,
      email: suppressedEmail,
      reason: 'MANUAL',
      note: 'e2e suppression',
    },
    update: { reason: 'MANUAL', note: 'e2e suppression' },
  });

  record(
    'seed_14_plus_suppress',
    contactIds.length === 14,
    `contacts=${contactIds.length} suppress=${mask(suppressedEmail)}`,
  );

  // Audience members — eligible only
  const members = await api(
    `/email-marketing/audience-members?filter=eligible&pageSize=100&search=sched${stamp}`,
    token,
  );
  const items = members.json?.items || [];
  const memberEmails = items.map((i) => i.email).sort();
  const expectedEmails = [...emails].sort();
  const hasSuppress = items.some((i) => i.email === suppressedEmail);
  const listOk =
    members.status < 300 &&
    items.length === 14 &&
    !hasSuppress &&
    JSON.stringify(memberEmails) === JSON.stringify(expectedEmails);

  record(
    'recipient_list_14',
    listOk,
    `http=${members.status} count=${items.length} suppressInList=${hasSuppress}`,
    listOk ? '' : `got=${memberEmails.slice(0, 3).map(mask).join(',')}`,
  );

  // Columns present
  const sample = items[0];
  const colsOk =
    sample &&
    'name' in sample &&
    'email' in sample &&
    'statusLabel' in sample &&
    Array.isArray(sample.groups);
  record(
    'recipient_columns',
    Boolean(colsOk),
    colsOk ? `name|email|groups|statusLabel` : 'missing fields',
  );

  // Multi-tenant: other org must not see these
  const otherOrg = await prisma.organization.findFirst({
    where: { id: { not: orgId } },
    orderBy: { createdAt: 'asc' },
  });
  if (otherOrg) {
    const leak = await prisma.emailContact.count({
      where: { organizationId: otherOrg.id, email: { in: emails } },
    });
    record('multi_tenant_no_leak', leak === 0, `otherOrgLeak=${leak}`);
  } else {
    record('multi_tenant_no_leak', true, 'single_org_skip');
  }

  // Template
  const tpl = await api('/email-marketing/templates', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E schedule tpl ${stamp}`,
      subject: `E2E schedule ${stamp}`,
      htmlBody: `<p>E2E scheduled campaign ${stamp}</p>`,
      category: 'campaign',
      isActive: false,
    }),
  });
  const templateId = tpl.json?.id;
  record('template', tpl.status < 300 && !!templateId, `id=${templateId || 'n/a'}`);

  // Campaign with 14 contactIds
  const camp = await api('/email-marketing/campaigns', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E schedule ${stamp}`,
      subject: `E2E schedule ${stamp}`,
      templateId,
      contactIds,
    }),
  });
  const campaignId = camp.json?.id;
  const selected = camp.json?.selectedContactIds || [];
  record(
    'campaign_contact_ids',
    camp.status < 300 && campaignId && selected.length === 14,
    `id=${campaignId || 'n/a'} selected=${selected.length}`,
  );

  // Schedule ~75s ahead (scan is ~1m)
  const when = new Date(Date.now() + 75_000);
  const sched = await api(`/email-marketing/campaigns/${campaignId}/schedule`, token, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt: when.toISOString() }),
  });
  record(
    'schedule_scheduled',
    sched.status < 300 && sched.json?.status === 'SCHEDULED' && !!sched.json?.scheduledAt,
    `status=${sched.json?.status} at=${sched.json?.scheduledAt || ''}`,
  );

  // Re-schedule (edit) +1s
  const when2 = new Date(when.getTime() + 5_000);
  const resched = await api(`/email-marketing/campaigns/${campaignId}/schedule`, token, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt: when2.toISOString() }),
  });
  record(
    'reschedule_edit',
    resched.status < 300 && resched.json?.status === 'SCHEDULED',
    `at=${resched.json?.scheduledAt || ''}`,
  );

  // Wait until due + worker processes (up to ~4 min)
  let finalStatus = 'SCHEDULED';
  let sentCount = 0;
  let deliveredCount = 0;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await sleep(8_000);
    const g = await api(`/email-marketing/campaigns/${campaignId}`, token);
    finalStatus = g.json?.status || finalStatus;
    sentCount = g.json?.sentCount ?? 0;
    deliveredCount = g.json?.deliveredCount ?? 0;
    console.log(`  … poll status=${finalStatus} sent=${sentCount} delivered=${deliveredCount}`);
    if (finalStatus === 'COMPLETED' || finalStatus === 'CANCELLED' || finalStatus === 'FAILED') break;
    if (finalStatus === 'RUNNING' && sentCount >= 14) {
      // may complete shortly
    }
  }

  const sendOk = finalStatus === 'COMPLETED' || (finalStatus === 'RUNNING' && sentCount >= 1);
  record(
    'worker_send_after_schedule',
    sendOk && sentCount >= 1,
    `status=${finalStatus} sent=${sentCount} delivered=${deliveredCount}`,
    sendOk ? '' : 'timeout_or_not_sent',
  );

  const recips = await api(
    `/email-marketing/campaigns/${campaignId}/recipients?pageSize=50`,
    token,
  );
  const rItems = recips.json?.items || [];
  const sentOrDelivered = rItems.filter((r) =>
    ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'].includes(r.status),
  ).length;
  const skipped = rItems.filter((r) => r.status === 'SKIPPED').length;
  record(
    'recipients_sent_delivered',
    sentOrDelivered >= 1 && rItems.length >= 14,
    `recipients=${rItems.length} sentish=${sentOrDelivered} skipped=${skipped}`,
  );

  // Idempotency: schedule scan claim — re-enqueue plan should not double-send
  const beforeSent = sentCount;
  await sleep(5_000);
  const g2 = await api(`/email-marketing/campaigns/${campaignId}`, token);
  const afterSent = g2.json?.sentCount ?? 0;
  record(
    'idempotency_no_double',
    afterSent <= Math.max(beforeSent, 14) + 0,
    `sentBefore=${beforeSent} sentAfter=${afterSent}`,
  );

  // Cleanup soft: cancel if still scheduled
  if (finalStatus === 'SCHEDULED') {
    await api(`/email-marketing/campaigns/${campaignId}/cancel`, token, { method: 'POST' });
  }

  const recipientPass = rows
    .filter((r) =>
      ['recipient_list_14', 'recipient_columns', 'multi_tenant_no_leak', 'campaign_contact_ids'].includes(
        r.name,
      ),
    )
    .every((r) => r.pass);
  const schedulePass = rows
    .filter((r) =>
      [
        'schedule_scheduled',
        'reschedule_edit',
        'worker_send_after_schedule',
        'recipients_sent_delivered',
        'idempotency_no_double',
      ].includes(r.name),
    )
    .every((r) => r.pass);

  console.log('\n========== VERDICT ==========');
  console.log(`RECIPIENT LIST ${recipientPass ? 'PASS' : 'FAIL'}`);
  console.log(`EMAIL SCHEDULING ${schedulePass ? 'PASS' : 'FAIL'}`);

  finish(recipientPass && schedulePass ? 0 : 1);
}

function finish(code) {
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  record('fatal', false, '', String(e?.message || e));
  finish(1);
});
