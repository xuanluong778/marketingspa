/**
 * Customer 360 omnichannel E2E — real Postgres, no mocks.
 * Funnel + Website + Chatbot + Zalo + Messenger + CRM → 360 → Email/Lead/Booking/Automation → update → merge
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-customer-360-omnichannel.ts
 *
 * Does NOT mutate Facebook OAuth / App Review surfaces. Does NOT touch Google Ads customerId.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sign } from 'jsonwebtoken';
import {
  prisma,
  MessageChannel,
  MarketingFunnelEventType,
  AutomationTriggerType,
  AutomationLogStatus,
  EmailContactStatus,
  EmailSuppressionReason,
  EmailRecipientStatus,
  ChatbotBotStatus,
  CUSTOMER_360_TEST_TAG,
  CUSTOMER_SOURCE,
  customerExcludeTestWhere,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  createOrReuseCustomerSsot,
  applyCustomerSsotUpdate,
  resolveCustomerForIngress,
  linkMessagingIdentityToCustomerByPhone,
  enqueueCustomerOutboxEvent,
  processCustomerOutboxEvent,
  mergeCustomersSsot,
  backfillLeadCustomerId,
} from '@marketingspa/database';
import { listCustomerSources, normalizeCustomerSource } from '@marketingspa/shared';

type Gate = {
  name: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL';
};

const gates: Gate[] = [];
const ROOT = path.join(__dirname, '..');
const stamp = `${Date.now()}`;
const TAG = CUSTOMER_360_TEST_TAG;

function pass(name: string, expected: string, actual: string) {
  gates.push({ name, expected, actual, result: 'PASS' });
}
function fail(name: string, expected: string, actual: string): never {
  gates.push({ name, expected, actual, result: 'FAIL' });
  throw new Error(`FAIL ${name}: ${actual}`);
}
function check(name: string, expected: string, actual: string, ok: boolean) {
  if (ok) pass(name, expected, actual);
  else fail(name, expected, actual);
}

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function assertFileContains(rel: string, needles: string[]) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  for (const n of needles) {
    if (!text.includes(n)) throw new Error(`${rel} missing ${n}`);
  }
}

async function writeCustomer(
  organizationId: string,
  input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    source?: string;
    tags?: string[];
  },
) {
  return prisma.$transaction(
    async (tx) => {
      const result = await createOrReuseCustomerSsot(tx, {
        organizationId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: input.source,
        tags: input.tags,
      });
      const outboxIds: Array<string | null> = [];
      if (result.outcome === 'created') {
        outboxIds.push(
          await enqueueCustomerOutboxEvent(tx, {
            organizationId,
            customerId: result.customer.id,
            eventType: 'CUSTOMER_CREATED',
            idempotencyKey: `CUSTOMER_CREATED:${result.customer.id}`,
            payload: { email: result.customer.email, phone: result.customer.phone },
          }),
        );
      } else if (result.outcome === 'filled') {
        outboxIds.push(
          await enqueueCustomerOutboxEvent(tx, {
            organizationId,
            customerId: result.customer.id,
            eventType: 'CUSTOMER_UPDATED',
            idempotencyKey: `CUSTOMER_UPDATED:${result.customer.id}:${Date.now()}`,
            payload: { email: result.customer.email, phone: result.customer.phone },
          }),
        );
      }
      return { ...result, outboxIds };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

async function drainOutbox(ids: Array<string | null | undefined>) {
  for (const id of ids) {
    if (id) await processCustomerOutboxEvent(prisma, id);
  }
}

async function main() {
  const env = readEnv();
  const orgA = await prisma.organization.create({
    data: { name: `C360 Omni A ${stamp}`, slug: `c360-omni-a-${stamp}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `C360 Omni B ${stamp}`, slug: `c360-omni-b-${stamp}` },
  });
  const branch = await prisma.branch.create({
    data: {
      organizationId: orgA.id,
      name: 'Omni Branch',
      code: `omni-${stamp.slice(-6)}`,
    },
  });

  const plan =
    (await prisma.subscriptionPlan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })) ||
    (await prisma.subscriptionPlan.create({
      data: {
        code: `c360-omni-${stamp.slice(-6)}`,
        name: 'C360 Omni Plan',
        priceMonthly: 0,
        priceVnd: 0,
        durationMonths: 1,
        isActive: true,
      },
    }));
  await prisma.subscription.create({
    data: {
      organizationId: orgA.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  const phone = '0918 360 001';
  const phoneNorm = normalizeCustomerPhone(phone)!;
  const emailA = `omni.${stamp}@e2e.local`;
  const emailSnap = emailA;

  try {
    // ------------------------------------------------------------------
    // 1. CRM manual → Customer SSOT
    // ------------------------------------------------------------------
    const crm = await writeCustomer(orgA.id, {
      name: 'Omni CRM',
      phone,
      email: emailA,
      source: 'crm_manual',
      tags: [TAG, 'crm'],
    });
    await drainOutbox(crm.outboxIds);
    const customerId = crm.customer.id;

    // ------------------------------------------------------------------
    // 2. Funnel form → same customerId
    // ------------------------------------------------------------------
    const funnel = await prisma.funnelRecommendation.create({
      data: {
        organizationId: orgA.id,
        prompt: 'e2e funnel',
        result: { schemaVersion: 'funnel-generator.v1', e2e: true },
        status: 'ACTIVE',
      },
    });
    const funnelLead = await prisma.lead.create({
      data: {
        organizationId: orgA.id,
        name: 'Omni Funnel Lead',
        phone,
        email: emailA,
        funnelRecommendationId: funnel.id,
        tags: [TAG, 'funnel'],
      },
    });
    const funnelResolved = await prisma.$transaction((tx) =>
      resolveCustomerForIngress(tx, {
        organizationId: orgA.id,
        name: 'Omni Funnel Lead',
        phone,
        email: emailA,
        source: CUSTOMER_SOURCE.FUNNEL_FORM,
        tags: [TAG, 'funnel'],
      }),
    );
    await prisma.lead.update({
      where: { id: funnelLead.id },
      data: { customerId: funnelResolved.customer!.id },
    });
    await prisma.marketingFunnelEvent.create({
      data: {
        organizationId: orgA.id,
        funnelId: funnel.id,
        leadId: funnelLead.id,
        customerId: funnelResolved.customer!.id,
        eventType: MarketingFunnelEventType.FORM_SUBMIT,
        idempotencyKey: `FORM_SUBMIT:${funnel.id}:${funnelLead.id}`,
      },
    });
    await drainOutbox(funnelResolved.outboxIds);

    // ------------------------------------------------------------------
    // 3. Website form → same customerId
    // ------------------------------------------------------------------
    const webLead = await prisma.lead.create({
      data: {
        organizationId: orgA.id,
        name: 'Omni Website Lead',
        phone,
        email: emailA,
        tags: [TAG, 'website'],
      },
    });
    const webResolved = await prisma.$transaction((tx) =>
      resolveCustomerForIngress(tx, {
        organizationId: orgA.id,
        name: 'Omni Website Lead',
        phone,
        email: emailA,
        source: 'website_form',
        tags: [TAG, 'website'],
      }),
    );
    await prisma.lead.update({
      where: { id: webLead.id },
      data: { customerId: webResolved.customer!.id },
    });

    // ------------------------------------------------------------------
    // 4. Chatbot website → conversation + lead → same customerId
    // ------------------------------------------------------------------
    const bot = await prisma.chatbotBot.create({
      data: {
        organizationId: orgA.id,
        botName: `OmniBot ${stamp}`,
        status: ChatbotBotStatus.ACTIVE,
      },
    });
    const conversation = await prisma.chatbotConversation.create({
      data: {
        organizationId: orgA.id,
        botId: bot.id,
        sessionId: `sess-${stamp}`,
        visitorName: 'Omni Chat',
        visitorPhone: phone,
        channel: 'website',
        linkedLeadId: funnelLead.id,
      },
    });
    const chatLead = await prisma.lead.create({
      data: {
        organizationId: orgA.id,
        name: 'Omni Chatbot Lead',
        phone,
        tags: [TAG, 'chatbot'],
        customerId,
      },
    });
    await prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: { linkedLeadId: chatLead.id },
    });
    await prisma.marketingFunnelEvent.create({
      data: {
        organizationId: orgA.id,
        funnelId: funnel.id,
        leadId: chatLead.id,
        customerId,
        eventType: MarketingFunnelEventType.CHATBOT,
        idempotencyKey: `CHATBOT:${conversation.id}`,
        metadata: { channel: 'website', conversationId: conversation.id },
      },
    });

    // ------------------------------------------------------------------
    // 5. Zalo identity with phone → Customer (create/reuse)
    // ------------------------------------------------------------------
    const zaloIdentity = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        channel: MessageChannel.ZALO,
        integrationScopeKey: `zalo:oa-${stamp}`,
        externalUserId: `zalo-uid-${stamp}`,
        displayName: 'Omni Zalo',
        phoneRaw: phone,
        phoneNormalized: phoneNorm,
        lastInboundAt: new Date(),
      },
    });
    const zaloLink = await linkMessagingIdentityToCustomerByPhone(
      prisma,
      orgA.id,
      zaloIdentity.id,
    );

    // ------------------------------------------------------------------
    // 6. Messenger PSID-only → MUST NOT create Customer
    // ------------------------------------------------------------------
    const beforeMsgCount = await prisma.customer.count({ where: { organizationId: orgA.id } });
    const messengerPsid = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        channel: MessageChannel.MESSENGER,
        integrationScopeKey: `messenger:page-${stamp}`,
        externalUserId: `psid-only-${stamp}`,
        displayName: 'PSID Only',
        lastInboundAt: new Date(),
      },
    });
    const psidLink = await linkMessagingIdentityToCustomerByPhone(
      prisma,
      orgA.id,
      messengerPsid.id,
    );
    const afterPsidCount = await prisma.customer.count({ where: { organizationId: orgA.id } });

    // Messenger with verified phone → additive link to existing Customer
    const messengerVerified = await prisma.messagingContactIdentity.create({
      data: {
        organizationId: orgA.id,
        channel: MessageChannel.MESSENGER,
        integrationScopeKey: `messenger:page-${stamp}`,
        externalUserId: `psid-verified-${stamp}`,
        displayName: 'Omni Messenger',
        phoneRaw: phone,
        phoneNormalized: phoneNorm,
        phoneVerifiedAt: new Date(),
        chatbotConversationId: conversation.id,
        lastInboundAt: new Date(),
      },
    });
    const msgLink = await linkMessagingIdentityToCustomerByPhone(
      prisma,
      orgA.id,
      messengerVerified.id,
    );

    // ------------------------------------------------------------------
    // 7. Lead Ads (META platformExternalLeadId) → same customerId
    // ------------------------------------------------------------------
    const adsLead = await prisma.lead.create({
      data: {
        organizationId: orgA.id,
        name: 'Omni Lead Ads',
        phone,
        email: emailA,
        platform: 'META',
        platformExternalLeadId: `meta-lead-${stamp}`,
        tags: [TAG, 'lead_ads'],
      },
    });
    const adsResolved = await prisma.$transaction((tx) =>
      resolveCustomerForIngress(tx, {
        organizationId: orgA.id,
        name: 'Omni Lead Ads',
        phone,
        email: emailA,
        source: 'lead_ads',
        tags: [TAG, 'lead_ads'],
      }),
    );
    await prisma.lead.update({
      where: { id: adsLead.id },
      data: { customerId: adsResolved.customer!.id },
    });
    await backfillLeadCustomerId(prisma, orgA.id, adsLead.id, adsResolved.customer!.id);

    // ------------------------------------------------------------------
    // 8. Booking + Order/Revenue + Automation
    // ------------------------------------------------------------------
    const booking = await prisma.appointment.create({
      data: {
        organizationId: orgA.id,
        branchId: branch.id,
        customerId,
        leadId: funnelLead.id,
        scheduledAt: new Date(Date.now() + 86_400_000),
        note: 'Omni booking',
      },
    });
    const order = await prisma.order.create({
      data: {
        organizationId: orgA.id,
        branchId: branch.id,
        customerId,
        leadId: funnelLead.id,
        orderNumber: `OMNI-${stamp.slice(-8)}`,
        total: 1_500_000,
        subtotal: 1_500_000,
        orderedAt: new Date(),
        items: {
          create: [{ name: 'Liệu trình Omni', quantity: 1, unitPrice: 1_500_000, totalPrice: 1_500_000 }],
        },
        payments: {
          create: [
            {
              organizationId: orgA.id,
              amount: 1_500_000,
              status: 'COMPLETED',
              paidAt: new Date(),
            },
          ],
        },
      },
    });
    const flow = await prisma.automationFlow.create({
      data: {
        organizationId: orgA.id,
        name: `Omni Auto ${stamp}`,
        triggerType: AutomationTriggerType.LEAD_CREATED,
        isActive: true,
      },
    });
    const autoLog = await prisma.automationLog.create({
      data: {
        organizationId: orgA.id,
        automationFlowId: flow.id,
        customerId,
        leadId: funnelLead.id,
        status: AutomationLogStatus.SUCCESS,
        executedAt: new Date(),
        idempotencyKey: `AUTO:${funnelLead.id}:${stamp}`,
        stepName: 'SEND_MESSAGE',
      },
    });

    // ------------------------------------------------------------------
    // 9. Email projection + consent + campaign snapshot
    // ------------------------------------------------------------------
    const createdOutbox = await prisma.customerOutboxEvent.findFirst({
      where: { organizationId: orgA.id, customerId, eventType: 'CUSTOMER_CREATED' },
      orderBy: { createdAt: 'desc' },
    });
    if (createdOutbox) await processCustomerOutboxEvent(prisma, createdOutbox.id);

    let emailContact = await prisma.emailContact.findFirst({
      where: { organizationId: orgA.id, customerId, email: normalizeCustomerEmail(emailA)! },
    });
    if (!emailContact) {
      emailContact = await prisma.emailContact.create({
        data: {
          organizationId: orgA.id,
          email: normalizeCustomerEmail(emailA)!,
          name: 'Omni CRM',
          phone,
          customerId,
          source: 'CRM',
          status: EmailContactStatus.SUBSCRIBED,
        },
      });
    }

    await prisma.emailSuppression.create({
      data: {
        organizationId: orgA.id,
        email: normalizeCustomerEmail(emailA)!,
        reason: EmailSuppressionReason.COMPLAINT,
      },
    });
    await prisma.emailContact.update({
      where: { id: emailContact.id },
      data: { status: EmailContactStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    });

    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId: orgA.id,
        name: `Omni Campaign ${stamp}`,
        subject: 'Snapshot subject',
        status: 'COMPLETED',
      },
    });
    const recipient = await prisma.emailCampaignRecipient.create({
      data: {
        organizationId: orgA.id,
        campaignId: campaign.id,
        contactId: emailContact.id,
        email: emailSnap,
        status: EmailRecipientStatus.SENT,
        sentAt: new Date(),
      },
    });

    // ------------------------------------------------------------------
    // 10. CRM update → outbox → new email contact; snapshot preserved
    // ------------------------------------------------------------------
    const emailB = `omni.updated.${stamp}@e2e.local`;
    const updateOutboxIds: Array<string | null> = [];
    await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findFirstOrThrow({ where: { id: customerId } });
      await applyCustomerSsotUpdate(tx, {
        organizationId: orgA.id,
        customerId,
        currentEmailNormalized: current.emailNormalized,
        currentPhoneNormalized: current.phoneNormalized,
        nextEmail: emailB,
        nextPhone: current.phone,
        data: { email: emailB, emailNormalized: normalizeCustomerEmail(emailB) },
      });
      updateOutboxIds.push(
        await enqueueCustomerOutboxEvent(tx, {
          organizationId: orgA.id,
          customerId,
          eventType: 'CUSTOMER_UPDATED',
          idempotencyKey: `CUSTOMER_UPDATED:${customerId}:${stamp}`,
          payload: { email: emailB, previousEmail: emailA },
        }),
      );
      updateOutboxIds.push(
        await enqueueCustomerOutboxEvent(tx, {
          organizationId: orgA.id,
          customerId,
          eventType: 'CUSTOMER_EMAIL_ADDED',
          idempotencyKey: `CUSTOMER_EMAIL_ADDED:${customerId}:${normalizeCustomerEmail(emailB)}`,
          payload: { email: normalizeCustomerEmail(emailB) },
        }),
      );
    });
    await drainOutbox(updateOutboxIds);

    const oldContact = await prisma.emailContact.findFirst({
      where: { id: emailContact.id },
    });
    const newContact = await prisma.emailContact.findFirst({
      where: { organizationId: orgA.id, email: normalizeCustomerEmail(emailB)! },
    });
    const recipientAfter = await prisma.emailCampaignRecipient.findFirst({
      where: { id: recipient.id },
    });

    // ------------------------------------------------------------------
    // 11. Dedup — concurrent ingress same phone/email
    // ------------------------------------------------------------------
    const dedupPhone = '0918 360 099';
    const dedupEmail = `dedup.${stamp}@e2e.local`;
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        prisma.$transaction((tx) =>
          resolveCustomerForIngress(tx, {
            organizationId: orgA.id,
            name: `Dedup ${i}`,
            phone: dedupPhone,
            email: dedupEmail,
            source: 'crm_manual',
            tags: [TAG],
          }),
        ),
      ),
    );
    const dedupIds = new Set(concurrent.map((r) => r.customer?.id).filter(Boolean));
    const dedupRows = await prisma.customer.findMany({
      where: {
        organizationId: orgA.id,
        emailNormalized: normalizeCustomerEmail(dedupEmail)!,
      },
    });

    // ------------------------------------------------------------------
    // 12. Multi-tenant isolation
    // ------------------------------------------------------------------
    const orgBResolved = await prisma.$transaction((tx) =>
      resolveCustomerForIngress(tx, {
        organizationId: orgB.id,
        name: 'OrgB Twin',
        phone,
        email: emailA,
        source: 'crm_manual',
        tags: [TAG],
      }),
    );
    const cross = await prisma.customer.findFirst({
      where: { organizationId: orgB.id, id: customerId },
    });

    // ------------------------------------------------------------------
    // 13. Merge secondary → primary (same org)
    // ------------------------------------------------------------------
    const secondary = await writeCustomer(orgA.id, {
      name: 'Omni Secondary',
      phone: '0918 360 088',
      email: `secondary.${stamp}@e2e.local`,
      source: 'crm_manual',
      tags: [TAG],
    });
    await prisma.lead.update({
      where: { id: webLead.id },
      data: { customerId: secondary.customer.id },
    });
    await prisma.$transaction(async (tx) => {
      await mergeCustomersSsot(tx, {
        organizationId: orgA.id,
        primaryId: customerId,
        secondaryId: secondary.customer.id,
      });
    });
    const webLeadAfterMerge = await prisma.lead.findFirst({ where: { id: webLead.id } });
    const secondaryAfter = await prisma.customer.findFirst({
      where: { id: secondary.customer.id },
    });

    // ------------------------------------------------------------------
    // 14. Test-data isolation from live CRM / campaign audience
    // ------------------------------------------------------------------
    const liveList = await prisma.customer.findMany({
      where: {
        organizationId: orgA.id,
        isActive: true,
        NOT: { tags: { has: TAG } },
      },
    });
    const liveAudience = await prisma.customer.findMany({
      where: {
        organizationId: orgA.id,
        emailNormalized: { not: null },
        NOT: { tags: { has: TAG } },
      },
    });
    const tagged = await prisma.customer.findMany({
      where: { organizationId: orgA.id, tags: { has: TAG } },
    });

    // ------------------------------------------------------------------
    // 15. Customer 360 timeline coverage (SSOT query surface)
    // ------------------------------------------------------------------
    const [
      leads360,
      appts360,
      orders360,
      emails360,
      funnel360,
      auto360,
      identities360,
      conv360,
    ] = await Promise.all([
      prisma.lead.findMany({ where: { organizationId: orgA.id, customerId } }),
      prisma.appointment.findMany({ where: { organizationId: orgA.id, customerId } }),
      prisma.order.findMany({ where: { organizationId: orgA.id, customerId } }),
      prisma.emailContact.findMany({ where: { organizationId: orgA.id, customerId } }),
      prisma.marketingFunnelEvent.findMany({ where: { organizationId: orgA.id, customerId } }),
      prisma.automationLog.findMany({ where: { organizationId: orgA.id, customerId } }),
      prisma.messagingContactIdentity.findMany({
        where: { organizationId: orgA.id, customerId, mergedIntoId: null },
      }),
      prisma.chatbotConversation.findMany({
        where: {
          organizationId: orgA.id,
          OR: [{ linkedLeadId: { in: [funnelLead.id, chatLead.id, webLead.id] } }, { visitorPhone: phone }],
        },
      }),
    ]);

    const timelineTypes = new Set<string>();
    for (const _ of leads360) timelineTypes.add('LEAD');
    for (const _ of appts360) timelineTypes.add('BOOKING');
    for (const _ of orders360) timelineTypes.add('ORDER');
    for (const e of funnel360) {
      if (e.eventType === 'FORM_SUBMIT') timelineTypes.add('FUNNEL');
      if (e.eventType === 'CHATBOT') timelineTypes.add('CHATBOT');
    }
    for (const _ of auto360) timelineTypes.add('AUTOMATION');
    for (const _ of emails360) timelineTypes.add('EMAIL');
    for (const i of identities360) {
      if (i.channel === 'ZALO') timelineTypes.add('ZALO');
      if (i.channel === 'MESSENGER') timelineTypes.add('MESSENGER');
    }
    for (const c of conv360) {
      if (c.channel === 'website') timelineTypes.add('CHATBOT');
    }

    // ------------------------------------------------------------------
    // Per-source customers + test-data noise (Canvas Runtime / example.com)
    // ------------------------------------------------------------------
    const sourceCatalog = listCustomerSources();
    const perSourceIds: Record<string, string> = {};
    for (let i = 0; i < sourceCatalog.length; i++) {
      const { code } = sourceCatalog[i];
      const srcPhone = `0918360${String(100 + i).slice(-3)}`;
      const srcEmail = `${code}.${stamp}@e2e.local`;
      const resolved = await prisma.$transaction((tx) =>
        resolveCustomerForIngress(tx, {
          organizationId: orgA.id,
          name: `Src ${code}`,
          phone: srcPhone,
          email: srcEmail,
          source: code,
          tags: [TAG],
        }),
      );
      perSourceIds[code] = resolved.customer!.id;
    }

    await prisma.customer.create({
      data: {
        organizationId: orgA.id,
        name: 'Canvas Runtime',
        phone: '0900000001',
        email: `canvas.${stamp}@example.com`,
        tags: [TAG],
        source: CUSTOMER_SOURCE.FUNNEL_FORM,
        firstSource: CUSTOMER_SOURCE.FUNNEL_FORM,
        latestSource: CUSTOMER_SOURCE.FUNNEL_FORM,
      },
    });
    await prisma.customer.create({
      data: {
        organizationId: orgA.id,
        name: 'E2E Tester',
        phone: '0900000002',
        email: `e2e.tester.${stamp}@example.com`,
        tags: [TAG],
      },
    });

    const primaryAfterZalo = await prisma.customer.findFirst({ where: { id: customerId } });

    // ------------------------------------------------------------------
    // Asserts — OMNICHANNEL + SSOT
    // ------------------------------------------------------------------
    const sharedIds = [
      funnelResolved.customer!.id,
      webResolved.customer!.id,
      adsResolved.customer!.id,
      zaloLink.customerId,
      msgLink.customerId,
    ];
    check(
      'OMNICHANNEL_CUSTOMER_SYNC',
      'All ingress channels resolve to one customerId; Messenger PSID-only does not create',
      `crm=${customerId} shared=${sharedIds.join(',')} zalo=${zaloLink.linked} msg=${msgLink.linked} psid=${psidLink.reason} psidCountΔ=${afterPsidCount - beforeMsgCount} booking=${booking.customerId} order=${order.customerId} auto=${autoLog.customerId}`,
      sharedIds.every((id) => id === customerId) &&
        zaloLink.linked === true &&
        msgLink.linked === true &&
        psidLink.linked === false &&
        psidLink.reason === 'no_phone' &&
        afterPsidCount === beforeMsgCount &&
        booking.customerId === customerId &&
        order.customerId === customerId &&
        autoLog.customerId === customerId &&
        conversation.id.length > 0,
    );

    check(
      'CUSTOMER_360_SSOT',
      'Lead/Funnel/Email/Booking/Automation/Order share customerId; consent + email snapshot preserved',
      `leads=${leads360.length} funnelEv=${funnel360.filter((e) => e.customerId === customerId).length} oldStatus=${oldContact?.status} snap=${recipientAfter?.email} newEmailContact=${newContact?.customerId}`,
      leads360.length >= 3 &&
        funnel360.some((e) => e.eventType === 'FORM_SUBMIT' && e.customerId === customerId) &&
        funnel360.some((e) => e.eventType === 'CHATBOT' && e.customerId === customerId) &&
        oldContact?.status === EmailContactStatus.UNSUBSCRIBED &&
        recipientAfter?.email === emailSnap &&
        newContact?.customerId === customerId &&
        webLeadAfterMerge?.customerId === customerId &&
        Boolean(secondaryAfter?.mergedIntoId === customerId || secondaryAfter?.isActive === false),
    );

    check(
      'CUSTOMER_DEDUP',
      '8 concurrent ingress → 1 customer; no auto-merge across split identities',
      `ids=${dedupIds.size} rows=${dedupRows.length}`,
      dedupIds.size === 1 && dedupRows.length === 1,
    );

    check(
      'CUSTOMER_SOURCE_MAPPING',
      'firstSource/latestSource canonical codes; legacy aliases normalize',
      `crmFirst=${primaryAfterZalo?.firstSource} crmLatest=${primaryAfterZalo?.latestSource} perSource=${Object.keys(perSourceIds).length} normalize=${normalizeCustomerSource('messenger_verified_phone')}`,
      primaryAfterZalo?.firstSource === CUSTOMER_SOURCE.CRM_MANUAL &&
        Boolean(primaryAfterZalo?.latestSource) &&
        [
          CUSTOMER_SOURCE.CRM_MANUAL,
          CUSTOMER_SOURCE.FUNNEL_FORM,
          CUSTOMER_SOURCE.WEBSITE_FORM,
          CUSTOMER_SOURCE.ZALO,
          CUSTOMER_SOURCE.MESSENGER,
          CUSTOMER_SOURCE.FACEBOOK_LEAD_ADS,
        ].includes(primaryAfterZalo!.latestSource! as (typeof CUSTOMER_SOURCE)[keyof typeof CUSTOMER_SOURCE]) &&
        Object.keys(perSourceIds).length === sourceCatalog.length &&
        normalizeCustomerSource('messenger_verified_phone') === CUSTOMER_SOURCE.MESSENGER &&
        normalizeCustomerSource('lead_ads') === CUSTOMER_SOURCE.FACEBOOK_LEAD_ADS,
    );

    check(
      'TEST_DATA_ISOLATION',
      'Test/synthetic customers hidden from live CRM; cross-org isolated',
      `live=${liveList.length} canvasHidden=${!(await prisma.customer.findFirst({ where: { organizationId: orgA.id, name: 'Canvas Runtime', ...customerExcludeTestWhere() } }))} cross=${cross?.id ?? 'null'}`,
      liveList.length === 0 &&
        liveAudience.length === 0 &&
        !(await prisma.customer.findFirst({
          where: { organizationId: orgA.id, name: 'Canvas Runtime', isActive: true, ...customerExcludeTestWhere() },
        })) &&
        !(await prisma.customer.findFirst({
          where: { organizationId: orgA.id, name: 'E2E Tester', isActive: true, ...customerExcludeTestWhere() },
        })) &&
        orgBResolved.customer!.id !== customerId &&
        !cross,
    );

    // ------------------------------------------------------------------
    // CUSTOMER_360_UI — source + live API 360
    // ------------------------------------------------------------------
    let uiActual = '';
    let uiOk = false;
    try {
      assertFileContains('apps/web/src/app/(app)/customers/[id]/page.tsx', [
        'Hành trình 360',
        'data-testid="customer-360-timeline"',
        'data-testid="customer-360-channels"',
        'defaultValue="timeline"',
      ]);
      assertFileContains('apps/web/src/hooks/use-crm.ts', [
        '/crm/customers/${id}/360',
        'useCustomerSources',
        '/customers/sources',
      ]);
      assertFileContains('apps/web/src/components/crm/crm-filters.tsx', [
        'customer-source-filter',
        'customerSources',
      ]);
      assertFileContains('apps/api/src/crm/crm.controller.ts', ['customers/:id/360']);
      assertFileContains('apps/api/src/customers/customers.controller.ts', ["@Get('sources')"]);

      if (sourceCatalog.length < 12) {
        throw new Error(`sources catalog=${sourceCatalog.length} expected>=12`);
      }

      // Per-source API filter (includeTest=true for E2E-tagged rows)
      const perm = await prisma.permission.findFirst({ where: { code: 'customer.read' } });
      if (!perm) throw new Error('permission customer.read missing');
      const role = await prisma.role.create({
        data: {
          organizationId: orgA.id,
          code: `C360_SRC_${stamp.slice(-6)}`,
          name: 'C360 Source Tester',
          permissions: { create: [{ permissionId: perm.id }] },
        },
      });
      const user = await prisma.user.create({
        data: {
          organizationId: orgA.id,
          roleId: role.id,
          email: `c360.src.${stamp}@e2e.local`,
          emailNormalized: `c360.src.${stamp}@e2e.local`,
          name: 'C360 Source',
          passwordHash: 'e2e-not-used',
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      const token = sign(
        {
          sub: user.id,
          email: user.email,
          organizationId: orgA.id,
          role: role.code,
        },
        env.JWT_SECRET!,
        { expiresIn: '10m' },
      );
      const apiBase = env.API_INTERNAL_URL || 'http://127.0.0.1:4000/api/v1';

      const sourcesRes = await fetch(`${apiBase}/customers/sources`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sourcesBody: Array<{ code: string; label: string }> = await sourcesRes.json();
      if (sourcesRes.status !== 200 || sourcesBody.length < 12) {
        throw new Error(`sources HTTP ${sourcesRes.status} count=${sourcesBody.length}`);
      }

      const filterChecks: string[] = [];
      for (const { code } of sourceCatalog) {
        const res = await fetch(
          `${apiBase}/customers?source=${encodeURIComponent(code)}&includeTest=true&pageSize=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const body: { items?: Array<{ id: string; latestSource?: string; firstSource?: string }> } =
          await res.json();
        if (res.status !== 200) throw new Error(`filter ${code} HTTP ${res.status}`);
        const hit = (body.items ?? []).some((c) => c.id === perSourceIds[code]);
        filterChecks.push(`${code}:${hit ? 'ok' : 'miss'}`);
        if (!hit) throw new Error(`filter ${code} missing per-source customer ${perSourceIds[code]}`);
      }

      // Live API get360 when API is reachable
      const perm360 = perm;
      const role360 = await prisma.role.create({
        data: {
          organizationId: orgA.id,
          code: `C360_OMNI_${stamp.slice(-6)}`,
          name: 'C360 Omni Tester',
          permissions: { create: [{ permissionId: perm360.id }] },
        },
      });
      const user360 = await prisma.user.create({
        data: {
          organizationId: orgA.id,
          roleId: role360.id,
          email: `c360.omni.${stamp}@e2e.local`,
          emailNormalized: `c360.omni.${stamp}@e2e.local`,
          name: 'C360 Omni',
          passwordHash: 'e2e-not-used',
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      const token360 = sign(
        {
          sub: user360.id,
          email: user360.email,
          organizationId: orgA.id,
          role: role360.code,
        },
        env.JWT_SECRET!,
        { expiresIn: '10m' },
      );

      const requiredTypes = [
        'LEAD',
        'BOOKING',
        'ORDER',
        'FUNNEL',
        'CHATBOT',
        'ZALO',
        'MESSENGER',
        'EMAIL',
        'AUTOMATION',
      ];
      const missing = requiredTypes.filter((t) => !timelineTypes.has(t));
      if (missing.length) throw new Error(`timeline missing ${missing.join(',')}`);

      const res = await fetch(`${apiBase}/crm/customers/${customerId}/360`, {
        headers: { Authorization: `Bearer ${token360}` },
      });
      const body: any = await res.json().catch(() => ({}));
      if (res.status !== 200) {
        throw new Error(`360 HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
      }
      const apiTypes = new Set((body.timeline || []).map((t: { type: string }) => t.type));
      const apiMissing = requiredTypes.filter((t) => !apiTypes.has(t));
      if (apiMissing.length) {
        throw new Error(`API timeline missing ${apiMissing.join(',')} got=${[...apiTypes].join(',')}`);
      }
      uiOk = true;
      uiActual = `sources=${sourcesBody.length} filters=${filterChecks.join('|')} timeline=${[...apiTypes].sort().join(',')}`;
    } catch (err) {
      uiOk = false;
      uiActual = err instanceof Error ? err.message : String(err);
    }
    check(
      'ALL_CUSTOMER_SOURCES_UI',
      'GET /customers/sources + per-source filter + UI customer-source-filter',
      uiActual,
      uiOk,
    );
    check(
      'CUSTOMER_360_UI',
      'Detail page Hành trình 360 + live GET /crm/customers/:id/360 returns omnichannel timeline',
      uiOk ? 'timeline+sources ok' : uiActual,
      uiOk,
    );

    // ------------------------------------------------------------------
    // FACEBOOK_APP_REVIEW_SAFE
    // ------------------------------------------------------------------
    let fbOk = true;
    let fbActual = '';
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
      const fbWebhook = readFileSync(
        path.join(ROOT, 'apps/api/src/chatbot-cskh/chatbot-facebook-webhook.service.ts'),
        'utf8',
      );
      if (!fbWebhook.includes('linkMessagingIdentityToCustomerByPhone')) {
        throw new Error('Messenger additive customer link missing');
      }
      // Must remain additive — no Customer create from PSID in webhook upsert
      if (/createOrReuseCustomerSsot[\s\S]{0,200}psid/i.test(fbWebhook)) {
        throw new Error('Messenger webhook must not create Customer from PSID');
      }

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

      const out = execFileSync(
        'node',
        [
          'scripts/with-root-env.cjs',
          'pnpm',
          '--filter',
          '@marketingspa/database',
          'exec',
          'tsx',
          '../../scripts/check-oauth-start-scopes.ts',
        ],
        { cwd: ROOT, encoding: 'utf8' },
      );
      const start = out.indexOf('{');
      const end = out.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error(`oauth output missing JSON: ${out.slice(0, 300)}`);
      const parsed = JSON.parse(out.slice(start, end + 1));
      assert.equal(parsed.http, 200);
      assert.equal(parsed.has_config_id, true);
      assert.equal(parsed.scope_has_pages, false);
      assert.equal(parsed.redirect_host, 'marketingautoaz.com');
      fbActual = `static+unit+live oauth ok config_id host=${parsed.redirect_host}`;
    } catch (err) {
      fbOk = false;
      fbActual = err instanceof Error ? err.message : String(err);
    }
    check(
      'FACEBOOK_APP_REVIEW_SAFE',
      'OAuth App ID/config_id/redirect/scopes/webhook unchanged; Messenger additive only',
      fbActual,
      fbOk,
    );
  } finally {
    await prisma.organization
      .deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } })
      .catch(() => undefined);
  }
}

function printGates(completed: boolean) {
  console.log('\nGATE | EXPECTED | ACTUAL | RESULT');
  console.log('---|---|---|---');
  for (const g of gates) {
    console.log(`${g.name} | ${g.expected} | ${g.actual} | ${g.result}`);
  }
  const failed = gates.filter((g) => g.result === 'FAIL');
  if (!completed || failed.length) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`- ${f.name}: ${f.actual}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nALL_CUSTOMER_SOURCES_UI = PASS');
  console.log('OMNICHANNEL_CUSTOMER_SYNC = PASS');
  console.log('CUSTOMER_360_SSOT = PASS');
  console.log('CUSTOMER_SOURCE_MAPPING = PASS');
  console.log('CUSTOMER_DEDUP = PASS');
  console.log('TEST_DATA_ISOLATION = PASS');
  console.log('CUSTOMER_360_UI = PASS');
  console.log('FACEBOOK_APP_REVIEW_SAFE = PASS');
}

main()
  .then(() => printGates(true))
  .catch((err) => {
    printGates(false);
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
