import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadPipelineStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_PIPELINE: Array<{
  name: string;
  code: LeadPipelineStatus;
  position: number;
  color: string;
  isLostStage?: boolean;
}> = [
  { name: 'Lead mới', code: LeadPipelineStatus.NEW, position: 0, color: '#3b82f6' },
  { name: 'Đã liên hệ', code: LeadPipelineStatus.CONTACTED, position: 1, color: '#06b6d4' },
  { name: 'Đủ điều kiện', code: LeadPipelineStatus.QUALIFIED, position: 2, color: '#8b5cf6' },
  { name: 'Đã đặt lịch', code: LeadPipelineStatus.BOOKED, position: 3, color: '#f59e0b' },
  { name: 'Đã xác nhận', code: LeadPipelineStatus.CONFIRMED, position: 4, color: '#f97316' },
  { name: 'Đã đến', code: LeadPipelineStatus.VISITED, position: 5, color: '#a855f7' },
  { name: 'Đã mua', code: LeadPipelineStatus.PURCHASED, position: 6, color: '#22c55e' },
  {
    name: 'Mất lead',
    code: LeadPipelineStatus.LOST,
    position: 7,
    color: '#9ca3af',
    isLostStage: true,
  },
];

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultPipeline(organizationId: string) {
    const count = await this.prisma.funnelStage.count({ where: { organizationId } });
    if (count > 0) {
      // Backfill code for legacy stages when missing
      for (const stage of DEFAULT_PIPELINE) {
        await this.prisma.funnelStage.updateMany({
          where: { organizationId, name: stage.name, code: null },
          data: { code: stage.code, isLostStage: !!stage.isLostStage },
        });
      }
      return this.listStages(organizationId);
    }

    await this.prisma.funnelStage.createMany({
      data: DEFAULT_PIPELINE.map((s) => ({
        organizationId,
        name: s.name,
        code: s.code,
        position: s.position,
        color: s.color,
        isDefault: s.code === LeadPipelineStatus.NEW,
        isLostStage: !!s.isLostStage,
        isActive: true,
      })),
    });
    return this.listStages(organizationId);
  }

  listStages(organizationId: string) {
    return this.prisma.funnelStage.findMany({
      where: { organizationId, isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async upsertStage(
    organizationId: string,
    data: {
      id?: string;
      name: string;
      code?: LeadPipelineStatus;
      position?: number;
      color?: string;
      isLostStage?: boolean;
      isActive?: boolean;
    },
  ) {
    if (data.id) {
      const owned = await this.prisma.funnelStage.findFirst({
        where: { id: data.id, organizationId },
      });
      if (!owned) {
        throw new NotFoundException('Funnel stage not found');
      }
      return this.prisma.funnelStage.update({
        where: { id: data.id },
        data: {
          name: data.name,
          code: data.code,
          position: data.position,
          color: data.color,
          isLostStage: data.isLostStage,
          isActive: data.isActive,
        },
      });
    }
    return this.prisma.funnelStage.create({
      data: {
        organizationId,
        name: data.name,
        code: data.code,
        position: data.position ?? 99,
        color: data.color,
        isLostStage: data.isLostStage ?? false,
        isActive: data.isActive ?? true,
      },
    });
  }

  /** Soft-deactivate — keep historical leads pointing at stage */
  async deactivateStage(organizationId: string, id: string) {
    return this.prisma.funnelStage.updateMany({
      where: { id, organizationId },
      data: { isActive: false },
    });
  }

  async resolveStageForStatus(organizationId: string, status: LeadPipelineStatus) {
    await this.ensureDefaultPipeline(organizationId);
    return this.prisma.funnelStage.findFirst({
      where: { organizationId, code: status, isActive: true },
      orderBy: { position: 'asc' },
    });
  }
}
