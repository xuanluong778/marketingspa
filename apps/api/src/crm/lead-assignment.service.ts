import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadAssignmentMode, LeadPipelineStatus } from '@marketingspa/database';
import {
  openLeadStatuses,
  pickBestAssignmentRule,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';

const CLAIM_TTL_MS = 5 * 60_000;
const DEFAULT_SLA_MINUTES = 15;

export type AutoAssignOpts = {
  branchId?: string | null;
  leadSourceId?: string | null;
  adCampaignId?: string | null;
  score?: number | null;
  preferredEmployeeId?: string | null;
  /** Skip this employee (SLA reassign) */
  excludeEmployeeId?: string | null;
};

@Injectable()
export class LeadAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  computeScore(input: {
    estimatedValue?: number | null;
    hasPhone?: boolean;
    hasEmail?: boolean;
    platform?: string | null;
  }) {
    let score = 10;
    if (input.hasPhone) score += 20;
    if (input.hasEmail) score += 10;
    if (input.estimatedValue && Number(input.estimatedValue) > 0) {
      score += Math.min(40, Math.floor(Number(input.estimatedValue) / 500_000) * 5);
    }
    if (input.platform === 'META' || input.platform === 'GOOGLE') score += 15;
    return Math.min(100, score);
  }

  slaRespondBy(from = new Date(), minutes = DEFAULT_SLA_MINUTES) {
    return new Date(from.getTime() + minutes * 60_000);
  }

  async autoAssign(organizationId: string, opts: AutoAssignOpts = {}): Promise<string | null> {
    if (opts.preferredEmployeeId && opts.preferredEmployeeId !== opts.excludeEmployeeId) {
      const emp = await this.prisma.employee.findFirst({
        where: {
          id: opts.preferredEmployeeId,
          organizationId,
          isActive: true,
        },
      });
      if (emp) return emp.id;
    }

    const rules = await this.prisma.leadAssignmentRule.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const rule = pickBestAssignmentRule(rules, {
      branchId: opts.branchId,
      leadSourceId: opts.leadSourceId,
      adCampaignId: opts.adCampaignId,
      score: opts.score ?? 0,
    });

    if (!rule) {
      return this.fallbackEmployee(organizationId, opts);
    }

    if (rule.mode === LeadAssignmentMode.EMPLOYEE) {
      const id = rule.employeeIds.find((x) => x !== opts.excludeEmployeeId) ?? null;
      if (!id) return this.fallbackEmployee(organizationId, opts);
      const emp = await this.prisma.employee.findFirst({
        where: { id, organizationId, isActive: true },
      });
      return emp?.id ?? this.fallbackEmployee(organizationId, opts);
    }

    const pool = await this.resolvePool(organizationId, rule, opts);
    if (!pool.length) return this.fallbackEmployee(organizationId, opts);

    if (rule.mode === LeadAssignmentMode.LEAST_LOADED) {
      return this.pickLeastLoaded(
        organizationId,
        pool.map((p) => p.id),
      );
    }

    if (rule.mode === LeadAssignmentMode.BY_SCORE) {
      const score = opts.score ?? 0;
      if (score >= (rule.minScore ?? 70)) {
        return this.pickLeastLoaded(
          organizationId,
          pool.map((p) => p.id),
        );
      }
      return this.pickRoundRobin(
        rule.id,
        rule.lastIndex,
        pool.map((p) => p.id),
      );
    }

    // BRANCH + ROUND_ROBIN
    return this.pickRoundRobin(
      rule.id,
      rule.lastIndex,
      pool.map((p) => p.id),
    );
  }

  /**
   * Reassign lead after SLA breach (optional). Returns new assignee or null.
   */
  async reassignOnSla(
    organizationId: string,
    lead: {
      id: string;
      assignedToId?: string | null;
      branchId?: string | null;
      leadSourceId?: string | null;
      score?: number | null;
      adCampaignId?: string | null;
    },
  ): Promise<{ previousId: string | null; nextId: string | null; ruleId: string | null }> {
    const rules = await this.prisma.leadAssignmentRule.findMany({
      where: { organizationId, isActive: true, reassignOnSla: true },
    });
    const rule = pickBestAssignmentRule(rules, {
      branchId: lead.branchId,
      leadSourceId: lead.leadSourceId,
      adCampaignId: lead.adCampaignId,
      score: lead.score ?? 0,
    });
    if (!rule) return { previousId: lead.assignedToId ?? null, nextId: null, ruleId: null };

    const nextId = await this.autoAssign(organizationId, {
      branchId: lead.branchId,
      leadSourceId: lead.leadSourceId,
      adCampaignId: lead.adCampaignId,
      score: lead.score,
      excludeEmployeeId: lead.assignedToId,
    });
    if (!nextId || nextId === lead.assignedToId) {
      return { previousId: lead.assignedToId ?? null, nextId: null, ruleId: rule.id };
    }
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: { assignedToId: nextId },
    });
    await this.prisma.leadActivity.create({
      data: {
        organizationId,
        leadId: lead.id,
        action: 'LEAD_REASSIGNED',
        fromValue: lead.assignedToId ?? undefined,
        toValue: nextId,
        metadata: { reason: 'SLA_BREACH', ruleId: rule.id },
      },
    });
    return { previousId: lead.assignedToId ?? null, nextId, ruleId: rule.id };
  }

  async findMatchingRule(organizationId: string, opts: AutoAssignOpts) {
    const rules = await this.prisma.leadAssignmentRule.findMany({
      where: { organizationId, isActive: true },
    });
    return pickBestAssignmentRule(rules, {
      branchId: opts.branchId,
      leadSourceId: opts.leadSourceId,
      adCampaignId: opts.adCampaignId,
      score: opts.score ?? 0,
    });
  }

  private async resolvePool(
    organizationId: string,
    rule: {
      employeeIds: string[];
      branchId: string | null;
      mode: LeadAssignmentMode;
    },
    opts: AutoAssignOpts,
  ) {
    const exclude = opts.excludeEmployeeId;
    if (rule.employeeIds.length > 0) {
      return this.prisma.employee.findMany({
        where: {
          organizationId,
          isActive: true,
          id: {
            in: exclude
              ? rule.employeeIds.filter((id) => id !== exclude)
              : rule.employeeIds,
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }
    const branchId =
      rule.mode === LeadAssignmentMode.BRANCH
        ? rule.branchId ?? opts.branchId
        : rule.branchId ?? opts.branchId;
    return this.prisma.employee.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
        ...(exclude ? { id: { not: exclude } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async pickRoundRobin(ruleId: string, lastIndex: number, poolIds: string[]) {
    if (!poolIds.length) return null;
    const nextIndex = (lastIndex + 1) % poolIds.length;
    await this.prisma.leadAssignmentRule.update({
      where: { id: ruleId },
      data: { lastIndex: nextIndex },
    });
    return poolIds[nextIndex]!;
  }

  private async pickLeastLoaded(organizationId: string, poolIds: string[]) {
    if (!poolIds.length) return null;
    const open = openLeadStatuses() as LeadPipelineStatus[];
    const counts = await this.prisma.lead.groupBy({
      by: ['assignedToId'],
      where: {
        organizationId,
        assignedToId: { in: poolIds },
        pipelineStatus: { in: open },
      },
      _count: { _all: true },
    });
    const map = new Map(counts.map((c) => [c.assignedToId!, c._count._all]));
    let bestId = poolIds[0]!;
    let bestCount = map.get(bestId) ?? 0;
    for (const id of poolIds) {
      const n = map.get(id) ?? 0;
      if (n < bestCount) {
        bestId = id;
        bestCount = n;
      }
    }
    return bestId;
  }

  private async fallbackEmployee(organizationId: string, opts: AutoAssignOpts) {
    const emp = await this.prisma.employee.findFirst({
      where: {
        organizationId,
        isActive: true,
        ...(opts.branchId ? { branchId: opts.branchId } : {}),
        ...(opts.excludeEmployeeId ? { id: { not: opts.excludeEmployeeId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return emp?.id ?? null;
  }

  async claimLead(organizationId: string, leadId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found in organization');
    }

    const now = new Date();
    const result = await this.prisma.lead.updateMany({
      where: {
        id: leadId,
        organizationId,
        OR: [
          { claimedById: null },
          { claimExpiresAt: { lt: now } },
          { claimedById: employeeId },
        ],
      },
      data: {
        claimedById: employeeId,
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
        assignedToId: employeeId,
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Lead đang được nhân viên khác xử lý');
    }

    return this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { assignedTo: true, claimedBy: true },
    });
  }

  async releaseClaim(organizationId: string, leadId: string, employeeId: string) {
    await this.prisma.lead.updateMany({
      where: { id: leadId, organizationId, claimedById: employeeId },
      data: { claimedById: null, claimedAt: null, claimExpiresAt: null },
    });
  }

  async upsertRule(
    organizationId: string,
    data: {
      id?: string;
      name?: string | null;
      branchId?: string | null;
      leadSourceId?: string | null;
      adCampaignId?: string | null;
      minScore?: number | null;
      maxScore?: number | null;
      mode: LeadAssignmentMode;
      employeeIds?: string[];
      priority?: number;
      reassignOnSla?: boolean;
      notifyManager?: boolean;
      isActive?: boolean;
    },
  ) {
    if (data.leadSourceId) {
      const src = await this.prisma.leadSource.findFirst({
        where: { id: data.leadSourceId, organizationId },
      });
      if (!src) throw new NotFoundException('Lead source không thuộc tổ chức');
    }
    if (data.adCampaignId) {
      const camp = await this.prisma.adCampaign.findFirst({
        where: { id: data.adCampaignId, organizationId },
      });
      if (!camp) throw new NotFoundException('Campaign không thuộc tổ chức');
    }
    if (data.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: data.branchId, organizationId },
      });
      if (!branch) throw new NotFoundException('Chi nhánh không thuộc tổ chức');
    }

    if (data.id) {
      const owned = await this.prisma.leadAssignmentRule.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!owned) throw new NotFoundException('Assignment rule not found');
      return this.prisma.leadAssignmentRule.update({
        where: { id: data.id },
        data: {
          name: data.name === undefined ? undefined : data.name,
          branchId: data.branchId === undefined ? undefined : data.branchId,
          leadSourceId: data.leadSourceId === undefined ? undefined : data.leadSourceId,
          adCampaignId: data.adCampaignId === undefined ? undefined : data.adCampaignId,
          minScore: data.minScore === undefined ? undefined : data.minScore,
          maxScore: data.maxScore === undefined ? undefined : data.maxScore,
          mode: data.mode,
          employeeIds: data.employeeIds ?? owned.employeeIds,
          priority: data.priority ?? owned.priority,
          reassignOnSla: data.reassignOnSla ?? owned.reassignOnSla,
          notifyManager: data.notifyManager ?? owned.notifyManager,
          isActive: data.isActive ?? owned.isActive,
        },
        include: {
          branch: { select: { id: true, name: true } },
          leadSource: { select: { id: true, name: true } },
          adCampaign: { select: { id: true, name: true } },
        },
      });
    }

    return this.prisma.leadAssignmentRule.create({
      data: {
        organizationId,
        name: data.name ?? undefined,
        branchId: data.branchId ?? undefined,
        leadSourceId: data.leadSourceId ?? undefined,
        adCampaignId: data.adCampaignId ?? undefined,
        minScore: data.minScore ?? undefined,
        maxScore: data.maxScore ?? undefined,
        mode: data.mode,
        employeeIds: data.employeeIds ?? [],
        priority: data.priority ?? 0,
        reassignOnSla: data.reassignOnSla ?? false,
        notifyManager: data.notifyManager ?? true,
        isActive: data.isActive ?? true,
      },
      include: {
        branch: { select: { id: true, name: true } },
        leadSource: { select: { id: true, name: true } },
        adCampaign: { select: { id: true, name: true } },
      },
    });
  }

  listRules(organizationId: string) {
    return this.prisma.leadAssignmentRule.findMany({
      where: { organizationId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        branch: { select: { id: true, name: true } },
        leadSource: { select: { id: true, name: true } },
        adCampaign: { select: { id: true, name: true } },
      },
    });
  }

  async deleteRule(organizationId: string, id: string) {
    const owned = await this.prisma.leadAssignmentRule.findFirst({
      where: { id, organizationId },
    });
    if (!owned) throw new NotFoundException('Assignment rule not found');
    await this.prisma.leadAssignmentRule.delete({ where: { id } });
    return { ok: true };
  }
}
