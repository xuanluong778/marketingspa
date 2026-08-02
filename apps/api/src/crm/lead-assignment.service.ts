import { ConflictException, Injectable } from '@nestjs/common';
import { LeadAssignmentMode, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';

const CLAIM_TTL_MS = 5 * 60_000;
const DEFAULT_SLA_MINUTES = 15;

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

  async autoAssign(
    organizationId: string,
    opts: { branchId?: string | null; preferredEmployeeId?: string | null },
  ): Promise<string | null> {
    if (opts.preferredEmployeeId) {
      const emp = await this.prisma.employee.findFirst({
        where: {
          id: opts.preferredEmployeeId,
          organizationId,
          isActive: true,
        },
      });
      if (emp) return emp.id;
    }

    const rule = await this.prisma.leadAssignmentRule.findFirst({
      where: {
        organizationId,
        isActive: true,
        OR: [{ branchId: opts.branchId ?? null }, { branchId: null }],
      },
      orderBy: [{ branchId: 'desc' }],
    });

    if (!rule) {
      // Fallback: first active employee at branch (or org)
      const emp = await this.prisma.employee.findFirst({
        where: {
          organizationId,
          isActive: true,
          ...(opts.branchId ? { branchId: opts.branchId } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });
      return emp?.id ?? null;
    }

    if (rule.mode === LeadAssignmentMode.EMPLOYEE && rule.employeeIds[0]) {
      return rule.employeeIds[0];
    }

    if (rule.mode === LeadAssignmentMode.BRANCH || rule.mode === LeadAssignmentMode.ROUND_ROBIN) {
      const pool =
        rule.employeeIds.length > 0
          ? await this.prisma.employee.findMany({
              where: {
                organizationId,
                isActive: true,
                id: { in: rule.employeeIds },
              },
              orderBy: { createdAt: 'asc' },
            })
          : await this.prisma.employee.findMany({
              where: {
                organizationId,
                isActive: true,
                ...(rule.branchId || opts.branchId
                  ? { branchId: rule.branchId ?? opts.branchId ?? undefined }
                  : {}),
              },
              orderBy: { createdAt: 'asc' },
            });

      if (!pool.length) return null;
      const nextIndex = (rule.lastIndex + 1) % pool.length;
      await this.prisma.leadAssignmentRule.update({
        where: { id: rule.id },
        data: { lastIndex: nextIndex },
      });
      return pool[nextIndex]!.id;
    }

    return null;
  }

  /**
   * Claim lead for exclusive handling. Fails if another open claim exists.
   */
  async claimLead(
    organizationId: string,
    leadId: string,
    employeeId: string,
  ) {
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
      branchId?: string | null;
      mode: LeadAssignmentMode;
      employeeIds?: string[];
      isActive?: boolean;
    },
  ) {
    if (data.id) {
      return this.prisma.leadAssignmentRule.update({
        where: { id: data.id },
        data: {
          branchId: data.branchId,
          mode: data.mode,
          employeeIds: data.employeeIds ?? [],
          isActive: data.isActive ?? true,
        },
      });
    }
    return this.prisma.leadAssignmentRule.create({
      data: {
        organizationId,
        branchId: data.branchId,
        mode: data.mode,
        employeeIds: data.employeeIds ?? [],
        isActive: data.isActive ?? true,
      },
    });
  }

  listRules(organizationId: string) {
    return this.prisma.leadAssignmentRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
