import type { Job } from 'bullmq';
import {
  AutomationLogStatus,
  AutomationTriggerType,
  LeadPipelineStatus,
  MarketingCampaignStatus,
  PaymentStatus,
} from '@marketingspa/database';
import { prisma } from '@marketingspa/database';
import { WS_EVENTS } from '@marketingspa/shared';
import type Redis from 'ioredis';
import { publishRealtime } from '../lib/realtime';
import { renderTemplate } from '../lib/template';
import { captureException } from '../sentry';
import { staleLeadMinutes } from '../config';

const STALE_ALERT_TTL_SEC = 30 * 60;

export async function processLeadAlertScan(redis: Redis) {
  const threshold = new Date(Date.now() - staleLeadMinutes * 60 * 1000);
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let totalAlerts = 0;

  for (const org of orgs) {
    const stale = await prisma.lead.findMany({
      where: {
        organizationId: org.id,
        pipelineStatus: LeadPipelineStatus.NEW,
        createdAt: { lt: threshold },
      },
      take: 50,
      orderBy: { createdAt: 'asc' },
    });

    const toAlert: typeof stale = [];
    for (const lead of stale) {
      const key = `marketingspa:stale-alert:${lead.id}`;
      const set = await redis.set(key, '1', 'EX', STALE_ALERT_TTL_SEC, 'NX');
      if (set === 'OK') toAlert.push(lead);
    }

    if (toAlert.length === 0) continue;

    totalAlerts += toAlert.length;
    console.log(`[lead-alert] Org ${org.id}: ${toAlert.length} stale lead(s)`);

    await publishRealtime(redis, org.id, WS_EVENTS.LEAD_STALE_ALERT, {
      count: toAlert.length,
      leads: toAlert.map((l) => ({
        id: l.id,
        name: l.name,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  }

  return { organizations: orgs.length, alertsSent: totalAlerts };
}

export async function processAppointmentReminders(redis: Redis) {
  const now = Date.now();
  const windows = [
    {
      trigger: AutomationTriggerType.APPOINTMENT_24H_BEFORE,
      hoursBefore: 24,
      from: new Date(now + 23.5 * 3600000),
      to: new Date(now + 24.5 * 3600000),
    },
    {
      trigger: AutomationTriggerType.APPOINTMENT_2H_BEFORE,
      hoursBefore: 2,
      from: new Date(now + 1.5 * 3600000),
      to: new Date(now + 2.5 * 3600000),
    },
  ];

  let logsCreated = 0;

  for (const win of windows) {
    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: win.from, lte: win.to },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
      include: {
        customer: true,
        lead: true,
        branch: true,
        service: true,
        organization: true,
      },
    });

    for (const appt of appointments) {
      const dedupeKey = `marketingspa:appt-remind:${appt.id}:${win.hoursBefore}h`;
      const ok = await redis.set(dedupeKey, '1', 'EX', 86400, 'NX');
      if (ok !== 'OK') continue;

      let flow = await prisma.automationFlow.findFirst({
        where: {
          organizationId: appt.organizationId,
          isActive: true,
          triggerType: win.trigger,
        },
        include: { messageTemplate: true },
      });

      if (!flow) {
        flow = await prisma.automationFlow.findFirst({
          where: {
            organizationId: appt.organizationId,
            isActive: true,
            triggerType: AutomationTriggerType.APPOINTMENT_REMINDER,
          },
          include: { messageTemplate: true },
        });
      }

      if (!flow) {
        console.warn(`[appointment-reminder] No flow for org ${appt.organizationId}`);
        continue;
      }

      const body =
        flow.messageTemplate?.body ??
        'Xin chào {{customer_name}}, nhắc lịch {{appointment_time}} tại {{branch_name}}.';
      const renderedContent = renderTemplate(body, {
        customer_name: appt.customer?.name ?? appt.lead?.name ?? 'Quý khách',
        appointment_time: appt.scheduledAt.toLocaleString('vi-VN'),
        branch_name: appt.branch?.name ?? '',
        service_name: appt.service?.name ?? '',
      });

      await prisma.automationLog.create({
        data: {
          organizationId: appt.organizationId,
          automationFlowId: flow.id,
          customerId: appt.customerId,
          leadId: appt.leadId,
          channel: flow.channel ?? flow.messageTemplate?.channel ?? undefined,
          renderedContent,
          status: AutomationLogStatus.SENT,
          executedAt: new Date(),
          result: {
            simulated: true,
            hoursBefore: win.hoursBefore,
            appointmentId: appt.id,
          },
        },
      });

      logsCreated += 1;

      await publishRealtime(redis, appt.organizationId, WS_EVENTS.APPOINTMENT_REMINDER, {
        appointmentId: appt.id,
        customerName: appt.customer?.name ?? appt.lead?.name,
        scheduledAt: appt.scheduledAt.toISOString(),
        hoursBefore: win.hoursBefore,
      });
    }
  }

  return { logsCreated };
}

export async function processAutomationMessage(job: Job) {
  const { organizationId, flowId, customerId, leadId } = job.data as {
    organizationId: string;
    flowId: string;
    customerId?: string;
    leadId?: string;
  };

  const flow = await prisma.automationFlow.findFirst({
    where: { id: flowId, organizationId },
    include: { messageTemplate: true },
  });
  if (!flow) throw new Error(`Flow ${flowId} not found`);

  let context: Record<string, string> = {};
  if (customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { branch: true },
    });
    if (c) {
      context = { customer_name: c.name, branch_name: c.branch?.name ?? '' };
    }
  }
  if (leadId) {
    const l = await prisma.lead.findUnique({ where: { id: leadId } });
    if (l) context = { ...context, customer_name: l.name };
  }

  const body = flow.messageTemplate?.body ?? 'Tin nhắn automation giả lập';
  const renderedContent = renderTemplate(body, context);

  const log = await prisma.automationLog.create({
    data: {
      organizationId,
      automationFlowId: flow.id,
      customerId,
      leadId,
      channel: flow.channel ?? flow.messageTemplate?.channel ?? undefined,
      renderedContent,
      status: AutomationLogStatus.SENT,
      executedAt: new Date(),
      result: { simulated: true, jobId: job.id },
    },
  });

  return { logId: log.id };
}

export async function processDailyReport(redis: Redis) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const orgs = await prisma.organization.findMany({ where: { isActive: true } });
  const reports: string[] = [];

  for (const org of orgs) {
    const [leads, appointments, payments, expenses] = await Promise.all([
      prisma.lead.count({
        where: { organizationId: org.id, createdAt: { gte: start, lte: end } },
      }),
      prisma.appointment.count({
        where: { organizationId: org.id, scheduledAt: { gte: start, lte: end } },
      }),
      prisma.payment.aggregate({
        where: {
          organizationId: org.id,
          paidAt: { gte: start, lte: end },
          status: PaymentStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { organizationId: org.id, expenseDate: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(payments._sum.amount ?? 0);
    const expenseTotal = Number(expenses._sum.amount ?? 0);
    const dateStr = start.toISOString().slice(0, 10);

    const content = {
      date: dateStr,
      leads,
      appointments,
      revenue,
      expenses: expenseTotal,
      profit: revenue - expenseTotal,
      simulated: true,
    };

    const report = await prisma.aiReport.create({
      data: {
        organizationId: org.id,
        type: 'DAILY_OPERATIONS',
        title: `Báo cáo vận hành ${dateStr}`,
        content,
      },
    });

    reports.push(report.id);
    console.log(
      `[daily-report] ${org.name}: leads=${leads} appts=${appointments} revenue=${revenue}`,
    );

    await publishRealtime(redis, org.id, WS_EVENTS.DAILY_REPORT, {
      reportId: report.id,
      title: report.title,
      date: dateStr,
    });
  }

  return { reportsCreated: reports.length };
}

export async function processBackup() {
  const { spawn } = await import('child_process');
  const path = await import('path');

  const root = path.resolve(__dirname, '../../..');
  const scriptPath =
    process.platform === 'win32'
      ? path.join(root, 'scripts', 'backup-postgres.ps1')
      : path.join(root, 'scripts', 'backup-postgres.sh');

  return new Promise<{ ok: boolean; output: string }>((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'powershell' : 'sh';
    const args =
      process.platform === 'win32'
        ? ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]
        : [scriptPath];

    const child = spawn(cmd, args, { env: process.env, cwd: process.cwd() });
    let output = '';
    child.stdout?.on('data', (d) => {
      output += d.toString();
    });
    child.stderr?.on('data', (d) => {
      output += d.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[backup] Completed\n${output}`);
        resolve({ ok: true, output });
      } else {
        const err = new Error(`Backup script exited with code ${code}`);
        captureException(err, 'backup');
        reject(err);
      }
    });
    child.on('error', (err) => {
      captureException(err, 'backup');
      reject(err);
    });
  });
}

export async function processCampaignSend(job: Job) {
  const { campaignId, organizationId } = job.data as {
    campaignId: string;
    organizationId: string;
  };

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { customers: true },
  });

  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const totalCustomers = campaign.customers.length;

  for (let i = 0; i < totalCustomers; i++) {
    await new Promise((r) => setTimeout(r, 200));
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { sentCount: i + 1 },
    });
    await job.updateProgress(Math.round(((i + 1) / totalCustomers) * 100));
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: MarketingCampaignStatus.COMPLETED },
  });

  return { sent: totalCustomers };
}
