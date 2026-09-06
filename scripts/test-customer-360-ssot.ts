/**
 * Customer 360 SSOT + Facebook App Review safety.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-customer-360-ssot.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  prisma,
  MessageChannel,
  MessagingIdentityLinkSource,
  projectCustomer360Event,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from '@marketingspa/database';
import { CUSTOMER_360_EVENTS } from '@marketingspa/shared';

function assertFileContains(rel: string, needles: string[], forbidden: string[] = []) {
  const text = readFileSync(path.join(__dirname, '..', rel), 'utf8');
  for (const n of needles) {
    assert.ok(text.includes(n), `${rel} missing ${n}`);
  }
  for (const n of forbidden) {
    assert.ok(!text.includes(n), `${rel} must not change ${n}`);
  }
}

async function main() {
  // --- Facebook App Review freeze (static) ---
  assertFileContains('apps/api/src/auto-post/assert-auto-post-meta-oauth.ts', [
    '1045516051171576',
    '2006772376877449',
    'https://marketingautoaz.com/api/v1/auto-post/facebook/oauth/callback',
  ]);
  assertFileContains('apps/api/src/auto-post/auto-post-meta-pages.util.ts', [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ]);
  assertFileContains('apps/api/src/chatbot-cskh/chatbot-facebook-webhook.controller.ts', [
    'facebook/webhook',
  ]);

  const orgA = await prisma.organization.create({
    data: { name: 'C360 Org A', slug: `c360-a-${Date.now()}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: 'C360 Org B', slug: `c360-b-${Date.now()}` },
  });

  try {
    const phoneRaw = '0901 234 567';
    const phone = normalizeCustomerPhone(phoneRaw);
    const email1 = 'A.User@Example.com';
    const emailNorm = normalizeCustomerEmail(email1)!;
    assert.equal(phone, '0901234567');
    assert.equal(emailNorm, 'a.user@example.com');

    const created = await prisma.customer.create({
      data: {
        organizationId: orgA.id,
        name: 'Nguyen Van A',
        phone: phoneRaw,
        email: email1,
        phoneNormalized: phone,
        emailNormalized: emailNorm,
      },
    });

    await projectCustomer360Event(prisma, {
      eventType: CUSTOMER_360_EVENTS.CREATED,
      organizationId: orgA.id,
      customerId: created.id,
      payload: { email: created.email, phone: created.phone },
    });

    const emailContact = await prisma.emailContact.findFirst({
      where: { organizationId: orgA.id, email: emailNorm },
    });
    assert.ok(emailContact, 'email marketing contact created');
    assert.equal(emailContact!.customerId, created.id);
    assert.equal(emailContact!.phone, phoneRaw);

    const emailIdentity = await prisma.customerIdentity.findFirst({
      where: { organizationId: orgA.id, customerId: created.id, kind: 'EMAIL' },
    });
    const phoneIdentity = await prisma.customerIdentity.findFirst({
      where: { organizationId: orgA.id, customerId: created.id, kind: 'PHONE' },
    });
    assert.equal(emailIdentity?.valueNormalized, emailNorm);
    assert.equal(phoneIdentity?.valueNormalized, phone);

    const zalo = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        channel: MessageChannel.ZALO,
        integrationScopeKey: 'zalo:oa-test',
        externalUserId: 'zalo-user-1',
        phoneRaw,
        phoneNormalized: phone,
        displayName: 'Zalo A',
      },
    });
    const messengerUnverified = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        channel: MessageChannel.MESSENGER,
        integrationScopeKey: 'messenger:page-test',
        externalUserId: 'psid-unverified',
        phoneRaw,
        phoneNormalized: phone,
      },
    });
    const messengerVerified = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        channel: MessageChannel.MESSENGER,
        integrationScopeKey: 'messenger:page-test',
        externalUserId: 'psid-verified',
        phoneRaw,
        phoneNormalized: phone,
        phoneVerifiedAt: new Date(),
        linkSource: MessagingIdentityLinkSource.UNLINKED,
      },
    });

    await projectCustomer360Event(prisma, {
      eventType: CUSTOMER_360_EVENTS.PHONE_ADDED,
      organizationId: orgA.id,
      customerId: created.id,
      payload: { phone },
    });

    const zaloAfter = await prisma.messagingContactIdentity.findUnique({ where: { id: zalo.id } });
    const msUnv = await prisma.messagingContactIdentity.findUnique({
      where: { id: messengerUnverified.id },
    });
    const msVer = await prisma.messagingContactIdentity.findUnique({
      where: { id: messengerVerified.id },
    });
    assert.equal(zaloAfter?.customerId, created.id, 'Zalo linked by phone');
    assert.equal(msUnv?.customerId, null, 'unverified Facebook PSID must NOT auto-link');
    assert.equal(msVer?.customerId, created.id, 'verified Facebook PSID may link additively');

    const newEmail = 'new.user@example.com';
    await prisma.customer.update({
      where: { id: created.id },
      data: { email: newEmail, emailNormalized: newEmail },
    });
    await projectCustomer360Event(prisma, {
      eventType: CUSTOMER_360_EVENTS.EMAIL_ADDED,
      organizationId: orgA.id,
      customerId: created.id,
      payload: { email: newEmail },
    });
    const emailAfter = await prisma.emailContact.findFirst({
      where: { organizationId: orgA.id, customerId: created.id, email: newEmail },
    });
    assert.ok(emailAfter, 'email marketing reads updated CRM email');

    const other = await prisma.customer.create({
      data: {
        organizationId: orgA.id,
        name: 'Tran B',
        email: 'b@example.com',
        emailNormalized: 'b@example.com',
        phone: '0987654321',
        phoneNormalized: '0987654321',
      },
    });
    const conflict = await prisma.customerIdentity.findUnique({
      where: {
        organizationId_kind_valueNormalized_channelAccountRef: {
          organizationId: orgA.id,
          kind: 'EMAIL',
          valueNormalized: 'b@example.com',
          channelAccountRef: '',
        },
      },
    });
    await projectCustomer360Event(prisma, {
      eventType: CUSTOMER_360_EVENTS.CREATED,
      organizationId: orgA.id,
      customerId: other.id,
    });
    const stillOther = await prisma.customer.findUnique({ where: { id: other.id } });
    assert.ok(stillOther?.isActive);
    assert.equal(conflict, null);

    // Cross-org isolation
    const spy = await prisma.emailContact.findMany({
      where: { organizationId: orgB.id, customerId: created.id },
    });
    assert.equal(spy.length, 0, 'no cross-org customerId leak');

    const orgBCust = await prisma.customer.create({
      data: {
        organizationId: orgB.id,
        name: 'Org B same phone',
        phone: phoneRaw,
        phoneNormalized: phone,
        email: emailNorm,
        emailNormalized: emailNorm,
      },
    });
    await projectCustomer360Event(prisma, {
      eventType: CUSTOMER_360_EVENTS.CREATED,
      organizationId: orgB.id,
      customerId: orgBCust.id,
    });
    const orgBEmail = await prisma.emailContact.findFirst({
      where: { organizationId: orgB.id, email: emailNorm },
    });
    assert.equal(orgBEmail?.customerId, orgBCust.id);
    const orgAEmail = await prisma.emailContact.findFirst({
      where: { organizationId: orgA.id, customerId: created.id, email: newEmail },
    });
    assert.ok(orgAEmail);

    // Outbox idempotency
    const key = `${CUSTOMER_360_EVENTS.CREATED}:${created.id}`;
    const first = await prisma.customerOutboxEvent.create({
      data: {
        organizationId: orgA.id,
        customerId: created.id,
        eventType: CUSTOMER_360_EVENTS.CREATED,
        idempotencyKey: key,
        payload: {},
      },
    });
    let dupFailed = false;
    try {
      await prisma.customerOutboxEvent.create({
        data: {
          organizationId: orgA.id,
          customerId: created.id,
          eventType: CUSTOMER_360_EVENTS.CREATED,
          idempotencyKey: key,
          payload: {},
        },
      });
    } catch {
      dupFailed = true;
    }
    assert.ok(dupFailed, 'duplicate outbox idempotencyKey rejected');
    await prisma.customerOutboxEvent.update({
      where: { id: first.id },
      data: { status: 'DONE', processedAt: new Date() },
    });
    await projectCustomer360Event(prisma, {
      eventType: CUSTOMER_360_EVENTS.CREATED,
      organizationId: orgA.id,
      customerId: created.id,
    });
    const contacts = await prisma.emailContact.count({
      where: { organizationId: orgA.id, customerId: created.id, email: newEmail },
    });
    assert.equal(contacts, 1, 'retry does not duplicate email contact');

    console.log('CUSTOMER_360_SYNC = PASS');
    console.log('FACEBOOK_APP_REVIEW_SAFE = PASS');
  } finally {
    await prisma.customerOutboxEvent.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.customerIdentity.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.emailContact.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.messagingContactIdentity.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.customer.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
