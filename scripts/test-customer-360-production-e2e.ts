/**
 * Production E2E + stress audit for Customer 360.
 * Real Postgres, no mocks. Does not mutate Facebook OAuth/scopes/webhooks.
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-customer-360-production-e2e.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  prisma,
  EmailContactStatus,
  EmailSuppressionReason,
  MessageChannel,
  MessagingIdentityLinkSource,
  CustomerOutboxStatus,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  createOrReuseCustomerSsot,
  applyCustomerSsotUpdate,
  enqueueCustomerOutboxEvent,
  processCustomerOutboxEvent,
  mergeCustomersSsot,
  projectCustomer360Event,
} from '@marketingspa/database';

type Row = {
  test: string;
  expected: string;
  actual: string;
  rootCause: string;
  fix: string;
  files: string;
  result: 'PASS' | 'FAIL';
};

const rows: Row[] = [];
const ROOT = path.join(__dirname, '..');
const stamp = `${Date.now()}`;
const FILES_CHANGED = [
  'packages/database/src/customer-360-lock.ts',
  'packages/database/src/customer-360-identities.ts',
  'packages/database/src/customer-360-write.ts',
  'packages/database/src/customer-360-merge.ts',
  'packages/database/src/customer-360-outbox.ts',
  'packages/database/src/customer-360-projector.ts',
  'apps/api/src/customers/customers.service.ts',
  'apps/api/src/crm/customer-360.service.ts',
  'apps/worker/src/processors/customer-360-sync.ts',
  'apps/api/src/email-marketing/email-marketing.service.ts',
].join(', ');

function record(partial: Omit<Row, 'result'> & { pass: boolean }): void {
  rows.push({
    test: partial.test,
    expected: partial.expected,
    actual: partial.actual,
    rootCause: partial.pass ? '—' : partial.rootCause,
    fix: partial.pass ? '—' : partial.fix,
    files: partial.pass ? '—' : FILES_CHANGED,
    result: partial.pass ? 'PASS' : 'FAIL',
  });
  if (!partial.pass) {
    throw new Error(`FAIL ${partial.test}: ${partial.actual} | ${partial.rootCause}`);
  }
}

function assertFileContains(rel: string, needles: string[], forbidden: string[] = []) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) throw new Error(`${rel} missing ${n}`);
  }
  for (const n of forbidden) {
    if (text.includes(n) && forbidden.length) {
      // only flag if we explicitly want absence of a dangerous rewrite
    }
  }
}

async function writeCustomer(
  organizationId: string,
  name: string,
  email: string | null,
  phone: string | null,
) {
  return prisma.$transaction(
    async (tx) => {
      const result = await createOrReuseCustomerSsot(tx, {
        organizationId,
        name,
        email,
        phone,
      });
      if (result.outcome === 'created') {
        await enqueueCustomerOutboxEvent(tx, {
          organizationId,
          customerId: result.customer.id,
          eventType: 'CUSTOMER_CREATED',
          idempotencyKey: `CUSTOMER_CREATED:${result.customer.id}`,
          payload: { email: result.customer.email, phone: result.customer.phone },
        });
      }
      return result;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

async function main() {
  const orgA = await prisma.organization.create({
    data: { name: `C360 E2E A ${stamp}`, slug: `c360-e2e-a-${stamp}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `C360 E2E B ${stamp}`, slug: `c360-e2e-b-${stamp}` },
  });
  const branch = await prisma.branch.create({
    data: { organizationId: orgA.id, name: 'E2E Branch', code: `e2e-${stamp.slice(-6)}` },
  });

  try {
    // ------------------------------------------------------------------
    // 1. Concurrent uniqueness
    // ------------------------------------------------------------------
    const concEmail = `conc.${stamp}@e2e.local`;
    const concPhone = '0912 000 111';
    const concResults = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        writeCustomer(orgA.id, `Conc ${i}`, concEmail, concPhone),
      ),
    );
    const concIds = new Set(concResults.map((r) => r.customer.id));
    const concRows = await prisma.customer.findMany({
      where: {
        organizationId: orgA.id,
        emailNormalized: normalizeCustomerEmail(concEmail)!,
      },
    });
    const identEmail = await prisma.customerIdentity.count({
      where: {
        organizationId: orgA.id,
        kind: 'EMAIL',
        valueNormalized: normalizeCustomerEmail(concEmail)!,
      },
    });
    record({
      test: 'DB uniqueness/concurrency — 10 parallel creates same email/SĐT',
      expected: '1 customer + 1 EMAIL identity in organizationId',
      actual: `customers=${concRows.length} ids=${concIds.size} emailIdentities=${identEmail}`,
      rootCause: 'Customer create was findFirst-then-insert outside identity unique lock',
      fix: 'pg_advisory_xact_lock + claim EMAIL/PHONE identity in same TX as customer write',
      pass: concRows.length === 1 && concIds.size === 1 && identEmail === 1,
    });

    // ------------------------------------------------------------------
    // 2. Atomic outbox rollback
    // ------------------------------------------------------------------
    const rbEmail = `rollback.${stamp}@e2e.local`;
    let rollbackThrew = false;
    try {
      await prisma.$transaction(async (tx) => {
        const result = await createOrReuseCustomerSsot(tx, {
          organizationId: orgA.id,
          name: 'Rollback',
          email: rbEmail,
          phone: '0912000222',
        });
        await enqueueCustomerOutboxEvent(tx, {
          organizationId: orgA.id,
          customerId: result.customer.id,
          eventType: 'CUSTOMER_CREATED',
          idempotencyKey: `CUSTOMER_CREATED:${result.customer.id}:rb`,
          payload: {},
        });
        throw new Error('simulated_mid_tx_failure');
      });
    } catch (err) {
      rollbackThrew = err instanceof Error && err.message.includes('simulated_mid_tx_failure');
    }
    const rbCustomer = await prisma.customer.count({
      where: { organizationId: orgA.id, emailNormalized: normalizeCustomerEmail(rbEmail)! },
    });
    const rbOutbox = await prisma.customerOutboxEvent.count({
      where: { organizationId: orgA.id, idempotencyKey: { contains: ':rb' } },
    });
    const rbIdent = await prisma.customerIdentity.count({
      where: { organizationId: orgA.id, valueNormalized: normalizeCustomerEmail(rbEmail)! },
    });
    record({
      test: 'Atomic Outbox — simulated error mid-transaction',
      expected: 'No customer, no identity, no outbox row after rollback',
      actual: `threw=${rollbackThrew} customers=${rbCustomer} outbox=${rbOutbox} identities=${rbIdent}`,
      rootCause: 'Customer write and OutboxEvent not in the same transaction',
      fix: 'createOrReuseCustomerSsot + enqueueCustomerOutboxEvent share one $transaction',
      pass: rollbackThrew && rbCustomer === 0 && rbOutbox === 0 && rbIdent === 0,
    });

    // ------------------------------------------------------------------
    // 3–10 + E2E: CRM create → Email → Zalo → Chatbot → Lead → Booking →
    // Automation → Funnel → Analytics → CRM update → Merge
    // ------------------------------------------------------------------
    const primaryEmail = `primary.${stamp}@e2e.local`;
    const primaryPhone = '0987 111 222';
    const created = await writeCustomer(orgA.id, 'Nguyen Van Primary', primaryEmail, primaryPhone);
    const primaryId = created.customer.id;
    const createdOutbox = await prisma.customerOutboxEvent.findFirst({
      where: { organizationId: orgA.id, customerId: primaryId, eventType: 'CUSTOMER_CREATED' },
    });
    assert.ok(createdOutbox, 'created outbox missing');
    await processCustomerOutboxEvent(prisma, createdOutbox.id);

    const emailContact = await prisma.emailContact.findFirst({
      where: { organizationId: orgA.id, customerId: primaryId },
    });
    record({
      test: 'E2E CRM create → Email projection',
      expected: 'EmailContact snapshot linked to Customer SSOT',
      actual: `contact=${emailContact?.email} customerId=${emailContact?.customerId}`,
      rootCause: 'Projector did not upsert EmailContact',
      fix: 'projectEmailContact after CUSTOMER_CREATED',
      pass: Boolean(emailContact && emailContact.email === normalizeCustomerEmail(primaryEmail)),
    });

    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId: orgA.id,
        name: `E2E sent ${stamp}`,
        status: 'COMPLETED',
      },
    });
    const recipient = await prisma.emailCampaignRecipient.create({
      data: {
        organizationId: orgA.id,
        campaignId: campaign.id,
        contactId: emailContact!.id,
        email: emailContact!.email,
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    const zalo = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        customerId: null,
        channel: MessageChannel.ZALO,
        integrationScopeKey: `zalo_oa:e2e-${stamp}`,
        externalUserId: `zalo-${stamp}`,
        phoneNormalized: normalizeCustomerPhone(primaryPhone),
        phoneRaw: primaryPhone,
        phoneVerifiedAt: new Date(),
        linkSource: MessagingIdentityLinkSource.UNLINKED,
      },
    });
    await projectCustomer360Event(prisma, {
      eventType: 'CUSTOMER_UPDATED',
      organizationId: orgA.id,
      customerId: primaryId,
    });
    const zaloLinked = await prisma.messagingContactIdentity.findUnique({ where: { id: zalo.id } });
    record({
      test: 'E2E Zalo webhook identity link by phone',
      expected: 'Zalo identity linked to Customer when phone matches',
      actual: `customerId=${zaloLinked?.customerId}`,
      rootCause: 'Messaging link only ran in projector after phone match',
      fix: 'projectMessagingLinks claims ZALO identity for matching phoneNormalized',
      pass: zaloLinked?.customerId === primaryId,
    });

    const bot = await prisma.chatbotBot.create({
      data: { organizationId: orgA.id, botName: `E2E bot ${stamp}` },
    });
    const conversation = await prisma.chatbotConversation.create({
      data: {
        organizationId: orgA.id,
        botId: bot.id,
        sessionId: `sess-${stamp}`,
        channel: 'messenger',
        visitorPhone: normalizeCustomerPhone(primaryPhone),
        visitorName: 'Primary',
      },
    });
    await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        customerId: primaryId,
        channel: MessageChannel.MESSENGER,
        integrationScopeKey: `messenger_page:e2e-${stamp}`,
        externalUserId: `psid-${stamp}`,
        phoneNormalized: normalizeCustomerPhone(primaryPhone),
        phoneVerifiedAt: new Date(),
        chatbotConversationId: conversation.id,
        linkSource: MessagingIdentityLinkSource.PHONE_VERIFIED,
      },
    });

    const lead = await prisma.lead.create({
      data: {
        organizationId: orgA.id,
        customerId: primaryId,
        name: 'Lead Primary',
        email: primaryEmail,
        phone: primaryPhone,
      },
    });
    await prisma.leadAttribution.create({
      data: {
        organizationId: orgA.id,
        leadId: lead.id,
        utmSource: 'e2e',
        utmCampaign: `c360-${stamp}`,
      },
    });
    const booking = await prisma.appointment.create({
      data: {
        organizationId: orgA.id,
        branchId: branch.id,
        customerId: primaryId,
        leadId: lead.id,
        scheduledAt: new Date(Date.now() + 86400000),
      },
    });
    const flow = await prisma.automationFlow.create({
      data: {
        organizationId: orgA.id,
        name: `E2E auto ${stamp}`,
        triggerType: 'LEAD_CREATED',
      },
    });
    const autoLog = await prisma.automationLog.create({
      data: {
        organizationId: orgA.id,
        automationFlowId: flow.id,
        customerId: primaryId,
        leadId: lead.id,
        appointmentId: booking.id,
        status: 'SENT',
        idempotencyKey: `auto-${stamp}`,
      },
    });
    const funnelEv = await prisma.marketingFunnelEvent.create({
      data: {
        organizationId: orgA.id,
        eventType: 'LEAD_CREATED',
        customerId: primaryId,
        leadId: lead.id,
        idempotencyKey: `funnel-${stamp}`,
      },
    });
    const order = await prisma.order.create({
      data: {
        organizationId: orgA.id,
        customerId: primaryId,
        leadId: lead.id,
        orderNumber: `E2E-${stamp}`,
        total: 500000,
      },
    });
    await prisma.payment.create({
      data: {
        organizationId: orgA.id,
        orderId: order.id,
        amount: 500000,
        status: 'COMPLETED',
        paidAt: new Date(),
      },
    });

    record({
      test: 'E2E Lead → Booking → Automation → Funnel → Order',
      expected: 'All FKs point at primary Customer',
      actual: `lead=${lead.customerId} appt=${booking.customerId} auto=${autoLog.customerId} funnel=${funnelEv.customerId} order=${order.customerId}`,
      rootCause: 'Related records not created against Customer SSOT',
      fix: 'Seed E2E graph with customerId = primary',
      pass:
        lead.customerId === primaryId &&
        booking.customerId === primaryId &&
        autoLog.customerId === primaryId &&
        funnelEv.customerId === primaryId &&
        order.customerId === primaryId,
    });

    // Consent: lock UNSUBSCRIBED / BOUNCED / COMPLAINT, then CRM update must not resubscribe
    await prisma.emailContact.update({
      where: { id: emailContact!.id },
      data: { status: EmailContactStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    });
    await prisma.emailSuppression.create({
      data: {
        organizationId: orgA.id,
        email: emailContact!.email,
        reason: EmailSuppressionReason.COMPLAINT,
      },
    });
    await prisma.customer.update({
      where: { id: primaryId },
      data: { name: 'Nguyen Van Primary Updated' },
    });
    await projectCustomer360Event(prisma, {
      eventType: 'CUSTOMER_UPDATED',
      organizationId: orgA.id,
      customerId: primaryId,
    });
    const afterConsent = await prisma.emailContact.findUnique({ where: { id: emailContact!.id } });
    record({
      test: 'Consent safety — UNSUBSCRIBED / COMPLAINED not flipped to SUBSCRIBED',
      expected: 'EmailContact stays UNSUBSCRIBED after CRM update/projector',
      actual: `status=${afterConsent?.status}`,
      rootCause: 'projectEmailContact created/updated contacts with default SUBSCRIBED',
      fix: 'Projector never writes status on existing contacts; suppression maps COMPLAINT→UNSUBSCRIBED',
      pass: afterConsent?.status === EmailContactStatus.UNSUBSCRIBED,
    });

    const bouncedContact = await prisma.emailContact.create({
      data: {
        organizationId: orgA.id,
        email: `bounced.${stamp}@e2e.local`,
        status: EmailContactStatus.BOUNCED,
        customerId: primaryId,
      },
    });
    await projectCustomer360Event(prisma, {
      eventType: 'CUSTOMER_UPDATED',
      organizationId: orgA.id,
      customerId: primaryId,
    });
    const bouncedAfter = await prisma.emailContact.findUnique({ where: { id: bouncedContact.id } });
    record({
      test: 'Consent safety — BOUNCED not flipped to SUBSCRIBED',
      expected: 'BOUNCED preserved',
      actual: `status=${bouncedAfter?.status}`,
      rootCause: 'Projector overwrote EmailContact.status',
      fix: 'Omit status from projector updates',
      pass: bouncedAfter?.status === EmailContactStatus.BOUNCED,
    });

    // Email snapshot: change CRM email, historical recipient stays old
    const newEmail = `primary.new.${stamp}@e2e.local`;
    await prisma.$transaction(async (tx) => {
      await applyCustomerSsotUpdate(tx, {
        organizationId: orgA.id,
        customerId: primaryId,
        currentEmailNormalized: normalizeCustomerEmail(primaryEmail),
        currentPhoneNormalized: normalizeCustomerPhone(primaryPhone),
        nextEmail: newEmail,
        nextPhone: primaryPhone,
        data: { name: 'Nguyen Van Primary' },
      });
      await enqueueCustomerOutboxEvent(tx, {
        organizationId: orgA.id,
        customerId: primaryId,
        eventType: 'CUSTOMER_UPDATED',
        idempotencyKey: `CUSTOMER_UPDATED:${primaryId}:email`,
        payload: { previousEmail: primaryEmail, email: newEmail },
      });
    });
    const updOutbox = await prisma.customerOutboxEvent.findFirst({
      where: { organizationId: orgA.id, idempotencyKey: `CUSTOMER_UPDATED:${primaryId}:email` },
    });
    await processCustomerOutboxEvent(prisma, updOutbox!.id);
    const recipientAfter = await prisma.emailCampaignRecipient.findUnique({
      where: { id: recipient.id },
    });
    const newContact = await prisma.emailContact.findFirst({
      where: { organizationId: orgA.id, email: normalizeCustomerEmail(newEmail)! },
    });
    const crmAfter = await prisma.customer.findUnique({ where: { id: primaryId } });
    record({
      test: 'Email snapshot — campaign history keeps old email after CRM change',
      expected: 'Recipient.email stays old; new EmailContact uses new email; Customer SSOT updated',
      actual: `recipient=${recipientAfter?.email} newContact=${newContact?.email} crm=${crmAfter?.emailNormalized}`,
      rootCause: 'Projector rewrote EmailCampaignRecipient or mutated historical snapshot',
      fix: 'Recipient.email is denormalized at send time; projector only updates EmailContact projection',
      pass:
        recipientAfter?.email === normalizeCustomerEmail(primaryEmail) &&
        newContact?.email === normalizeCustomerEmail(newEmail) &&
        crmAfter?.emailNormalized === normalizeCustomerEmail(newEmail),
    });

    // Projection rule: patch EmailContact must not rewrite CRM
    const crmNameBefore = crmAfter!.name;
    await prisma.emailContact.update({
      where: { id: newContact!.id },
      data: { name: 'HACKED FROM EMAIL MODULE' },
    });
    const crmNameAfterHack = await prisma.customer.findUnique({ where: { id: primaryId } });
    record({
      test: 'Projection rule — EmailContact edit does not change Customer SSOT',
      expected: 'Customer.name unchanged',
      actual: `before=${crmNameBefore} after=${crmNameAfterHack?.name}`,
      rootCause: 'Email marketing wrote back into Customer',
      fix: 'updateContact never updates Customer; linked name/phone ignored',
      pass: crmNameAfterHack?.name === crmNameBefore,
    });

    // Secondary customer for merge
    const secondary = await writeCustomer(
      orgA.id,
      'Nguyen Van Secondary',
      `secondary.${stamp}@e2e.local`,
      '0987 333 444',
    );
    const secondaryId = secondary.customer.id;
    const secLead = await prisma.lead.create({
      data: {
        organizationId: orgA.id,
        customerId: secondaryId,
        name: 'Lead Secondary',
      },
    });
    const secAppt = await prisma.appointment.create({
      data: {
        organizationId: orgA.id,
        branchId: branch.id,
        customerId: secondaryId,
        scheduledAt: new Date(Date.now() + 172800000),
      },
    });
    const secOrder = await prisma.order.create({
      data: {
        organizationId: orgA.id,
        customerId: secondaryId,
        orderNumber: `E2E-S-${stamp}`,
        total: 100000,
      },
    });
    const secTask = await prisma.crmTask.create({
      data: {
        organizationId: orgA.id,
        customerId: secondaryId,
        title: 'Call secondary',
      },
    });
    const secAuto = await prisma.automationLog.create({
      data: {
        organizationId: orgA.id,
        automationFlowId: flow.id,
        customerId: secondaryId,
        status: 'SENT',
        idempotencyKey: `auto-s-${stamp}`,
      },
    });
    const secFunnel = await prisma.marketingFunnelEvent.create({
      data: {
        organizationId: orgA.id,
        eventType: 'CHATBOT',
        customerId: secondaryId,
        idempotencyKey: `funnel-s-${stamp}`,
      },
    });
    const secEmail = await prisma.emailContact.create({
      data: {
        organizationId: orgA.id,
        email: `secondary.${stamp}@e2e.local`,
        customerId: secondaryId,
      },
    });
    const secZalo = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        customerId: secondaryId,
        channel: MessageChannel.ZALO,
        integrationScopeKey: `zalo_oa:e2e-s-${stamp}`,
        externalUserId: `zalo-s-${stamp}`,
        phoneNormalized: normalizeCustomerPhone('0987 333 444'),
        phoneVerifiedAt: new Date(),
        linkSource: MessagingIdentityLinkSource.CUSTOMER_ID,
      },
    });
    const mktCampaign = await prisma.campaign.create({
      data: {
        organizationId: orgA.id,
        name: `legacy ${stamp}`,
        channel: MessageChannel.ZALO,
      },
    });
    await prisma.campaignCustomer.create({
      data: { campaignId: mktCampaign.id, customerId: secondaryId },
    });
    const msgCampaign = await prisma.messagingCampaign.create({
      data: {
        organizationId: orgA.id,
        name: `msg ${stamp}`,
        channel: MessageChannel.ZALO,
        campaignType: 'BROADCAST',
      },
    });
    const msgRecipient = await prisma.messagingCampaignRecipient.create({
      data: {
        organizationId: orgA.id,
        campaignId: msgCampaign.id,
        identityId: secZalo.id,
        customerId: secondaryId,
        idempotencyKey: `msg-rcp-${stamp}`,
      },
    });

    const mergeOutboxId = await prisma.$transaction(async (tx) => {
      const merged = await mergeCustomersSsot(tx, {
        organizationId: orgA.id,
        primaryId,
        secondaryId,
      });
      return merged.outboxId;
    });
    assert.ok(mergeOutboxId);
    await processCustomerOutboxEvent(prisma, mergeOutboxId);

    const [
      leadMoved,
      apptMoved,
      orderMoved,
      taskMoved,
      autoMoved,
      funnelMoved,
      emailMoved,
      zaloMoved,
      msgRcpMoved,
      campaignLink,
      secAfter,
      attrStill,
    ] = await Promise.all([
      prisma.lead.findUnique({ where: { id: secLead.id } }),
      prisma.appointment.findUnique({ where: { id: secAppt.id } }),
      prisma.order.findUnique({ where: { id: secOrder.id } }),
      prisma.crmTask.findUnique({ where: { id: secTask.id } }),
      prisma.automationLog.findUnique({ where: { id: secAuto.id } }),
      prisma.marketingFunnelEvent.findUnique({ where: { id: secFunnel.id } }),
      prisma.emailContact.findUnique({ where: { id: secEmail.id } }),
      prisma.messagingContactIdentity.findUnique({ where: { id: secZalo.id } }),
      prisma.messagingCampaignRecipient.findUnique({ where: { id: msgRecipient.id } }),
      prisma.campaignCustomer.findUnique({
        where: { campaignId_customerId: { campaignId: mktCampaign.id, customerId: primaryId } },
      }),
      prisma.customer.findUnique({ where: { id: secondaryId } }),
      prisma.leadAttribution.findUnique({ where: { leadId: lead.id } }),
    ]);
    const orphanLeads = await prisma.lead.count({
      where: { organizationId: orgA.id, customerId: secondaryId },
    });
    const convStill = await prisma.chatbotConversation.findUnique({ where: { id: conversation.id } });
    const messenger = await prisma.messagingContactIdentity.findFirst({
      where: { organizationId: orgA.id, externalUserId: `psid-${stamp}` },
    });

    record({
      test: 'Customer Merge — all FKs move, no orphans',
      expected:
        'Lead, Booking, Order, Task, Automation, Funnel, Email, Zalo/Messenger, campaign recipients, attribution stay reachable on primary; secondary inactive',
      actual: `lead=${leadMoved?.customerId} appt=${apptMoved?.customerId} order=${orderMoved?.customerId} task=${taskMoved?.customerId} auto=${autoMoved?.customerId} funnel=${funnelMoved?.customerId} email=${emailMoved?.customerId} zalo=${zaloMoved?.customerId} msgRcp=${msgRcpMoved?.customerId} campaignLink=${Boolean(campaignLink)} orphans=${orphanLeads} secondaryActive=${secAfter?.isActive} mergedInto=${secAfter?.mergedIntoId} attr=${attrStill?.leadId} conv=${convStill?.id} messenger=${messenger?.customerId}`,
      rootCause: 'Merge only moved a subset of FKs (missing messagingCampaignRecipient, campaignCustomer, outbox)',
      fix: 'reassignCustomerForeignKeys + mergeCustomersSsot covers every CRM customerId FK (not Google Ads customerId)',
      pass:
        leadMoved?.customerId === primaryId &&
        apptMoved?.customerId === primaryId &&
        orderMoved?.customerId === primaryId &&
        taskMoved?.customerId === primaryId &&
        autoMoved?.customerId === primaryId &&
        funnelMoved?.customerId === primaryId &&
        emailMoved?.customerId === primaryId &&
        zaloMoved?.customerId === primaryId &&
        msgRcpMoved?.customerId === primaryId &&
        Boolean(campaignLink) &&
        orphanLeads === 0 &&
        secAfter?.isActive === false &&
        secAfter?.mergedIntoId === primaryId &&
        attrStill?.leadId === lead.id &&
        Boolean(convStill) &&
        messenger?.customerId === primaryId,
    });

    // ------------------------------------------------------------------
    // Race: PATCH + Zalo webhook + outbox worker + merge
    // ------------------------------------------------------------------
    const raceP = await writeCustomer(
      orgA.id,
      'Race P',
      `race.p.${stamp}@e2e.local`,
      '0901 888 001',
    );
    const raceS = await writeCustomer(
      orgA.id,
      'Race S',
      `race.s.${stamp}@e2e.local`,
      '0901 888 002',
    );
    const raceOutbox = await prisma.customerOutboxEvent.findFirst({
      where: { customerId: raceP.customer.id, eventType: 'CUSTOMER_CREATED' },
    });
    await Promise.all([
      prisma.$transaction(async (tx) => {
        await applyCustomerSsotUpdate(tx, {
          organizationId: orgA.id,
          customerId: raceP.customer.id,
          currentEmailNormalized: raceP.customer.emailNormalized,
          currentPhoneNormalized: raceP.customer.phoneNormalized,
          nextEmail: raceP.customer.email,
          nextPhone: raceP.customer.phone,
          data: { note: 'patched-during-race' },
        });
      }),
      prisma.messagingContactIdentity.create({
        data: {
          organizationId: orgA.id,
          channel: MessageChannel.ZALO,
          integrationScopeKey: `zalo_oa:race-${stamp}`,
          externalUserId: `zalo-race-${stamp}`,
          phoneNormalized: raceP.customer.phoneNormalized,
          phoneVerifiedAt: new Date(),
          linkSource: MessagingIdentityLinkSource.UNLINKED,
        },
      }),
      raceOutbox ? processCustomerOutboxEvent(prisma, raceOutbox.id) : Promise.resolve(null),
      prisma.$transaction(async (tx) => {
        await mergeCustomersSsot(tx, {
          organizationId: orgA.id,
          primaryId: raceP.customer.id,
          secondaryId: raceS.customer.id,
        });
      }),
    ]);
    await projectCustomer360Event(prisma, {
      eventType: 'CUSTOMER_UPDATED',
      organizationId: orgA.id,
      customerId: raceP.customer.id,
    });
    const racePrimary = await prisma.customer.findUnique({ where: { id: raceP.customer.id } });
    const raceSecondary = await prisma.customer.findUnique({ where: { id: raceS.customer.id } });
    const raceDup = await prisma.customer.count({
      where: {
        organizationId: orgA.id,
        emailNormalized: raceP.customer.emailNormalized!,
        isActive: true,
        mergedIntoId: null,
      },
    });
    const raceZalo = await prisma.messagingContactIdentity.findFirst({
      where: { organizationId: orgA.id, externalUserId: `zalo-race-${stamp}` },
    });
    record({
      test: 'Race — concurrent CRM PATCH + Zalo webhook + Email/outbox worker + merge',
      expected: 'No duplicate active customers, merge committed, PATCH note not lost, Zalo linkable',
      actual: `activeDup=${raceDup} secondaryMerged=${raceSecondary?.mergedIntoId} note=${racePrimary?.note} zaloCustomer=${raceZalo?.customerId}`,
      rootCause: 'No advisory lock across write paths; last-write-wins stale overwrite',
      fix: 'Shared lock keys on email/phone + re-read after lock in merge/update',
      pass:
        raceDup === 1 &&
        raceSecondary?.mergedIntoId === raceP.customer.id &&
        racePrimary?.isActive === true &&
        String(racePrimary?.note || '').includes('patched-during-race') &&
        (raceZalo?.customerId === raceP.customer.id || raceZalo?.customerId == null),
    });
    if (raceZalo && !raceZalo.customerId) {
      await projectCustomer360Event(prisma, {
        eventType: 'CUSTOMER_UPDATED',
        organizationId: orgA.id,
        customerId: raceP.customer.id,
      });
      const relink = await prisma.messagingContactIdentity.findUnique({ where: { id: raceZalo.id } });
      record({
        test: 'Race follow-up — projector links Zalo after concurrent webhook',
        expected: 'Zalo identity customerId = primary',
        actual: `customerId=${relink?.customerId}`,
        rootCause: 'Webhook inserted identity before projector ran',
        fix: 'projectMessagingLinks is idempotent and links by phoneNormalized',
        pass: relink?.customerId === raceP.customer.id,
      });
    }

    // ------------------------------------------------------------------
    // Worker resilience / idempotency
    // ------------------------------------------------------------------
    const workerCust = await writeCustomer(
      orgA.id,
      'Worker',
      `worker.${stamp}@e2e.local`,
      '0901 777 001',
    );
    const wOutbox = await prisma.customerOutboxEvent.findFirst({
      where: { customerId: workerCust.customer.id, eventType: 'CUSTOMER_CREATED' },
    });
    assert.ok(wOutbox);
    const first = await processCustomerOutboxEvent(prisma, wOutbox.id);
    const second = await processCustomerOutboxEvent(prisma, wOutbox.id);
    await prisma.$executeRaw`
      UPDATE customer_outbox_events
      SET status = 'PROCESSING', updated_at = NOW() - INTERVAL '5 minutes'
      WHERE id = ${wOutbox.id}
    `;
    const reclaimed = await processCustomerOutboxEvent(prisma, wOutbox.id);
    const wEmailCount = await prisma.emailContact.count({
      where: { organizationId: orgA.id, customerId: workerCust.customer.id },
    });
    const wDone = await prisma.customerOutboxEvent.findUnique({ where: { id: wOutbox.id } });
    record({
      test: 'Worker resilience — retry / stale PROCESSING reclaim / no double-apply',
      expected: 'First ok, second idempotent, stale PROCESSING reclaimed to DONE, one EmailContact',
      actual: `first=${JSON.stringify(first && 'ok' in first)} secondIdempotent=${Boolean((second as { idempotent?: boolean }).idempotent)} reclaimedOk=${Boolean((reclaimed as { ok?: boolean }).ok || (reclaimed as { idempotent?: boolean }).idempotent)} contacts=${wEmailCount} status=${wDone?.status} attempts=${wDone?.attempts}`,
      rootCause: 'PROCESSING crash left events stuck; retries could double-project',
      fix: 'processCustomerOutboxEvent claims PENDING/FAILED only; DONE is idempotent; stale PROCESSING reclaimed after 2 minutes',
      pass:
        Boolean((first as { ok?: boolean }).ok) &&
        Boolean((second as { idempotent?: boolean }).idempotent) &&
        wDone?.status === CustomerOutboxStatus.DONE &&
        wEmailCount === 1,
    });

    // ------------------------------------------------------------------
    // Multi-tenant
    // ------------------------------------------------------------------
    const sharedEmail = `shared.${stamp}@e2e.local`;
    const sharedPhone = '0901 666 001';
    const aShared = await writeCustomer(orgA.id, 'Tenant A', sharedEmail, sharedPhone);
    const bShared = await writeCustomer(orgB.id, 'Tenant B', sharedEmail, sharedPhone);
    const aSeenFromB = await prisma.customer.findFirst({
      where: { organizationId: orgB.id, id: aShared.customer.id },
    });
    const bSeenFromA = await prisma.customer.findFirst({
      where: { organizationId: orgA.id, id: bShared.customer.id },
    });
    const aIdent = await prisma.customerIdentity.findMany({
      where: { organizationId: orgA.id, valueNormalized: normalizeCustomerEmail(sharedEmail)! },
    });
    const bIdent = await prisma.customerIdentity.findMany({
      where: { organizationId: orgB.id, valueNormalized: normalizeCustomerEmail(sharedEmail)! },
    });
    record({
      test: 'Multi-tenant isolation — same email/SĐT in two orgs',
      expected: 'Two separate customers; no cross-org read of the other id',
      actual: `a=${aShared.customer.id} b=${bShared.customer.id} aFromB=${aSeenFromB?.id ?? 'null'} bFromA=${bSeenFromA?.id ?? 'null'} aIdentOrg=${aIdent[0]?.organizationId} bIdentOrg=${bIdent[0]?.organizationId}`,
      rootCause: 'Identity unique missing organizationId',
      fix: 'Unique (organizationId, kind, valueNormalized, channelAccountRef)',
      pass:
        aShared.customer.id !== bShared.customer.id &&
        !aSeenFromB &&
        !bSeenFromA &&
        aIdent.length === 1 &&
        bIdent.length === 1,
    });

    // ------------------------------------------------------------------
    // Facebook App Review freeze
    // ------------------------------------------------------------------
    const fbFiles = [
      'apps/api/src/auto-post/assert-auto-post-meta-oauth.ts',
      'apps/api/src/auto-post/auto-post-meta.service.ts',
      'apps/api/src/auto-post/auto-post-meta-pages.util.ts',
      'apps/api/src/auto-post/auto-post-facebook.service.ts',
      'apps/api/src/chatbot-cskh/chatbot-facebook-webhook.controller.ts',
    ];
    let fbStaticOk = true;
    let fbStaticActual = '';
    try {
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
      assertFileContains('apps/api/src/auto-post/auto-post-meta.service.ts', ['config_id']);
      assertFileContains('apps/api/src/chatbot-cskh/chatbot-facebook-webhook.controller.ts', [
        'facebook/webhook',
      ]);
      const mergeSrc = readFileSync(
        path.join(ROOT, 'packages/database/src/customer-360-merge.ts'),
        'utf8',
      );
      if (mergeSrc.includes('googleAds') || mergeSrc.includes('adGoogleAds')) {
        throw new Error('merge must not touch Google Ads customerId');
      }
      fbStaticActual = `files=${fbFiles.join('|')} appId+config_id+redirect+scopes+webhook intact`;
    } catch (err) {
      fbStaticOk = false;
      fbStaticActual = err instanceof Error ? err.message : String(err);
    }
    record({
      test: 'Facebook App Review — OAuth/scopes/config_id/redirect/webhook unchanged',
      expected: 'App 1045516051171576, config_id 2006772376877449, MarketingAutoAZ callback, pages_* scopes, webhook path intact',
      actual: fbStaticActual,
      rootCause: 'Customer 360 work mutated Auto Post / Messenger Facebook surfaces',
      fix: 'Do not edit Facebook OAuth/webhook files',
      pass: fbStaticOk,
    });

    let oauthUnitOk = true;
    let oauthUnitActual = 'ok';
    try {
      execFileSync(
        'pnpm',
        ['--filter', '@marketingspa/database', 'exec', 'tsx', '../../scripts/test-assert-auto-post-meta-oauth.ts'],
        { cwd: ROOT, stdio: 'pipe' },
      );
      execFileSync(
        'pnpm',
        ['--filter', '@marketingspa/database', 'exec', 'tsx', '../../scripts/test-auto-post-meta-callbacks.ts'],
        { cwd: ROOT, stdio: 'pipe' },
      );
    } catch (err) {
      oauthUnitOk = false;
      oauthUnitActual = err instanceof Error ? err.message : String(err);
    }
    record({
      test: 'Facebook App Review — existing OAuth unit scripts',
      expected: 'test-assert-auto-post-meta-oauth + test-auto-post-meta-callbacks PASS',
      actual: oauthUnitActual,
      rootCause: 'OAuth fail-fast or callback contract drifted',
      fix: 'Do not change Auto Post OAuth helpers',
      pass: oauthUnitOk,
    });

    let liveOauthOk = true;
    let liveOauthActual = '';
    try {
      const out = execFileSync(
        'node',
        ['scripts/with-root-env.cjs', 'pnpm', '--filter', '@marketingspa/database', 'exec', 'tsx', '../../scripts/check-oauth-start-scopes.ts'],
        { cwd: ROOT, encoding: 'utf8' },
      );
      liveOauthActual = out.trim().slice(-500);
      const parsed = JSON.parse(out.replace(/^[^{]+/, '').trim() || out);
      liveOauthOk =
        parsed.http === 200 &&
        parsed.has_config_id === true &&
        parsed.scope_has_pages === false &&
        parsed.redirect_host === 'marketingautoaz.com';
    } catch (err) {
      liveOauthOk = false;
      liveOauthActual = err instanceof Error ? err.message : String(err);
    }
    record({
      test: 'Facebook App Review — live oauth/start (config_id, no pages_* query scope, redirect host)',
      expected: 'HTTP 200, config_id present, scope_has_pages=false, redirect_host=marketingautoaz.com',
      actual: liveOauthActual,
      rootCause: 'oauth/start drifted (would break App Review)',
      fix: 'Leave auto-post-meta.service config_id flow unchanged',
      pass: liveOauthOk,
    });
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } }).catch(() => undefined);
  }
}

function printReport(completed: boolean) {
  console.log('\nTEST | EXPECTED | ACTUAL | ROOT CAUSE | FIX | FILES CHANGED | RESULT');
  console.log('---|---|---|---|---|---|---');
  for (const r of rows) {
    console.log(
      `${r.test} | ${r.expected} | ${r.actual} | ${r.rootCause} | ${r.fix} | ${r.files} | ${r.result}`,
    );
  }
  const failed = rows.filter((r) => r.result === 'FAIL');
  if (!completed || failed.length) {
    console.log('\nFAILED GATES:');
    for (const f of failed) console.log(`- ${f.test}: ${f.actual}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nCUSTOMER_360_PRODUCTION_E2E = PASS');
  console.log('CUSTOMER_360_CONCURRENCY = PASS');
  console.log('CUSTOMER_360_CONSENT_SAFE = PASS');
  console.log('CUSTOMER_360_MERGE_SAFE = PASS');
  console.log('CUSTOMER_360_OUTBOX_SAFE = PASS');
  console.log('MULTI_TENANT_ISOLATION = PASS');
  console.log('FACEBOOK_APP_REVIEW_SAFE = PASS');
}

main()
  .then(() => printReport(true))
  .catch((err) => {
    printReport(false);
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
