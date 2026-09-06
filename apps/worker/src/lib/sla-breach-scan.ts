import {
  LeadAssignmentMode,
  LeadPipelineStatus,
  prisma,
} from '@marketingspa/database';
import {
  openLeadStatuses,
  pickBestAssignmentRule,
  WS_EVENTS,
} from '@marketingspa/shared';
import type Redis from 'ioredis';
import { publishRealtime } from './realtime';

const SLA_ALERT_TTL_SEC = 60 * 60;

/** Scan SLA overdue leads — mark breached, notify, optional reassign. */
export async function processSlaBreachScan(redis: Redis) {
  const now = new Date();
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let breached = 0;
  let reassigned = 0;

  for (const org of orgs) {
    const overdue = await prisma.lead.findMany({
      where: {
        organizationId: org.id,
        slaBreached: false,
        slaRespondBy: { lt: now },
        pipelineStatus: {
          notIn: [LeadPipelineStatus.PURCHASED, LeadPipelineStatus.LOST],
        },
      },
      take: 80,
      orderBy: { slaRespondBy: 'asc' },
      select: {
        id: true,
        name: true,
        assignedToId: true,
        branchId: true,
        leadSourceId: true,
        score: true,
        slaRespondBy: true,
        pipelineStatus: true,
        attribution: { select: { adCampaignId: true } },
        assignedTo: { select: { id: true, name: true, managerId: true } },
      },
    });

    if (!overdue.length) continue;

    for (const lead of overdue) {
      const lockKey = `marketingspa:sla-breach:${lead.id}`;
      const set = await redis.set(lockKey, '1', 'EX', SLA_ALERT_TTL_SEC, 'NX');
      if (set !== 'OK') continue;

      await prisma.lead.update({
        where: { id: lead.id },
        data: { slaBreached: true },
      });
      await prisma.leadActivity.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          action: 'SLA_BREACHED',
          toValue: lead.slaRespondBy?.toISOString() ?? undefined,
          metadata: {
            assignedToId: lead.assignedToId,
            pipelineStatus: lead.pipelineStatus,
          },
        },
      });
      breached += 1;

      const matching = await prisma.leadAssignmentRule.findMany({
        where: { organizationId: org.id, isActive: true },
      });
      const rule = pickBestAssignmentRule(matching, {
        branchId: lead.branchId,
        leadSourceId: lead.leadSourceId,
        adCampaignId: lead.attribution?.adCampaignId,
        score: lead.score,
      });

      const notifyManager = rule?.notifyManager !== false;
      const managerId =
        notifyManager && lead.assignedTo?.managerId ? lead.assignedTo.managerId : null;

      await publishRealtime(redis, org.id, WS_EVENTS.LEAD_SLA_BREACHED, {
        leadId: lead.id,
        name: lead.name,
        assignedToId: lead.assignedToId,
        managerId,
        slaRespondBy: lead.slaRespondBy?.toISOString() ?? null,
        pipelineStatus: lead.pipelineStatus,
      });

      // Task for assignee (or unassigned pool)
      await prisma.crmTask.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          assigneeId: lead.assignedToId ?? undefined,
          title: `SLA quá hạn — ${lead.name}`,
          dueAt: new Date(Date.now() + 30 * 60_000),
          source: 'sla-breach',
        },
      });

      if (rule?.reassignOnSla) {
        const nextId = await autoAssignWorker(org.id, {
          branchId: lead.branchId,
          leadSourceId: lead.leadSourceId,
          adCampaignId: lead.attribution?.adCampaignId,
          score: lead.score,
          excludeEmployeeId: lead.assignedToId,
        });
        if (nextId && nextId !== lead.assignedToId) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              assignedToId: nextId,
              // refresh SLA window after reassign
              slaBreached: false,
              slaRespondBy: new Date(Date.now() + 15 * 60_000),
            },
          });
          await prisma.leadActivity.create({
            data: {
              organizationId: org.id,
              leadId: lead.id,
              action: 'LEAD_REASSIGNED',
              fromValue: lead.assignedToId ?? undefined,
              toValue: nextId,
              metadata: { reason: 'SLA_BREACH', ruleId: rule.id },
            },
          });
          await publishRealtime(redis, org.id, WS_EVENTS.LEAD_REASSIGNED, {
            leadId: lead.id,
            name: lead.name,
            previousAssignedToId: lead.assignedToId,
            assignedToId: nextId,
            reason: 'SLA_BREACH',
          });
          reassigned += 1;
        }
      }
    }
  }

  return { organizations: orgs.length, breached, reassigned };
}

async function autoAssignWorker(
  organizationId: string,
  opts: {
    branchId?: string | null;
    leadSourceId?: string | null;
    adCampaignId?: string | null;
    score?: number | null;
    excludeEmployeeId?: string | null;
  },
): Promise<string | null> {
  const rules = await prisma.leadAssignmentRule.findMany({
    where: { organizationId, isActive: true },
  });
  const rule = pickBestAssignmentRule(rules, {
    branchId: opts.branchId,
    leadSourceId: opts.leadSourceId,
    adCampaignId: opts.adCampaignId,
    score: opts.score ?? 0,
  });

  const exclude = opts.excludeEmployeeId ?? undefined;

  if (!rule) {
    const emp = await prisma.employee.findFirst({
      where: {
        organizationId,
        isActive: true,
        ...(opts.branchId ? { branchId: opts.branchId } : {}),
        ...(exclude ? { id: { not: exclude } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return emp?.id ?? null;
  }

  if (rule.mode === LeadAssignmentMode.EMPLOYEE) {
    const id = rule.employeeIds.find((x) => x !== exclude) ?? null;
    return id;
  }

  let poolIds: string[] = [];
  if (rule.employeeIds.length) {
    poolIds = rule.employeeIds.filter((id) => id !== exclude);
  } else {
    const branchId = rule.branchId ?? opts.branchId;
    const pool = await prisma.employee.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
        ...(exclude ? { id: { not: exclude } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    poolIds = pool.map((p) => p.id);
  }
  if (!poolIds.length) return null;

  if (rule.mode === LeadAssignmentMode.LEAST_LOADED || rule.mode === LeadAssignmentMode.BY_SCORE) {
    const open = openLeadStatuses() as LeadPipelineStatus[];
    const counts = await prisma.lead.groupBy({
      by: ['assignedToId'],
      where: {
        organizationId,
        assignedToId: { in: poolIds },
        pipelineStatus: { in: open },
      },
      _count: { _all: true },
    });
    const map = new Map(counts.map((c) => [c.assignedToId!, c._count._all]));
    let best = poolIds[0]!;
    let bestN = map.get(best) ?? 0;
    for (const id of poolIds) {
      const n = map.get(id) ?? 0;
      if (n < bestN) {
        best = id;
        bestN = n;
      }
    }
    return best;
  }

  const nextIndex = (rule.lastIndex + 1) % poolIds.length;
  await prisma.leadAssignmentRule.update({
    where: { id: rule.id },
    data: { lastIndex: nextIndex },
  });
  return poolIds[nextIndex]!;
}
