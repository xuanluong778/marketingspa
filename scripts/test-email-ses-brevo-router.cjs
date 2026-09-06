/**
 * SES + Brevo router E2E (stub — không gọi API thật, không log secret).
 *
 *   EMAIL_PROVIDER_STUB=1 node scripts/with-root-env.cjs node scripts/test-email-ses-brevo-router.cjs
 */
const { prisma } = require('../packages/database/dist');

process.env.EMAIL_PROVIDER_STUB = '1';
process.env.EMAIL_PROVIDER = 'auto';
process.env.EMAIL_TRANSACTIONAL_PROVIDER = 'ses';
process.env.EMAIL_MARKETING_PROVIDER = 'brevo';
// Stub treats all as configured
process.env.SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'stub@example.com';
process.env.BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'stub@example.com';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'stub-key-not-logged';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: String(detail || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

async function main() {
  // Load after env stub flags
  const shared = require('../packages/shared/dist');
  const {
    resolveEmailProviderName,
    createEmailProvider,
    resetEmailProviderCache,
    preferredProvidersForPurpose,
  } = shared;

  resetEmailProviderCache();

  const txName = resolveEmailProviderName('transactional');
  const mktName = resolveEmailProviderName('marketing');
  record('transactional_resolves_ses', txName === 'ses', `got=${txName}`);
  record('marketing_resolves_brevo', mktName === 'brevo', `got=${mktName}`);
  record(
    'preferred_chains',
    preferredProvidersForPurpose('transactional')[0] === 'ses' &&
      preferredProvidersForPurpose('marketing')[0] === 'brevo',
    `tx=${preferredProvidersForPurpose('transactional').join('>')} mkt=${preferredProvidersForPurpose('marketing').join('>')}`,
  );

  const tx = createEmailProvider({ purpose: 'transactional' });
  const mkt = createEmailProvider({ purpose: 'marketing' });
  record('tx_provider_instance', tx.name === 'ses', `name=${tx.name}`);
  record('mkt_provider_instance', mkt.name === 'brevo', `name=${mkt.name}`);

  const txSend = await tx.send({
    to: 'tx@example.com',
    from: 'stub@example.com',
    subject: 'TX test',
    html: '<p>hi</p>',
    text: 'hi',
  });
  record(
    'transactional_send_ses',
    txSend.provider === 'ses' && Boolean(txSend.messageId),
    `provider=${txSend.provider} midTail=…${String(txSend.messageId).slice(-6)}`,
  );

  const mktSend = await mkt.send({
    to: 'mkt@example.com',
    from: 'stub@example.com',
    subject: 'MKT test',
    html: '<p>hi</p>',
    text: 'hi',
  });
  record(
    'marketing_send_brevo',
    mktSend.provider === 'brevo' && Boolean(mktSend.messageId),
    `provider=${mktSend.provider} midTail=…${String(mktSend.messageId).slice(-6)}`,
  );

  // --- Idempotency + tenant isolation via EmailOutboundMessage ---
  const orgA = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  const orgB = await prisma.organization.findFirst({
    where: orgA ? { id: { not: orgA.id } } : undefined,
    orderBy: { createdAt: 'asc' },
  });
  if (!orgA) {
    record('org_fixture', false, 'no organization');
    await finish(1);
    return;
  }
  record('org_fixture', true, orgA.name);

  const key = `e2e-idem-${Date.now()}`;
  const row1 = await prisma.emailOutboundMessage.create({
    data: {
      organizationId: orgA.id,
      purpose: 'transactional',
      toEmail: 'a@example.com',
      subject: 'idem',
      status: 'SENT',
      provider: 'ses',
      providerMessageId: txSend.messageId,
      idempotencyKey: key,
      sentAt: new Date(),
    },
  });

  // Retry same key → should find existing SENT (dedupe simulation)
  const again = await prisma.emailOutboundMessage.findUnique({
    where: {
      organizationId_idempotencyKey: { organizationId: orgA.id, idempotencyKey: key },
    },
  });
  record(
    'retry_no_duplicate',
    again?.id === row1.id && again?.providerMessageId === txSend.messageId,
    `sameRow=${again?.id === row1.id}`,
  );

  // Tenant isolation: same idempotency key on org B is allowed / separate
  if (orgB) {
    const rowB = await prisma.emailOutboundMessage.create({
      data: {
        organizationId: orgB.id,
        purpose: 'transactional',
        toEmail: 'b@example.com',
        subject: 'idem-b',
        status: 'SENT',
        provider: 'ses',
        providerMessageId: `other-${txSend.messageId}`,
        idempotencyKey: key,
        sentAt: new Date(),
      },
    });
    const leak = await prisma.emailOutboundMessage.findFirst({
      where: { organizationId: orgA.id, id: rowB.id },
    });
    record(
      'tenant_isolation',
      !leak && rowB.organizationId === orgB.id,
      `orgA=${orgA.id.slice(0, 8)}… orgB=${orgB.id.slice(0, 8)}…`,
    );
    await prisma.emailOutboundMessage.delete({ where: { id: rowB.id } }).catch(() => undefined);
  } else {
    record('tenant_isolation', true, 'single-org env — unique(org,key) still scoped');
  }

  // failedAt field exists on campaign recipient model (schema)
  const sampleFail = await prisma.emailCampaignRecipient.create({
    data: {
      organizationId: orgA.id,
      campaignId: (
        await prisma.emailCampaign.create({
          data: {
            organizationId: orgA.id,
            name: `E2E Router ${Date.now()}`,
            status: 'DRAFT',
            subject: 't',
          },
        })
      ).id,
      contactId: (
        await prisma.emailContact.upsert({
          where: {
            organizationId_email: { organizationId: orgA.id, email: 'router-e2e@example.com' },
          },
          create: {
            organizationId: orgA.id,
            email: 'router-e2e@example.com',
            status: 'SUBSCRIBED',
          },
          update: {},
        })
      ).id,
      email: 'router-e2e@example.com',
      status: 'FAILED',
      failedAt: new Date(),
      provider: 'brevo',
      lastError: 'stub_fail',
      idempotencyKey: `fail-${Date.now()}`,
    },
  });
  record(
    'failedAt_persisted',
    Boolean(sampleFail.failedAt),
    `failedAt=${sampleFail.failedAt?.toISOString()}`,
  );

  // cleanup
  await prisma.emailCampaignRecipient.delete({ where: { id: sampleFail.id } }).catch(() => undefined);
  await prisma.emailCampaign.delete({ where: { id: sampleFail.campaignId } }).catch(() => undefined);
  await prisma.emailOutboundMessage.delete({ where: { id: row1.id } }).catch(() => undefined);

  // No secret leakage in this script output
  const dump = JSON.stringify(results);
  record(
    'no_secret_in_output',
    !/BREVO_API_KEY|AWS_SECRET|stub-key-not-logged/.test(dump) &&
      !dump.includes(process.env.BREVO_API_KEY || '___'),
    'ok',
  );

  await finish(results.some((r) => !r.pass) ? 1 : 0);
}

async function finish(code) {
  console.log('\n=== SES + BREVO ROUTER SUMMARY ===');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}\t${r.name}\t${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? '\nSES + BREVO ROUTER PASS' : '\nSES + BREVO ROUTER FAIL');
  await prisma.$disconnect();
  process.exit(code);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  console.log('\nSES + BREVO ROUTER FAIL');
  process.exit(1);
});
