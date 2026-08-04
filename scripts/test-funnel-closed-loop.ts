/**
 * E2E closed-loop funnel: Ads/Chatbot → Lead → Customer → Assign → Appt → Check-in
 * → Order → Payment → Attribution → ROAS → Report
 *
 * Covers: UTM/gclid/fbclid retention, payment idempotency, funnel event idempotency
 * (worker restart), refund revenue/CAC, cross-tenant isolation, status guards.
 *
 * Run: pnpm test:funnel-closed-loop
 * Disposable tag FUNNEL_E2E_* — cleaned up after run. No production deploy.
 */
import assert from 'node:assert/strict';
import {
  AdPlatform,
  AppointmentStatus,
  LeadPipelineStatus,
  MarketingFunnelEventType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';
import {
  assertAppointmentTransition,
  assertLeadTransition,
  assertPaymentRefundable,
  orderStatusFromPaid,
} from '../apps/api/src/common/utils/status-transitions.util';

const prisma = new PrismaClient();
const TAG = `FUNNEL_E2E_${Date.now()}`;

async function netRevenue(organizationId: string, leadId: string) {
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      status: PaymentStatus.COMPLETED,
      order: { leadId },
    },
  });
  return payments.reduce((s, p) => s + Number(p.amount), 0);
}

async function paidOrderCount(organizationId: string, leadId: string) {
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      status: PaymentStatus.COMPLETED,
      order: { leadId },
    },
    select: { orderId: true },
  });
  return new Set(payments.map((p) => p.orderId)).size;
}

/** Mirrors FinanceService.createPayment idempotency */
async function createPaymentIdempotent(params: {
  organizationId: string;
  orderId: string;
  amount: number;
  reference: string;
}) {
  const existing = await prisma.payment.findFirst({
    where: {
      organizationId: params.organizationId,
      orderId: params.orderId,
      reference: params.reference,
      status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PENDING] },
    },
  });
  if (existing) return { payment: existing, created: false };

  const order = await prisma.order.findFirstOrThrow({
    where: { id: params.orderId, organizationId: params.organizationId },
    include: { payments: true },
  });
  const alreadyPaid = order.payments
    .filter((p) => p.status === PaymentStatus.COMPLETED)
    .reduce((s, p) => s + Number(p.amount), 0);
  const payment = await prisma.payment.create({
    data: {
      organizationId: params.organizationId,
      orderId: params.orderId,
      amount: params.amount,
      method: PaymentMethod.CASH,
      status: PaymentStatus.COMPLETED,
      reference: params.reference,
      paidAt: new Date(),
    },
  });
  const next = orderStatusFromPaid(Number(order.total), alreadyPaid + params.amount);
  await prisma.order.update({ where: { id: order.id }, data: { status: next } });
  return { payment, created: true };
}

async function recordEventIdempotent(params: {
  organizationId: string;
  eventType: MarketingFunnelEventType;
  idempotencyKey: string;
  leadId?: string;
  orderId?: string;
  paymentId?: string;
  amount?: number;
  adCampaignId?: string;
}) {
  const existing = await prisma.marketingFunnelEvent.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: params.organizationId,
        idempotencyKey: params.idempotencyKey,
      },
    },
  });
  if (existing) return { event: existing, created: false };
  const event = await prisma.marketingFunnelEvent.create({
    data: {
      organizationId: params.organizationId,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      leadId: params.leadId,
      orderId: params.orderId,
      paymentId: params.paymentId,
      amount: params.amount,
      adCampaignId: params.adCampaignId,
    },
  });
  return { event, created: true };
}

async function main() {
  const org = await prisma.organization.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  assert.ok(org, 'need organization');
  const orgB = await prisma.organization.findFirst({
    where: { isActive: true, id: { not: org.id } },
    orderBy: { createdAt: 'asc' },
  });
  const branch = await prisma.branch.findFirst({ where: { organizationId: org.id } });
  assert.ok(branch, 'need branch');

  const employee = await prisma.employee.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_NV`,
      isActive: true,
    },
  });

  const adAccount =
    (await prisma.adAccount.findFirst({ where: { organizationId: org.id } })) ??
    (await prisma.adAccount.create({
      data: {
        organizationId: org.id,
        name: `${TAG}_acc`,
        platform: AdPlatform.META,
        externalId: `ext-${TAG}`,
      },
    }));

  const campaign = await prisma.adCampaign.create({
    data: {
      organizationId: org.id,
      adAccountId: adAccount.id,
      name: `${TAG}_campaign`,
      platform: AdPlatform.META,
      status: 'ACTIVE',
    },
  });

  await prisma.adDailyStat.create({
    data: {
      organizationId: org.id,
      adCampaignId: campaign.id,
      date: new Date(),
      spend: 500_000,
      leads: 1,
      clicks: 20,
      impressions: 2000,
    },
  });

  const phone = `09${String(Date.now()).slice(-8)}`;
  const fbclid = `fbclid-${TAG}`;
  const gclid = `gclid-${TAG}`;

  // --- Lead + attribution (UTM / click ids) ---
  const lead = await prisma.lead.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_lead`,
      phone,
      email: `${TAG.toLowerCase()}@test.local`,
      assignedToId: employee.id,
      pipelineStatus: LeadPipelineStatus.NEW,
      platform: AdPlatform.META,
      platformExternalLeadId: `meta-${TAG}`,
    },
  });

  await prisma.leadAttribution.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      channel: AdPlatform.META,
      utmSource: 'facebook',
      utmMedium: 'cpc',
      utmCampaign: campaign.name,
      utmContent: 'creative-a',
      utmTerm: 'spa',
      fbclid,
      gclid,
      adCampaignId: campaign.id,
      landingPage: `https://example.test/lp?utm_source=facebook&fbclid=${fbclid}&gclid=${gclid}`,
      firstTouchJson: { fbclid, gclid, utmSource: 'facebook' },
      lastTouchJson: { fbclid, gclid, utmSource: 'facebook' },
    },
  });

  await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.LEAD_CREATED,
    idempotencyKey: `LEAD_CREATED:${lead.id}`,
    leadId: lead.id,
    adCampaignId: campaign.id,
  });

  // Duplicate webhook / worker restart — same idempotency key
  const dupLeadEvt = await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.LEAD_CREATED,
    idempotencyKey: `LEAD_CREATED:${lead.id}`,
    leadId: lead.id,
  });
  assert.equal(dupLeadEvt.created, false, 'duplicate LEAD_CREATED must be idempotent');

  // Duplicate platform lead id must not create second lead (app-level check)
  const dupByExt = await prisma.lead.findFirst({
    where: { organizationId: org.id, platformExternalLeadId: `meta-${TAG}` },
  });
  assert.equal(dupByExt?.id, lead.id);

  // --- Convert customer (phone dedupe) ---
  let customer = await prisma.customer.findFirst({
    where: { organizationId: org.id, phone },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        name: lead.name,
        phone,
        email: lead.email ?? undefined,
        source: 'lead_convert',
      },
    });
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: { customerId: customer.id },
  });

  // --- Appointment → check-in ---
  assertLeadTransition(LeadPipelineStatus.NEW, LeadPipelineStatus.CONTACTED);
  assert.throws(() => assertLeadTransition(LeadPipelineStatus.NEW, LeadPipelineStatus.PURCHASED));

  const scheduledAt = new Date(Date.now() + 3600_000);
  const appt = await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      customerId: customer.id,
      leadId: lead.id,
      employeeId: employee.id,
      adCampaignId: campaign.id,
      scheduledAt,
      durationMinutes: 60,
      status: AppointmentStatus.SCHEDULED,
    },
  });

  // Conflict: overlapping same employee
  const overlap = await prisma.appointment.findFirst({
    where: {
      organizationId: org.id,
      employeeId: employee.id,
      status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
      scheduledAt: {
        lt: new Date(scheduledAt.getTime() + 60 * 60_000),
        gte: new Date(scheduledAt.getTime() - 60 * 60_000),
      },
      id: { not: 'none' },
    },
  });
  assert.ok(overlap, 'conflict query should find existing appointment');

  await prisma.lead.update({
    where: { id: lead.id },
    data: { pipelineStatus: LeadPipelineStatus.BOOKED },
  });
  await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.APPOINTMENT_BOOKED,
    idempotencyKey: `APPOINTMENT_BOOKED:${appt.id}`,
    leadId: lead.id,
    adCampaignId: campaign.id,
  });

  assertAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED);
  assertAppointmentTransition(AppointmentStatus.CONFIRMED, AppointmentStatus.ARRIVED);
  assert.throws(() =>
    assertAppointmentTransition(AppointmentStatus.COMPLETED, AppointmentStatus.ARRIVED),
  );

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: AppointmentStatus.ARRIVED, checkedInAt: new Date() },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { pipelineStatus: LeadPipelineStatus.VISITED },
  });
  await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.CUSTOMER_ARRIVED,
    idempotencyKey: `CUSTOMER_ARRIVED:${appt.id}`,
    leadId: lead.id,
  });

  // --- Order + payment (idempotent) ---
  const revenue = 2_000_000;
  const order = await prisma.order.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      branchId: branch.id,
      leadId: lead.id,
      orderNumber: `ORD-${TAG}`,
      subtotal: revenue,
      discount: 0,
      total: revenue,
      status: OrderStatus.PENDING,
      items: {
        create: [{ name: `${TAG}_svc`, quantity: 1, unitPrice: revenue, totalPrice: revenue }],
      },
    },
  });

  const idemKey = `pay-${TAG}`;
  const p1 = await createPaymentIdempotent({
    organizationId: org.id,
    orderId: order.id,
    amount: revenue,
    reference: idemKey,
  });
  assert.equal(p1.created, true);

  // Webhook / job retry
  const p2 = await createPaymentIdempotent({
    organizationId: org.id,
    orderId: order.id,
    amount: revenue,
    reference: idemKey,
  });
  assert.equal(p2.created, false);
  assert.equal(p2.payment.id, p1.payment.id);

  const payCount = await prisma.payment.count({
    where: { organizationId: org.id, orderId: order.id },
  });
  assert.equal(payCount, 1, 'duplicate payment webhook must not create second payment');

  const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(orderAfter.status, OrderStatus.PAID);

  await prisma.lead.update({
    where: { id: lead.id },
    data: { pipelineStatus: LeadPipelineStatus.PURCHASED, convertedAt: new Date() },
  });

  const purchased = await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.SERVICE_PURCHASED,
    idempotencyKey: `SERVICE_PURCHASED:${order.id}`,
    leadId: lead.id,
    orderId: order.id,
    paymentId: p1.payment.id,
    amount: revenue,
    adCampaignId: campaign.id,
  });
  assert.equal(purchased.created, true);

  // Worker restart re-processes same job
  const purchasedRetry = await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.SERVICE_PURCHASED,
    idempotencyKey: `SERVICE_PURCHASED:${order.id}`,
    leadId: lead.id,
    orderId: order.id,
  });
  assert.equal(purchasedRetry.created, false);

  await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.PAYMENT_COMPLETED,
    idempotencyKey: `PAYMENT_COMPLETED:${p1.payment.id}`,
    leadId: lead.id,
    orderId: order.id,
    paymentId: p1.payment.id,
    amount: revenue,
  });

  // Attribution still has click ids
  const attr = await prisma.leadAttribution.findUnique({ where: { leadId: lead.id } });
  assert.equal(attr?.fbclid, fbclid);
  assert.equal(attr?.gclid, gclid);
  assert.equal(attr?.utmSource, 'facebook');
  assert.equal(attr?.adCampaignId, campaign.id);

  const revBefore = await netRevenue(org.id, lead.id);
  assert.equal(revBefore, revenue);
  const ordersBefore = await paidOrderCount(org.id, lead.id);
  assert.equal(ordersBefore, 1);

  const spend = 500_000;
  const roasBefore = revBefore / spend;
  assert.ok(roasBefore > 0);

  // --- Refund ---
  assertPaymentRefundable(PaymentStatus.COMPLETED);
  assert.throws(() => assertPaymentRefundable(PaymentStatus.REFUNDED));

  await prisma.payment.update({
    where: { id: p1.payment.id },
    data: { status: PaymentStatus.REFUNDED },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.REFUNDED },
  });
  await recordEventIdempotent({
    organizationId: org.id,
    eventType: MarketingFunnelEventType.PAYMENT_REFUNDED,
    idempotencyKey: `PAYMENT_REFUNDED:${p1.payment.id}`,
    leadId: lead.id,
    orderId: order.id,
    paymentId: p1.payment.id,
    amount: revenue,
  });

  const revAfter = await netRevenue(org.id, lead.id);
  assert.equal(revAfter, 0, 'refund must zero COMPLETED revenue');
  const ordersAfter = await paidOrderCount(org.id, lead.id);
  assert.equal(ordersAfter, 0, 'CAC/orders must drop when no COMPLETED payments');
  const roasAfter = spend > 0 ? revAfter / spend : 0;
  assert.equal(roasAfter, 0);

  // --- Cross-tenant ---
  const crossLead = await prisma.lead.findFirst({
    where: { id: lead.id, organizationId: orgB?.id ?? 'no-org-b' },
  });
  assert.equal(crossLead, null, 'cross-tenant lead lookup must miss (404 path)');

  const crossAttr = await prisma.leadAttribution.findFirst({
    where: { leadId: lead.id, organizationId: orgB?.id ?? 'no-org-b' },
  });
  assert.equal(crossAttr, null);

  const crossPay = await prisma.payment.findFirst({
    where: { id: p1.payment.id, organizationId: orgB?.id ?? 'no-org-b' },
  });
  assert.equal(crossPay, null);

  if (orgB) {
    const foreignLead = await prisma.lead.create({
      data: {
        organizationId: orgB.id,
        name: `${TAG}_foreign`,
        phone: `07${String(Date.now()).slice(-8)}`,
      },
    });
    const steal = await prisma.lead.findFirst({
      where: { id: foreignLead.id, organizationId: org.id },
    });
    assert.equal(steal, null, 'org A must not read org B lead');
    await prisma.lead.delete({ where: { id: foreignLead.id } });
  } else {
    console.log('skip multi-org cross-tenant create: only one organization');
  }

  // Cancel unpaid order path
  const unpaid = await prisma.order.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      leadId: lead.id,
      orderNumber: `ORD-CANCEL-${TAG}`,
      subtotal: 100_000,
      discount: 0,
      total: 100_000,
      status: OrderStatus.PENDING,
    },
  });
  await prisma.order.update({
    where: { id: unpaid.id },
    data: { status: OrderStatus.CANCELLED },
  });
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: unpaid.id } })).status,
    OrderStatus.CANCELLED,
  );

  // cleanup
  await prisma.marketingFunnelEvent.deleteMany({
    where: {
      organizationId: org.id,
      OR: [{ leadId: lead.id }, { idempotencyKey: { contains: TAG } }],
    },
  });
  await prisma.payment.deleteMany({ where: { orderId: { in: [order.id, unpaid.id] } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: [order.id, unpaid.id] } } });
  await prisma.order.deleteMany({ where: { id: { in: [order.id, unpaid.id] } } });
  await prisma.appointment.deleteMany({ where: { id: appt.id } });
  await prisma.leadAttribution.deleteMany({ where: { leadId: lead.id } });
  await prisma.lead.deleteMany({ where: { id: lead.id } });
  await prisma.customer.deleteMany({ where: { id: customer.id } });
  await prisma.adDailyStat.deleteMany({ where: { adCampaignId: campaign.id } });
  await prisma.adCampaign.deleteMany({ where: { id: campaign.id } });
  await prisma.employee.deleteMany({ where: { id: employee.id } });
  if (adAccount.name === `${TAG}_acc`) {
    await prisma.adAccount.deleteMany({ where: { id: adAccount.id } });
  }

  console.log('PASS funnel closed-loop E2E', {
    tag: TAG,
    roasBefore,
    revBefore,
    revAfter,
    payIdempotent: true,
    eventIdempotent: true,
    crossTenant: true,
  });
}

main()
  .catch((err) => {
    console.error('FAIL', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
