/**
 * P0 — Amazon SES webhook security, tenant isolation, suppression guards.
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-email-ses-p0.ts
 *
 * Server (API) must have matching:
 *   SES_SNS_TOPIC_ARN
 *   SES_SNS_WEBHOOK_TEST_SIGNING_KEY (for signed HTTP + in-process service tests)
 */
import { PrismaClient, EmailContactStatus, EmailRecipientStatus } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { verifyAmazonSnsMessage } from '../packages/shared/dist/sns-signature';
import {
  buildSignedSnsEnvelope,
  buildSnsTestHmac,
  testSnsCertificateFetcher,
} from '../packages/shared/dist/sns-test-signing';
import {
  describeSesEventLoopGap,
  sesEventLoopConfigured,
} from '../packages/shared/dist/email-provider';
import { inspectSesEventLoop } from '../packages/shared/dist/ses-event-loop';

type Case = { id: string; ok: boolean; detail?: string };

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(/\/api\/v1$/, '');
const TEST_TOPIC = (process.env.SES_SNS_TOPIC_ARN || 'arn:aws:sns:ap-southeast-1:000000000000:marketingautoaz-p0-test').trim();
const TEST_HMAC_KEY = (process.env.SES_SNS_WEBHOOK_TEST_SIGNING_KEY || 'p0-local-test-signing-key').trim();

const prisma = new PrismaClient();
const results: Case[] = [];

function record(id: string, ok: boolean, detail?: string) {
  results.push({ id, ok, detail });
}

async function api(path: string, init?: RequestInit & { token?: string; testSig?: string }) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
    ...(init?.testSig ? { 'X-SNS-Test-Signature': init.testSig } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API}/api/v1${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function signedNotification(inner: Record<string, unknown>, topicArn = TEST_TOPIC) {
  return buildSignedSnsEnvelope({
    Type: 'Notification',
    MessageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    TopicArn: topicArn,
    Timestamp: new Date().toISOString(),
    Message: JSON.stringify(inner),
  });
}

async function postSesEnvelope(envelope: Record<string, unknown>) {
  const raw = JSON.stringify(envelope);
  return api('/email-marketing/public/ses-events', {
    method: 'POST',
    body: raw,
    testSig: buildSnsTestHmac(raw, TEST_HMAC_KEY),
  });
}

async function withEmailService<T>(
  fn: (service: import('../apps/api/dist/email-marketing/email-marketing.service').EmailMarketingService) => Promise<T>,
) {
  const { AppModule } = await import('../apps/api/dist/app.module.js');
  const { EmailMarketingService } = await import('../apps/api/dist/email-marketing/email-marketing.service.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    return await fn(app.get(EmailMarketingService));
  } finally {
    await app.close();
  }
}

async function invokeService(envelope: Record<string, unknown>) {
  const raw = JSON.stringify(envelope);
  return withEmailService((service) =>
    service.handleSesEvent(envelope, {
      rawBody: raw,
      testSignatureHeader: buildSnsTestHmac(raw, TEST_HMAC_KEY),
    }),
  );
}

async function testSnsSignatureUnit() {
  const envelope = signedNotification({ eventType: 'Send', mail: { messageId: 'unit-test' } });
  const valid = await verifyAmazonSnsMessage(envelope, {
    fetchCertificate: testSnsCertificateFetcher(),
  });
  record('sns_signature_valid', valid.ok === true, valid.ok ? 'verify ok' : valid.reason);

  const tampered = { ...envelope, Message: JSON.stringify({ eventType: 'Bounce' }) };
  const invalid = await verifyAmazonSnsMessage(tampered, {
    fetchCertificate: testSnsCertificateFetcher(),
  });
  record(
    'sns_signature_tampered_rejected',
    invalid.ok === false && invalid.reason === 'invalid_signature',
    invalid.reason,
  );

  const { isAllowedSnsSigningCertUrl } = await import('../packages/shared/dist/sns-signature');
  record(
    'signing_cert_url_ssrf_blocked',
    !isAllowedSnsSigningCertUrl('http://127.0.0.1/cert.pem') &&
      !isAllowedSnsSigningCertUrl('https://evil.amazonaws.com.evil.com/x.pem') &&
      !isAllowedSnsSigningCertUrl('https://sns.us-east-1.amazonaws.com/not-a-pem'),
    'http/private/pem rejected',
  );
}

async function testTopicFailClosed() {
  const prev = process.env.SES_SNS_TOPIC_ARN;
  delete process.env.SES_SNS_TOPIC_ARN;
  const { expectedSnsTopicArn } = await import('../apps/api/dist/email-marketing/ses-webhook.util.js');
  record('topic_arn_fail_closed_empty', expectedSnsTopicArn() === '', 'missing ARN returns empty');
  process.env.SES_SNS_TOPIC_ARN = prev || TEST_TOPIC;
}

async function testServiceRejections() {
  const unsigned = await withEmailService((service) =>
    service.handleSesEvent({ Type: 'Notification', TopicArn: TEST_TOPIC, Message: '{}' }),
  );
  record(
    'service_unsigned_rejected',
    unsigned.ok === false && unsigned.statusCode === 403,
    `statusCode=${unsigned.statusCode} reason=${unsigned.reason || ''}`,
  );

  const wrongTopicEnvelope = signedNotification(
    { eventType: 'Send', mail: { messageId: 'x' } },
    'arn:aws:sns:us-east-1:000000000000:wrong-topic',
  );
  const wrongTopic = await withEmailService((service) =>
    service.handleSesEvent(wrongTopicEnvelope, {
      rawBody: JSON.stringify(wrongTopicEnvelope),
      testSignatureHeader: buildSnsTestHmac(JSON.stringify(wrongTopicEnvelope), TEST_HMAC_KEY),
    }),
  );
  record(
    'service_wrong_topic_rejected',
    wrongTopic.ok === false && wrongTopic.reason === 'topic_mismatch',
    `reason=${wrongTopic.reason || ''}`,
  );
}

async function testServiceSignedAccept() {
  const res = await invokeService(
    signedNotification({ eventType: 'Send', mail: { messageId: 'noop-service' } }),
  );
  record(
    'service_signed_accept',
    res.ok === true && res.type === 'send',
    `type=${res.type} updated=${res.updated}`,
  );
}

async function testServiceFlow() {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  if (!orgs.length) {
    record('service_flow_setup', false, 'no active org');
    return;
  }
  const orgA = orgs[0];
  const orgB = orgs.length > 1 ? orgs[1] : null;
  const stamp = Date.now();

  const template = await prisma.emailTemplate.create({
    data: {
      organizationId: orgA.id,
      name: `P0 tpl ${stamp}`,
      subject: 'P0',
      htmlBody: '<p>Hi</p>',
      isActive: true,
    },
  });
  const contact = await prisma.emailContact.create({
    data: {
      organizationId: orgA.id,
      email: `p0-bounce-${stamp}@example.com`,
      status: EmailContactStatus.SUBSCRIBED,
    },
  });
  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId: orgA.id,
      name: `P0 camp ${stamp}`,
      templateId: template.id,
      subject: 'P0',
      status: 'DRAFT',
    },
  });
  const recipient = await prisma.emailCampaignRecipient.create({
    data: {
      organizationId: orgA.id,
      campaignId: campaign.id,
      contactId: contact.id,
      email: contact.email,
      status: EmailRecipientStatus.SENT,
      sentAt: new Date(),
      providerMessageId: `p0-msg-${stamp}`,
    },
  });

  const list = await prisma.emailList.create({
    data: { organizationId: orgA.id, name: `P0 list ${stamp}` },
  });
  await prisma.emailListMember.create({
    data: { organizationId: orgA.id, listId: list.id, contactId: contact.id },
  });

  let crossTenantBlocked = !orgB;
  if (orgB) {
    const foreignCampaign = await prisma.emailCampaign.create({
      data: {
        organizationId: orgB.id,
        name: `P0 foreign ${stamp}`,
        templateId: (
          await prisma.emailTemplate.create({
            data: {
              organizationId: orgB.id,
              name: `P0 foreign tpl ${stamp}`,
              subject: 'F',
              htmlBody: '<p>F</p>',
              isActive: true,
            },
          })
        ).id,
        subject: 'F',
        status: 'DRAFT',
      },
    });
    const cross = await invokeService(
      signedNotification({
        eventType: 'Bounce',
        mail: {
          destination: [contact.email],
          tags: { campaignId: [foreignCampaign.id], recipientId: [recipient.id] },
        },
        bounce: {
          bounceType: 'Permanent',
          bouncedRecipients: [{ emailAddress: contact.email }],
        },
      }),
    );
    const afterCross = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipient.id } });
    crossTenantBlocked =
      cross.ok === true &&
      (cross.updated ?? 0) === 0 &&
      afterCross?.status === EmailRecipientStatus.SENT;
    await prisma.emailCampaign.delete({ where: { id: foreignCampaign.id } });
  }

  const delivery = await invokeService(
    signedNotification({
      eventType: 'Delivery',
      mail: {
        messageId: recipient.providerMessageId,
        tags: { campaignId: [campaign.id], recipientId: [recipient.id] },
      },
      delivery: { recipients: [contact.email] },
    }),
  );
  const afterDelivery = await prisma.emailCampaignRecipient.findUnique({ where: { id: recipient.id } });
  const deliveryOk = delivery.ok === true && afterDelivery?.status === EmailRecipientStatus.DELIVERED;

  const bounceEnvelope = signedNotification({
    eventType: 'Bounce',
    mail: {
      destination: [contact.email],
      tags: { campaignId: [campaign.id], recipientId: [recipient.id] },
    },
    bounce: {
      bounceType: 'Permanent',
      bouncedRecipients: [{ emailAddress: contact.email }],
    },
  });
  const bounce = await invokeService(bounceEnvelope);
  const suppression = await prisma.emailSuppression.findUnique({
    where: { organizationId_email: { organizationId: orgA.id, email: contact.email } },
  });
  const bounceOk = bounce.ok === true && suppression?.reason === 'BOUNCE';

  const bounce2 = await invokeService(bounceEnvelope);
  const campAfter = await prisma.emailCampaign.findUnique({ where: { id: campaign.id } });
  const idempotentOk = bounce2.ok === true && (campAfter?.bounceCount ?? 0) === 1;

  const complaintEmail = `p0-complaint-${stamp}@example.com`;
  const complaintContact = await prisma.emailContact.create({
    data: { organizationId: orgA.id, email: complaintEmail, status: EmailContactStatus.SUBSCRIBED },
  });
  const complaintRecipient = await prisma.emailCampaignRecipient.create({
    data: {
      organizationId: orgA.id,
      campaignId: campaign.id,
      contactId: complaintContact.id,
      email: complaintEmail,
      status: EmailRecipientStatus.SENT,
      sentAt: new Date(),
    },
  });
  await invokeService(
    signedNotification({
      eventType: 'Complaint',
      mail: {
        destination: [complaintEmail],
        tags: { campaignId: [campaign.id], recipientId: [complaintRecipient.id] },
      },
      complaint: { complainedRecipients: [{ emailAddress: complaintEmail }] },
    }),
  );
  const complaintSupp = await prisma.emailSuppression.findUnique({
    where: { organizationId_email: { organizationId: orgA.id, email: complaintEmail } },
  });
  const complaintOk = complaintSupp?.reason === 'COMPLAINT';

  record('tenant_cross_blocked', crossTenantBlocked, orgB ? `orgB=${orgB.id}` : 'single org — skipped');
  record('sent_delivered_updated', deliveryOk, `recipient=${recipient.id}`);
  record('permanent_bounce_suppression', bounceOk, contact.email);
  record('bounce_idempotent_kpi', idempotentOk, `bounceCount=${campAfter?.bounceCount ?? 0}`);
  record('complaint_suppression', complaintOk, complaintEmail);

  const preview = await withEmailService((service) => service.previewAudience(orgA.id, list.id));
  record(
    'audience_skips_after_bounce',
    preview.eligible === 0 &&
      (preview.skippedSuppressed >= 1 || preview.skippedUnsubscribed >= 1),
    `eligible=${preview.eligible} skippedSuppressed=${preview.skippedSuppressed} skippedUnsubscribed=${preview.skippedUnsubscribed}`,
  );

  await prisma.emailEvent.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.emailCampaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.emailSuppression.deleteMany({
    where: { organizationId: orgA.id, email: { in: [contact.email, complaintEmail] } },
  });
  await prisma.emailListMember.deleteMany({ where: { listId: list.id } });
  await prisma.emailList.delete({ where: { id: list.id } });
  await prisma.emailContact.deleteMany({
    where: { organizationId: orgA.id, email: { in: [contact.email, complaintEmail] } },
  });
  await prisma.emailCampaign.delete({ where: { id: campaign.id } });
  await prisma.emailTemplate.delete({ where: { id: template.id } });
}

async function testRuntimeEnv() {
  const gap = describeSesEventLoopGap();
  record(
    'runtime_event_loop_env',
    true,
    sesEventLoopConfigured() ? 'eventLoopConfigured=true' : `missing: ${gap.join(', ') || 'none'}`,
  );
  if (sesEventLoopConfigured()) {
    const status = await inspectSesEventLoop();
    record(
      'runtime_aws_event_destination',
      Boolean(status?.eventDestinationOk),
      status
        ? `exists=${status.exists} ok=${status.eventDestinationOk} missing=${status.missingEventTypes.join(',') || 'none'}`
        : 'inspect null',
    );
  } else {
    record('runtime_aws_event_destination', true, 'skipped — AWS event loop env incomplete');
  }
}

async function main() {
  process.env.SES_SNS_TOPIC_ARN = process.env.SES_SNS_TOPIC_ARN || TEST_TOPIC;
  process.env.SES_SNS_WEBHOOK_TEST_SIGNING_KEY =
    process.env.SES_SNS_WEBHOOK_TEST_SIGNING_KEY || TEST_HMAC_KEY;

  await testSnsSignatureUnit();
  await testTopicFailClosed();
  await testServiceRejections();
  await testServiceSignedAccept();
  await testServiceFlow();
  await testRuntimeEnv();

  console.log('\nP0 SES tests\n');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
