/**
 * Marketing attribution closed-loop scenarios.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-attribution.ts
 *
 * Creates disposable rows tagged ATTR_TEST_* then cleans up.
 * Does NOT seed fake production marketing data for real campaigns.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import {
  AdPlatform,
  AppointmentStatus,
  MarketingFunnelEventType,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();
const TAG = `ATTR_TEST_${Date.now()}`;

type Cleanup = { table: string; id: string };

async function main() {
  const org = await prisma.organization.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  assert.ok(org, 'need at least one organization');

  const orgB = await prisma.organization.findFirst({
    where: { isActive: true, id: { not: org.id } },
    orderBy: { createdAt: 'asc' },
  });

  const branch = await prisma.branch.findFirst({ where: { organizationId: org.id } });
  assert.ok(branch, 'need a branch in org');

  const adAccount =
    (await prisma.adAccount.findFirst({ where: { organizationId: org.id } })) ??
    (await prisma.adAccount.create({
      data: {
        organizationId: org.id,
        name: `${TAG}_account`,
        platform: AdPlatform.META,
        externalId: `ext-${TAG}`,
      },
    }));

  const campaign = await prisma.adCampaign.create({
    data: {
      organizationId: org.id,
      adAccountId: adAccount.id,
      name: `${TAG}_fb_campaign`,
      platform: AdPlatform.META,
      status: 'ACTIVE',
    },
  });

  const adSet = await prisma.adSet.create({
    data: {
      organizationId: org.id,
      adAccountId: adAccount.id,
      adCampaignId: campaign.id,
      name: `${TAG}_adset`,
      externalId: `as-${TAG}`,
    },
  });

  const ad = await prisma.adCreative.create({
    data: {
      organizationId: org.id,
      adAccountId: adAccount.id,
      adCampaignId: campaign.id,
      adSetId: adSet.id,
      name: `${TAG}_ad`,
      externalId: `ad-${TAG}`,
    },
  });

  const spend = 1_000_000;
  await prisma.adDailyStat.create({
    data: {
      organizationId: org.id,
      adCampaignId: campaign.id,
      date: new Date(),
      spend,
      leads: 1,
      clicks: 10,
      impressions: 1000,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_customer`,
      phone: `09${String(Date.now()).slice(-8)}`,
      email: `${TAG.toLowerCase()}@example.test`,
    },
  });

  // --- 1) Facebook lead → payment → ROAS ---
  const fbLead = await prisma.lead.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      customerId: customer.id,
      name: `${TAG}_fb_lead`,
      phone: customer.phone,
      email: customer.email,
      platform: AdPlatform.META,
      platformExternalLeadId: `meta-lead-${TAG}`,
    },
  });

  await prisma.leadAttribution.create({
    data: {
      organizationId: org.id,
      leadId: fbLead.id,
      channel: AdPlatform.META,
      utmSource: 'facebook',
      utmMedium: 'cpc',
      utmCampaign: campaign.name,
      fbclid: `fbclid-${TAG}`,
      adCampaignId: campaign.id,
      adSetId: adSet.id,
      adId: ad.id,
      externalCampaignId: campaign.id,
      externalAdSetId: adSet.id,
      externalAdId: ad.id,
      landingPage: 'https://example.test/landing',
      referrer: 'https://facebook.com',
      firstTouchJson: { channel: 'META', fbclid: `fbclid-${TAG}` },
      lastTouchJson: { channel: 'META', fbclid: `fbclid-${TAG}` },
    },
  });

  await prisma.marketingFunnelEvent.create({
    data: {
      organizationId: org.id,
      eventType: MarketingFunnelEventType.LEAD_CREATED,
      leadId: fbLead.id,
      customerId: customer.id,
      adCampaignId: campaign.id,
      idempotencyKey: `LEAD_CREATED:${fbLead.id}`,
    },
  });

  const appt1 = await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      customerId: customer.id,
      leadId: fbLead.id,
      scheduledAt: new Date(),
      status: AppointmentStatus.SCHEDULED,
    },
  });
  await prisma.marketingFunnelEvent.create({
    data: {
      organizationId: org.id,
      eventType: MarketingFunnelEventType.APPOINTMENT_BOOKED,
      leadId: fbLead.id,
      customerId: customer.id,
      appointmentId: appt1.id,
      adCampaignId: campaign.id,
      idempotencyKey: `APPOINTMENT_BOOKED:${appt1.id}`,
    },
  });

  const revenue = 5_000_000;
  const order = await prisma.order.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      branchId: branch.id,
      leadId: fbLead.id,
      orderNumber: `ORD-${TAG}`,
      subtotal: revenue,
      total: revenue,
      status: 'PAID',
    },
  });

  const payment = await prisma.payment.create({
    data: {
      organizationId: org.id,
      orderId: order.id,
      amount: revenue,
      method: 'CASH',
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(),
      reference: `${TAG}-pay`,
    },
  });

  await prisma.marketingFunnelEvent.createMany({
    data: [
      {
        organizationId: org.id,
        eventType: MarketingFunnelEventType.SERVICE_PURCHASED,
        leadId: fbLead.id,
        customerId: customer.id,
        orderId: order.id,
        paymentId: payment.id,
        adCampaignId: campaign.id,
        amount: revenue,
        idempotencyKey: `SERVICE_PURCHASED:${order.id}`,
      },
      {
        organizationId: org.id,
        eventType: MarketingFunnelEventType.PAYMENT_COMPLETED,
        leadId: fbLead.id,
        customerId: customer.id,
        orderId: order.id,
        paymentId: payment.id,
        adCampaignId: campaign.id,
        amount: revenue,
        idempotencyKey: `PAYMENT_COMPLETED:${payment.id}`,
      },
    ],
  });

  const netBeforeRefund = await netRevenueForLead(org.id, fbLead.id);
  assert.equal(netBeforeRefund, revenue, 'FB lead revenue before refund');
  const roas = netBeforeRefund / spend;
  assert.equal(roas, 5, `expected ROAS 5, got ${roas}`);

  // --- 2) Google lead with gclid ---
  const gLead = await prisma.lead.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_google_lead`,
      phone: `08${String(Date.now()).slice(-8)}`,
      platform: AdPlatform.GOOGLE,
      platformExternalLeadId: `g-lead-${TAG}`,
    },
  });
  await prisma.leadAttribution.create({
    data: {
      organizationId: org.id,
      leadId: gLead.id,
      channel: AdPlatform.GOOGLE,
      utmSource: 'google',
      utmMedium: 'cpc',
      gclid: `gclid-${TAG}`,
      landingPage: 'https://example.test/g',
    },
  });
  const gAttr = await prisma.leadAttribution.findUnique({ where: { leadId: gLead.id } });
  assert.equal(gAttr?.gclid, `gclid-${TAG}`, 'gclid must be stored');

  // --- 3) Multiple appointments ≠ multiple leads ---
  const appt2 = await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      customerId: customer.id,
      leadId: fbLead.id,
      scheduledAt: new Date(Date.now() + 86400000),
      status: AppointmentStatus.SCHEDULED,
    },
  });
  await prisma.marketingFunnelEvent.create({
    data: {
      organizationId: org.id,
      eventType: MarketingFunnelEventType.APPOINTMENT_BOOKED,
      leadId: fbLead.id,
      appointmentId: appt2.id,
      adCampaignId: campaign.id,
      idempotencyKey: `APPOINTMENT_BOOKED:${appt2.id}`,
    },
  });

  const leadCount = await prisma.lead.count({
    where: { organizationId: org.id, id: fbLead.id },
  });
  assert.equal(leadCount, 1);
  const apptCount = await prisma.appointment.count({
    where: { organizationId: org.id, leadId: fbLead.id },
  });
  assert.equal(apptCount, 2);
  const bookedEvents = await prisma.marketingFunnelEvent.count({
    where: {
      organizationId: org.id,
      leadId: fbLead.id,
      eventType: MarketingFunnelEventType.APPOINTMENT_BOOKED,
    },
  });
  assert.equal(bookedEvents, 2, 'two appointments → two booked events, still one lead');

  // --- 4) Refund adjusts revenue ---
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: PaymentStatus.REFUNDED },
  });
  await prisma.marketingFunnelEvent.create({
    data: {
      organizationId: org.id,
      eventType: MarketingFunnelEventType.PAYMENT_REFUNDED,
      leadId: fbLead.id,
      orderId: order.id,
      paymentId: payment.id,
      amount: revenue,
      idempotencyKey: `PAYMENT_REFUNDED:${payment.id}`,
    },
  });
  const netAfterRefund = await netRevenueForLead(org.id, fbLead.id);
  assert.equal(netAfterRefund, 0, 'refund must zero net revenue for full refund');

  // --- 5) Cross-org attribution isolation ---
  if (orgB) {
    const cross = await prisma.leadAttribution.findFirst({
      where: { leadId: fbLead.id, organizationId: orgB.id },
    });
    assert.equal(cross, null, 'other org must not see attribution by lead id');

    const crossEvent = await prisma.marketingFunnelEvent.findFirst({
      where: { leadId: fbLead.id, organizationId: orgB.id },
    });
    assert.equal(crossEvent, null);

    const dashScoped = await prisma.leadAttribution.findMany({
      where: { organizationId: orgB.id, leadId: fbLead.id },
    });
    assert.equal(dashScoped.length, 0);
  } else {
    console.log('skip cross-org: only one organization');
  }

  // cleanup disposable rows (keep ad account if pre-existing)
  await prisma.marketingFunnelEvent.deleteMany({
    where: {
      organizationId: org.id,
      OR: [{ leadId: fbLead.id }, { leadId: gLead.id }, { idempotencyKey: { contains: TAG } }],
    },
  });
  await prisma.payment.deleteMany({ where: { id: payment.id } });
  await prisma.order.deleteMany({ where: { id: order.id } });
  await prisma.appointment.deleteMany({ where: { id: { in: [appt1.id, appt2.id] } } });
  await prisma.leadAttribution.deleteMany({ where: { leadId: { in: [fbLead.id, gLead.id] } } });
  await prisma.lead.deleteMany({ where: { id: { in: [fbLead.id, gLead.id] } } });
  await prisma.customer.deleteMany({ where: { id: customer.id } });
  await prisma.adDailyStat.deleteMany({ where: { adCampaignId: campaign.id } });
  await prisma.adCreative.deleteMany({ where: { id: ad.id } });
  await prisma.adSet.deleteMany({ where: { id: adSet.id } });
  await prisma.adCampaign.deleteMany({ where: { id: campaign.id } });
  if (adAccount.name === `${TAG}_account`) {
    await prisma.adAccount.deleteMany({ where: { id: adAccount.id } });
  }

  console.log('test-marketing-attribution: all passed');
}

async function netRevenueForLead(organizationId: string, leadId: string) {
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      status: PaymentStatus.COMPLETED,
      OR: [
        { order: { leadId } },
        { order: { customer: { leads: { some: { id: leadId, organizationId } } } } },
      ],
    },
    select: { amount: true, status: true },
  });
  return payments.reduce((net, p) => net + Number(p.amount), 0);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
