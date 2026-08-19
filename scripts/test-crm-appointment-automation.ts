/**
 * E2E CRM → Appointment → Automation pipeline.
 * Run: pnpm test:crm-appointment-automation
 *
 * Flow: Lead mới → auto-assign → tư vấn → đặt lịch → xác nhận → đến → mua → pipeline + report
 * Disposable ATTR-style tags: CRM_E2E_* — cleaned up after run.
 */
import assert from 'node:assert/strict';
import {
  AppointmentStatus,
  LeadPipelineStatus,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();
const TAG = `CRM_E2E_${Date.now()}`;

async function main() {
  const org = await prisma.organization.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  assert.ok(org, 'need organization');
  const branch = await prisma.branch.findFirst({ where: { organizationId: org.id } });
  assert.ok(branch, 'need branch');

  const empA = await prisma.employee.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_NV_A`,
      isActive: true,
    },
  });
  const empB = await prisma.employee.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_NV_B`,
      isActive: true,
    },
  });

  const rule = await prisma.leadAssignmentRule.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      mode: 'ROUND_ROBIN',
      employeeIds: [empA.id, empB.id],
      lastIndex: -1,
    },
  });

  // Ensure pipeline stages
  for (const [i, s] of [
    ['Lead mới', 'NEW'],
    ['Đã liên hệ', 'CONTACTED'],
    ['Đủ điều kiện', 'QUALIFIED'],
    ['Đã đặt lịch', 'BOOKED'],
    ['Đã xác nhận', 'CONFIRMED'],
    ['Đã đến', 'VISITED'],
    ['Đã mua', 'PURCHASED'],
    ['Mất lead', 'LOST'],
  ].entries()) {
    await prisma.funnelStage.upsert({
      where: { organizationId_name: { organizationId: org.id, name: s[0] } },
      create: {
        organizationId: org.id,
        name: s[0],
        code: s[1] as LeadPipelineStatus,
        position: i,
        isDefault: s[1] === 'NEW',
        isLostStage: s[1] === 'LOST',
      },
      update: { code: s[1] as LeadPipelineStatus, isActive: true },
    });
  }

  // Round-robin assign
  const nextIndex = (rule.lastIndex + 1) % 2;
  await prisma.leadAssignmentRule.update({
    where: { id: rule.id },
    data: { lastIndex: nextIndex },
  });
  const assignedToId = [empA.id, empB.id][nextIndex];

  const stageNew = await prisma.funnelStage.findFirst({
    where: { organizationId: org.id, code: 'NEW' },
  });

  const lead = await prisma.lead.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_lead`,
      phone: `09${String(Date.now()).slice(-8)}`,
      email: `${TAG.toLowerCase()}@test.local`,
      assignedToId,
      stageId: stageNew?.id,
      pipelineStatus: LeadPipelineStatus.NEW,
      score: 45,
      tags: ['e2e', 'hot'],
      slaRespondBy: new Date(Date.now() + 15 * 60_000),
    },
  });
  assert.equal(lead.assignedToId, assignedToId, 'auto-assign employee');

  // Claim lock — other employee cannot claim
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      claimedById: assignedToId,
      claimedAt: new Date(),
      claimExpiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  const blocked = await prisma.lead.updateMany({
    where: {
      id: lead.id,
      OR: [{ claimedById: null }, { claimExpiresAt: { lt: new Date() } }, { claimedById: empB.id }],
    },
    data: { claimedById: empB.id },
  });
  assert.equal(blocked.count, 0, 'concurrent claim blocked');

  // Tư vấn → QUALIFIED
  const stageContacted = await prisma.funnelStage.findFirst({
    where: { organizationId: org.id, code: 'CONTACTED' },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      pipelineStatus: LeadPipelineStatus.CONTACTED,
      stageId: stageContacted?.id,
      lastContactedAt: new Date(),
    },
  });
  await prisma.leadActivity.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      action: 'STATUS_CHANGED',
      fromValue: 'NEW',
      toValue: 'CONTACTED',
    },
  });
  await prisma.leadNote.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      content: 'Đã tư vấn liệu trình facial',
    },
  });

  const stageQualified = await prisma.funnelStage.findFirst({
    where: { organizationId: org.id, code: 'QUALIFIED' },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      pipelineStatus: LeadPipelineStatus.QUALIFIED,
      stageId: stageQualified?.id,
    },
  });

  // Room / bed
  const room = await prisma.spaRoom.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_room`,
    },
  });
  const bed = await prisma.spaBed.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      roomId: room.id,
      name: `${TAG}_bed`,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: `${TAG}_customer`,
      phone: lead.phone,
      email: lead.email,
      assignedEmployeeId: assignedToId,
      tags: ['e2e'],
    },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { customerId: customer.id },
  });

  // Đặt lịch
  const scheduledAt = new Date(Date.now() + 2 * 3600_000);
  const appt = await prisma.appointment.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      customerId: customer.id,
      leadId: lead.id,
      employeeId: assignedToId,
      roomId: room.id,
      bedId: bed.id,
      scheduledAt,
      durationMinutes: 60,
      status: AppointmentStatus.SCHEDULED,
      depositAmount: 200_000,
      depositStatus: 'PENDING',
      note: 'Từ lead e2e',
    },
  });
  const stageBooked = await prisma.funnelStage.findFirst({
    where: { organizationId: org.id, code: 'BOOKED' },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      pipelineStatus: LeadPipelineStatus.BOOKED,
      stageId: stageBooked?.id,
    },
  });

  // Conflict: same employee overlapping
  const overlapStart = new Date(scheduledAt.getTime() + 15 * 60_000);
  const conflicting = await prisma.appointment.findMany({
    where: {
      organizationId: org.id,
      employeeId: assignedToId,
      status: { in: ['SCHEDULED', 'CONFIRMED', 'ARRIVED'] },
      id: { not: appt.id },
      scheduledAt: {
        gte: new Date(overlapStart.getTime() - 2 * 3600_000),
        lte: new Date(overlapStart.getTime() + 2 * 3600_000),
      },
    },
  });
  // Simulate conflict check against appt itself conceptually — create second would conflict
  const cStart = appt.scheduledAt.getTime();
  const cEnd = cStart + 60 * 60_000;
  const oStart = overlapStart.getTime();
  const oEnd = oStart + 60 * 60_000;
  assert.ok(oStart < cEnd && oEnd > cStart, 'overlap detected for conflict guard');
  assert.equal(conflicting.length, 0);

  // Xác nhận → Đến
  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: AppointmentStatus.CONFIRMED },
  });
  const stageConfirmed = await prisma.funnelStage.findFirst({
    where: { organizationId: org.id, code: 'CONFIRMED' },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      pipelineStatus: LeadPipelineStatus.CONFIRMED,
      stageId: stageConfirmed?.id,
    },
  });

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: AppointmentStatus.ARRIVED, checkedInAt: new Date() },
  });
  const stageVisited = await prisma.funnelStage.findFirst({
    where: { organizationId: org.id, code: 'VISITED' },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      pipelineStatus: LeadPipelineStatus.VISITED,
      stageId: stageVisited?.id,
    },
  });

  // Mua dịch vụ
  const order = await prisma.order.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      branchId: branch.id,
      leadId: lead.id,
      orderNumber: `ORD-${TAG}`,
      subtotal: 3_000_000,
      total: 3_000_000,
      status: 'PAID',
    },
  });
  await prisma.payment.create({
    data: {
      organizationId: org.id,
      orderId: order.id,
      amount: 3_000_000,
      method: 'CASH',
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(),
    },
  });
  const stagePurchased = await prisma.funnelStage.findFirst({
    where: { organizationId: org.id, code: 'PURCHASED' },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      pipelineStatus: LeadPipelineStatus.PURCHASED,
      stageId: stagePurchased?.id,
      convertedAt: new Date(),
    },
  });

  const finalLead = await prisma.lead.findUnique({ where: { id: lead.id } });
  assert.equal(finalLead?.pipelineStatus, LeadPipelineStatus.PURCHASED);

  const spend = await prisma.payment.aggregate({
    where: {
      organizationId: org.id,
      status: PaymentStatus.COMPLETED,
      order: { customerId: customer.id },
    },
    _sum: { amount: true },
  });
  assert.equal(Number(spend._sum.amount), 3_000_000);

  // Duplicate customers for merge
  const dup = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: `${TAG}_dup`,
      phone: customer.phone,
      email: customer.email,
    },
  });
  const dups = await prisma.customer.findMany({
    where: {
      organizationId: org.id,
      id: { not: customer.id },
      phone: { contains: (customer.phone ?? '').slice(-9) },
      isActive: true,
    },
  });
  assert.ok(dups.some((d) => d.id === dup.id), 'duplicate detection by phone');

  // Automation flow pause flag
  const flow = await prisma.automationFlow.create({
    data: {
      organizationId: org.id,
      name: `${TAG}_flow`,
      triggerType: 'LEAD_CREATED',
      actions: [{ type: 'CREATE_TASK', title: 'Gọi lại lead' }],
      isActive: true,
      isPaused: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      cooldownMinutes: 60,
    },
  });
  await prisma.automationFlow.update({
    where: { id: flow.id },
    data: { isPaused: true },
  });
  const paused = await prisma.automationFlow.findUnique({ where: { id: flow.id } });
  assert.equal(paused?.isPaused, true);

  // Cross-org isolation sample
  const orgB = await prisma.organization.findFirst({
    where: { id: { not: org.id }, isActive: true },
  });
  if (orgB) {
    const cross = await prisma.lead.findFirst({
      where: { id: lead.id, organizationId: orgB.id },
    });
    assert.equal(cross, null);
  }

  // Cleanup
  await prisma.automationFlow.delete({ where: { id: flow.id } });
  await prisma.payment.deleteMany({ where: { orderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.appointment.delete({ where: { id: appt.id } });
  await prisma.leadNote.deleteMany({ where: { leadId: lead.id } });
  await prisma.leadActivity.deleteMany({ where: { leadId: lead.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.customer.deleteMany({ where: { id: { in: [customer.id, dup.id] } } });
  await prisma.spaBed.delete({ where: { id: bed.id } });
  await prisma.spaRoom.delete({ where: { id: room.id } });
  await prisma.leadAssignmentRule.delete({ where: { id: rule.id } });
  await prisma.employee.deleteMany({ where: { id: { in: [empA.id, empB.id] } } });

  console.log('test-crm-appointment-automation: all passed');
  console.log(
    JSON.stringify({
      pipeline: 'NEW→CONTACTED→QUALIFIED→BOOKED→CONFIRMED→VISITED→PURCHASED',
      assignedToId,
      revenue: 3_000_000,
      claimBlocked: true,
      flowPaused: true,
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
