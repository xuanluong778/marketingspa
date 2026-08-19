import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FunnelStageCategory,
  LeadPipelineStatus,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';

export type DefaultStageSeed = {
  name: string;
  code: string;
  category: FunnelStageCategory;
  position: number;
  color: string;
  probability: number;
  slaMinutes?: number;
  isWon?: boolean;
  isLost?: boolean;
  legacyStatus?: LeadPipelineStatus;
};

/** Canonical spa default stages — codes mirror LeadPipelineStatus for legacy compat */
export const DEFAULT_PIPELINE_STAGES: DefaultStageSeed[] = [
  {
    name: 'Lead mới',
    code: 'NEW',
    category: FunnelStageCategory.OPEN,
    position: 0,
    color: '#3b82f6',
    probability: 10,
    slaMinutes: 15,
    legacyStatus: LeadPipelineStatus.NEW,
  },
  {
    name: 'Đã liên hệ',
    code: 'CONTACTED',
    category: FunnelStageCategory.IN_PROGRESS,
    position: 1,
    color: '#06b6d4',
    probability: 20,
    slaMinutes: 60,
    legacyStatus: LeadPipelineStatus.CONTACTED,
  },
  {
    name: 'Đủ điều kiện',
    code: 'QUALIFIED',
    category: FunnelStageCategory.QUALIFIED,
    position: 2,
    color: '#8b5cf6',
    probability: 40,
    slaMinutes: 120,
    legacyStatus: LeadPipelineStatus.QUALIFIED,
  },
  {
    name: 'Đã đặt lịch',
    code: 'BOOKED',
    category: FunnelStageCategory.BOOKING,
    position: 3,
    color: '#f59e0b',
    probability: 50,
    slaMinutes: 1440,
    legacyStatus: LeadPipelineStatus.BOOKED,
  },
  {
    name: 'Đã xác nhận',
    code: 'CONFIRMED',
    category: FunnelStageCategory.BOOKING,
    position: 4,
    color: '#f97316',
    probability: 60,
    slaMinutes: 720,
    legacyStatus: LeadPipelineStatus.CONFIRMED,
  },
  {
    name: 'Đã đến',
    code: 'VISITED',
    category: FunnelStageCategory.BOOKING,
    position: 5,
    color: '#a855f7',
    probability: 70,
    legacyStatus: LeadPipelineStatus.VISITED,
  },
  {
    name: 'Đã mua',
    code: 'PURCHASED',
    category: FunnelStageCategory.WON,
    position: 6,
    color: '#22c55e',
    probability: 100,
    isWon: true,
    legacyStatus: LeadPipelineStatus.PURCHASED,
  },
  {
    name: 'Mất lead',
    code: 'LOST',
    category: FunnelStageCategory.LOST,
    position: 7,
    color: '#9ca3af',
    probability: 0,
    isLost: true,
    legacyStatus: LeadPipelineStatus.LOST,
  },
];

/** @deprecated alias — use DEFAULT_PIPELINE_STAGES */
export const DEFAULT_PIPELINE = DEFAULT_PIPELINE_STAGES.map((s) => ({
  name: s.name,
  code: s.legacyStatus!,
  position: s.position,
  color: s.color,
  isLostStage: !!s.isLost,
}));

const LEGACY_STATUS_SET = new Set<string>(Object.values(LeadPipelineStatus));

export function parseLegacyStatus(code?: string | null): LeadPipelineStatus | null {
  if (!code) return null;
  return LEGACY_STATUS_SET.has(code) ? (code as LeadPipelineStatus) : null;
}

export function categoryForLegacy(status: LeadPipelineStatus): FunnelStageCategory {
  switch (status) {
    case LeadPipelineStatus.NEW:
      return FunnelStageCategory.OPEN;
    case LeadPipelineStatus.CONTACTED:
      return FunnelStageCategory.IN_PROGRESS;
    case LeadPipelineStatus.QUALIFIED:
      return FunnelStageCategory.QUALIFIED;
    case LeadPipelineStatus.BOOKED:
    case LeadPipelineStatus.CONFIRMED:
    case LeadPipelineStatus.VISITED:
      return FunnelStageCategory.BOOKING;
    case LeadPipelineStatus.PURCHASED:
      return FunnelStageCategory.WON;
    case LeadPipelineStatus.LOST:
      return FunnelStageCategory.LOST;
    default:
      return FunnelStageCategory.CUSTOM;
  }
}

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultPipeline(organizationId: string): Promise<{
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    isActive: boolean;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    stages: Array<{
      id: string;
      organizationId: string;
      pipelineId: string;
      name: string;
      code: string;
      category: FunnelStageCategory;
      position: number;
      probability: Prisma.Decimal;
      slaMinutes: number | null;
      isWon: boolean;
      isLost: boolean;
      isActive: boolean;
      color: string | null;
      isDefault: boolean;
      legacyStatus: LeadPipelineStatus | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }> {
    let pipeline = await this.prisma.funnelPipeline.findFirst({
      where: { organizationId, isDefault: true, isActive: true },
      orderBy: { position: 'asc' },
    });

    if (!pipeline) {
      pipeline = await this.prisma.funnelPipeline.create({
        data: {
          organizationId,
          name: 'Pipeline mặc định',
          description: 'Default spa/beauty pipeline',
          isDefault: true,
          isActive: true,
          position: 0,
        },
      });
    }

    const stageCount = await this.prisma.funnelStage.count({
      where: { organizationId, pipelineId: pipeline.id },
    });

    if (stageCount === 0) {
      await this.prisma.funnelStage.createMany({
        data: DEFAULT_PIPELINE_STAGES.map((s) => ({
          organizationId,
          pipelineId: pipeline!.id,
          name: s.name,
          code: s.code,
          category: s.category,
          position: s.position,
          color: s.color,
          probability: new Prisma.Decimal(s.probability),
          slaMinutes: s.slaMinutes ?? null,
          isWon: !!s.isWon,
          isLost: !!s.isLost,
          isDefault: s.code === 'NEW',
          isActive: true,
          legacyStatus: s.legacyStatus ?? null,
        })),
      });
    } else {
      // Backfill legacyStatus / category gaps for older rows
      for (const seed of DEFAULT_PIPELINE_STAGES) {
        await this.prisma.funnelStage.updateMany({
          where: {
            organizationId,
            pipelineId: pipeline.id,
            code: seed.code,
            legacyStatus: null,
          },
          data: {
            legacyStatus: seed.legacyStatus,
            category: seed.category,
            isWon: !!seed.isWon,
            isLost: !!seed.isLost,
          },
        });
      }
    }

    return this.getPipelineWithStages(organizationId, pipeline.id);
  }

  listPipelines(organizationId: string) {
    return this.prisma.funnelPipeline.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
      include: {
        stages: {
          where: { isActive: true },
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  async getPipelineWithStages(
    organizationId: string,
    pipelineId?: string,
  ): Promise<{
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    isActive: boolean;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    stages: Array<{
      id: string;
      organizationId: string;
      pipelineId: string;
      name: string;
      code: string;
      category: FunnelStageCategory;
      position: number;
      probability: Prisma.Decimal;
      slaMinutes: number | null;
      isWon: boolean;
      isLost: boolean;
      isActive: boolean;
      color: string | null;
      isDefault: boolean;
      legacyStatus: LeadPipelineStatus | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }> {
    const pipeline = pipelineId
      ? await this.prisma.funnelPipeline.findFirst({
          where: { id: pipelineId, organizationId },
        })
      : await this.prisma.funnelPipeline.findFirst({
          where: { organizationId, isDefault: true, isActive: true },
          orderBy: { position: 'asc' },
        });

    if (!pipeline) {
      return this.ensureDefaultPipeline(organizationId);
    }

    const stages = await this.prisma.funnelStage.findMany({
      where: { organizationId, pipelineId: pipeline.id, isActive: true },
      orderBy: { position: 'asc' },
    });

    return { ...pipeline, stages };
  }

  /** Flat active stages for default pipeline — backward compatible with old listStages() */
  async listStages(organizationId: string, pipelineId?: string) {
    const pipeline = await this.ensureDefaultPipeline(organizationId);
    const pid = pipelineId ?? pipeline.id;
    return this.prisma.funnelStage.findMany({
      where: { organizationId, pipelineId: pid, isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async upsertStage(
    organizationId: string,
    data: {
      id?: string;
      pipelineId?: string;
      name: string;
      code?: string;
      category?: FunnelStageCategory;
      position?: number;
      color?: string;
      probability?: number;
      slaMinutes?: number | null;
      isWon?: boolean;
      isLost?: boolean;
      isActive?: boolean;
      /** @deprecated use isLost */
      isLostStage?: boolean;
    },
  ) {
    const defaultPipe = await this.ensureDefaultPipeline(organizationId);
    const pipelineId = data.pipelineId ?? defaultPipe.id;
    const ownedPipe = await this.prisma.funnelPipeline.findFirst({
      where: { id: pipelineId, organizationId },
    });
    if (!ownedPipe) throw new NotFoundException('Funnel pipeline not found');

    const isLost = data.isLost ?? data.isLostStage;
    const code = (data.code ?? data.name).trim().toUpperCase().replace(/\s+/g, '_');
    const legacyStatus = parseLegacyStatus(code);

    if (data.id) {
      const owned = await this.prisma.funnelStage.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!owned) throw new NotFoundException('Funnel stage not found');
      return this.prisma.funnelStage.update({
        where: { id: data.id },
        data: {
          name: data.name,
          code: data.code ?? owned.code,
          category: data.category,
          position: data.position,
          color: data.color,
          probability:
            data.probability !== undefined
              ? new Prisma.Decimal(data.probability)
              : undefined,
          slaMinutes: data.slaMinutes === undefined ? undefined : data.slaMinutes,
          isWon: data.isWon,
          isLost,
          isActive: data.isActive,
          legacyStatus: data.code !== undefined ? legacyStatus : undefined,
        },
      });
    }

    return this.prisma.funnelStage.create({
      data: {
        organizationId,
        pipelineId,
        name: data.name,
        code,
        category: data.category ?? (legacyStatus ? categoryForLegacy(legacyStatus) : FunnelStageCategory.CUSTOM),
        position: data.position ?? 99,
        color: data.color,
        probability: new Prisma.Decimal(data.probability ?? 0),
        slaMinutes: data.slaMinutes ?? null,
        isWon: data.isWon ?? legacyStatus === LeadPipelineStatus.PURCHASED,
        isLost: isLost ?? legacyStatus === LeadPipelineStatus.LOST,
        isActive: data.isActive ?? true,
        isDefault: code === 'NEW',
        legacyStatus,
      },
    });
  }

  async deactivateStage(organizationId: string, id: string) {
    return this.prisma.funnelStage.updateMany({
      where: { id, organizationId },
      data: { isActive: false },
    });
  }

  async resolveStageForStatus(
    organizationId: string,
    status: LeadPipelineStatus,
    pipelineId?: string,
  ) {
    const pipeline = await this.ensureDefaultPipeline(organizationId);
    const pid = pipelineId ?? pipeline.id;
    return this.prisma.funnelStage.findFirst({
      where: {
        organizationId,
        pipelineId: pid,
        isActive: true,
        OR: [{ legacyStatus: status }, { code: status }],
      },
      orderBy: { position: 'asc' },
    });
  }

  async resolveStageById(organizationId: string, stageId: string) {
    const stage = await this.prisma.funnelStage.findFirst({
      where: { id: stageId, organizationId, isActive: true },
    });
    if (!stage) throw new NotFoundException('Funnel stage not found');
    return stage;
  }

  /**
   * Dual-write payload for Lead: stage + pipeline + legacy pipelineStatus when mappable.
   */
  leadPointersFromStage(stage: {
    id: string;
    pipelineId: string;
    code: string;
    legacyStatus: LeadPipelineStatus | null;
    isWon: boolean;
    isLost: boolean;
  }): {
    stageId: string;
    pipelineId: string;
    pipelineStatus?: LeadPipelineStatus;
  } {
    const legacy =
      stage.legacyStatus ??
      parseLegacyStatus(stage.code) ??
      (stage.isWon
        ? LeadPipelineStatus.PURCHASED
        : stage.isLost
          ? LeadPipelineStatus.LOST
          : undefined);
    return {
      stageId: stage.id,
      pipelineId: stage.pipelineId,
      ...(legacy ? { pipelineStatus: legacy } : {}),
    };
  }

  async applyStageProposals(
    organizationId: string,
    stages: Array<{
      name: string;
      code: string;
      position: number;
      color?: string;
      category?: FunnelStageCategory | string;
      probability?: number;
      slaMinutes?: number | null;
      isWon?: boolean;
      isLost?: boolean;
      isLostStage?: boolean;
    }>,
    opts?: { deactivateMissing?: boolean; pipelineId?: string },
  ) {
    const pipeline = await this.ensureDefaultPipeline(organizationId);
    const pipelineId = opts?.pipelineId ?? pipeline.id;
    const owned = await this.prisma.funnelPipeline.findFirst({
      where: { id: pipelineId, organizationId },
    });
    if (!owned) throw new BadRequestException('Invalid pipelineId');

    const existing = await this.prisma.funnelStage.findMany({
      where: { organizationId, pipelineId },
    });
    const byCode = new Map(existing.map((s) => [s.code.toUpperCase(), s]));
    const applied: Array<{ id: string; code: string; name: string }> = [];

    for (const proposal of stages) {
      const code = proposal.code.trim().toUpperCase().replace(/\s+/g, '_');
      const legacyStatus = parseLegacyStatus(code);
      const isLost = proposal.isLost ?? proposal.isLostStage ?? code === 'LOST';
      const isWon = proposal.isWon ?? code === 'PURCHASED';
      const category =
        (proposal.category as FunnelStageCategory | undefined) ??
        (legacyStatus ? categoryForLegacy(legacyStatus) : FunnelStageCategory.CUSTOM);
      const row = byCode.get(code);

      if (row) {
        const updated = await this.prisma.funnelStage.update({
          where: { id: row.id },
          data: {
            name: proposal.name,
            position: proposal.position,
            color: proposal.color ?? row.color,
            category,
            probability: new Prisma.Decimal(proposal.probability ?? Number(row.probability)),
            slaMinutes:
              proposal.slaMinutes === undefined ? row.slaMinutes : proposal.slaMinutes,
            isWon,
            isLost,
            isActive: true,
            isDefault: code === 'NEW',
            legacyStatus: legacyStatus ?? row.legacyStatus,
          },
        });
        applied.push({ id: updated.id, code, name: updated.name });
      } else {
        const nameTaken = existing.find((s) => s.name === proposal.name);
        const name = nameTaken ? `${proposal.name} (${code})` : proposal.name;
        const created = await this.prisma.funnelStage.create({
          data: {
            organizationId,
            pipelineId,
            name,
            code,
            category,
            position: proposal.position,
            color: proposal.color,
            probability: new Prisma.Decimal(proposal.probability ?? 0),
            slaMinutes: proposal.slaMinutes ?? null,
            isWon,
            isLost,
            isDefault: code === 'NEW',
            isActive: true,
            legacyStatus,
          },
        });
        applied.push({ id: created.id, code, name: created.name });
        existing.push(created);
        byCode.set(code, created);
      }
    }

    if (opts?.deactivateMissing) {
      const keep = new Set(stages.map((s) => s.code.trim().toUpperCase().replace(/\s+/g, '_')));
      await this.prisma.funnelStage.updateMany({
        where: {
          organizationId,
          pipelineId,
          isActive: true,
          code: { notIn: [...keep] },
        },
        data: { isActive: false },
      });
    }

    return {
      pipelineId,
      stages: applied,
      pipeline: await this.listStages(organizationId, pipelineId),
    };
  }
}
