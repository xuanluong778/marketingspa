import { Injectable } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateMessagingOrgPolicyDto } from './dto/messaging-org-policy.dto';

const DEFAULTS = {
  timezone: 'Asia/Ho_Chi_Minh',
  quietHoursStart: '22:00' as string | null,
  quietHoursEnd: '08:00' as string | null,
  maxMessagesPerRecipientPerDay: 3,
  campaignCooldownMinutes: 1440,
  channelRateLimits: {} as Record<string, number>,
  excludeRecentlyManualMessaged: true,
  manualMessageLookbackMinutes: 60,
  stopOnReply: true,
  stopOnOptOut: true,
  createTaskOnReply: true,
  assignEmployeeOnReply: false,
  handoverToChatbotOnReply: true,
  optOutKeywords: ['STOP', 'DUNG', 'HUY', 'UNSUBSCRIBE', 'OPT OUT'],
};

@Injectable()
export class MessagingOrgPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOrCreate(organizationId: string) {
    const existing = await this.prisma.messagingOrgPolicy.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;
    return this.prisma.messagingOrgPolicy.create({
      data: {
        organizationId,
        ...DEFAULTS,
        channelRateLimits: DEFAULTS.channelRateLimits as Prisma.InputJsonValue,
        optOutKeywords: DEFAULTS.optOutKeywords as Prisma.InputJsonValue,
      },
    });
  }

  async update(organizationId: string, dto: UpdateMessagingOrgPolicyDto, userId?: string) {
    await this.getOrCreate(organizationId);
    const updated = await this.prisma.messagingOrgPolicy.update({
      where: { organizationId },
      data: {
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.quietHoursStart !== undefined && { quietHoursStart: dto.quietHoursStart }),
        ...(dto.quietHoursEnd !== undefined && { quietHoursEnd: dto.quietHoursEnd }),
        ...(dto.maxMessagesPerRecipientPerDay !== undefined && {
          maxMessagesPerRecipientPerDay: dto.maxMessagesPerRecipientPerDay,
        }),
        ...(dto.campaignCooldownMinutes !== undefined && {
          campaignCooldownMinutes: dto.campaignCooldownMinutes,
        }),
        ...(dto.channelRateLimits !== undefined && {
          channelRateLimits: dto.channelRateLimits as Prisma.InputJsonValue,
        }),
        ...(dto.excludeRecentlyManualMessaged !== undefined && {
          excludeRecentlyManualMessaged: dto.excludeRecentlyManualMessaged,
        }),
        ...(dto.manualMessageLookbackMinutes !== undefined && {
          manualMessageLookbackMinutes: dto.manualMessageLookbackMinutes,
        }),
        ...(dto.stopOnReply !== undefined && { stopOnReply: dto.stopOnReply }),
        ...(dto.stopOnOptOut !== undefined && { stopOnOptOut: dto.stopOnOptOut }),
        ...(dto.createTaskOnReply !== undefined && { createTaskOnReply: dto.createTaskOnReply }),
        ...(dto.assignEmployeeOnReply !== undefined && {
          assignEmployeeOnReply: dto.assignEmployeeOnReply,
        }),
        ...(dto.handoverToChatbotOnReply !== undefined && {
          handoverToChatbotOnReply: dto.handoverToChatbotOnReply,
        }),
        ...(dto.optOutKeywords !== undefined && {
          optOutKeywords: dto.optOutKeywords as Prisma.InputJsonValue,
        }),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_ORG_POLICY_UPDATED',
      entityType: 'MESSAGING_ORG_POLICY',
      entityId: updated.id,
      metadata: dto as unknown as Prisma.InputJsonValue,
    });

    return updated;
  }
}
