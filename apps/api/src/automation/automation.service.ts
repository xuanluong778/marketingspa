import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationLogStatus, MessageChannel, MessageTemplateApprovalStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import { MessagingEligibilityService } from '../messaging/messaging-eligibility.service';
import { redactForAudit } from '../common/utils/token-security.util';
import {
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
  CreateAutomationFlowDto,
  UpdateAutomationFlowDto,
  SimulateAutomationDto,
  TemplateQueryDto,
  LogQueryDto,
} from './dto/automation.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import {
  extractTemplateVariables,
  renderTemplate,
  TEMPLATE_VARIABLES,
} from './template-renderer.util';
import { previewTemplateContent } from '@marketingspa/shared';
import type { PreviewMessageTemplateDto } from './dto/automation.dto';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantOwnershipService,
    private readonly eligibility: MessagingEligibilityService,
  ) {}

  getVariableCatalog() {
    return TEMPLATE_VARIABLES;
  }

  async listTemplates(organizationId: string, query: TemplateQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.MessageTemplateWhereInput = { organizationId };
    if (query.channel) {
      where.channel = query.channel;
    }
    const [items, total] = await Promise.all([
      this.prisma.messageTemplate.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.messageTemplate.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  async createTemplate(organizationId: string, dto: CreateMessageTemplateDto, userId?: string) {
    const variables = dto.variables ?? extractTemplateVariables(dto.body);
    const template = await this.prisma.messageTemplate.create({
      data: {
        organizationId,
        name: dto.name,
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        variables,
        isActive: dto.isActive ?? true,
        campaignKind: dto.campaignKind,
        providerMode: dto.providerMode,
        providerTemplateId: dto.providerTemplateId,
        approvalStatus: dto.approvalStatus ?? MessageTemplateApprovalStatus.DRAFT,
        mediaUrl: dto.mediaUrl,
        ctaLabel: dto.ctaLabel,
        ctaUrl: dto.ctaUrl,
        variableFallbacks: (dto.variableFallbacks ?? {}) as Prisma.InputJsonValue,
        contentBlocks: (dto.contentBlocks ?? []) as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_TEMPLATE_CREATED',
      entityType: 'MESSAGE_TEMPLATE',
      entityId: template.id,
      metadata: redactForAudit({ name: dto.name, channel: dto.channel }) as Prisma.InputJsonValue,
    });
    return template;
  }

  async updateTemplate(
    organizationId: string,
    id: string,
    dto: UpdateMessageTemplateDto,
    userId?: string,
  ) {
    await this.ensureTemplate(organizationId, id);
    const { variables, body, variableFallbacks, contentBlocks, ...rest } = dto;
    const template = await this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...rest,
        ...(body !== undefined && { body }),
        ...(variables !== undefined
          ? { variables }
          : body !== undefined
            ? { variables: extractTemplateVariables(body) }
            : {}),
        ...(variableFallbacks !== undefined && {
          variableFallbacks: variableFallbacks as Prisma.InputJsonValue,
        }),
        ...(contentBlocks !== undefined && {
          contentBlocks: contentBlocks as Prisma.InputJsonValue,
        }),
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_TEMPLATE_UPDATED',
      entityType: 'MESSAGE_TEMPLATE',
      entityId: id,
      metadata: redactForAudit(dto) as Prisma.InputJsonValue,
    });
    return template;
  }

  async previewTemplate(organizationId: string, id: string, dto: PreviewMessageTemplateDto) {
    const template = await this.ensureTemplate(organizationId, id);
    return previewTemplateContent({
      body: template.body,
      context: dto.context ?? {},
      fallbacks: (template.variableFallbacks ?? {}) as Record<string, string>,
      mediaUrl: template.mediaUrl,
      ctaLabel: template.ctaLabel,
      ctaUrl: template.ctaUrl,
    });
  }

  async deleteTemplate(organizationId: string, id: string, userId?: string) {
    await this.ensureTemplate(organizationId, id);
    const template = await this.prisma.messageTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_TEMPLATE_DELETED',
      entityType: 'MESSAGE_TEMPLATE',
      entityId: id,
    });
    return template;
  }

  listFlows(organizationId: string) {
    return this.prisma.automationFlow.findMany({
      where: { organizationId },
      include: {
        messageTemplate: true,
        funnel: { select: { id: true, selectedSlug: true, prompt: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listFunnels(organizationId: string) {
    return this.prisma.funnelRecommendation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        prompt: true,
        selectedSlug: true,
        completeGeneratedAt: true,
        createdAt: true,
      },
    });
  }

  private async assertFunnel(organizationId: string, funnelId: string) {
    const row = await this.prisma.funnelRecommendation.findFirst({
      where: { id: funnelId, organizationId },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('Funnel không tồn tại hoặc không thuộc tổ chức');
    return row;
  }

  async createFlow(
    organizationId: string,
    dto: CreateAutomationFlowDto,
    userId?: string,
    canApprove = false,
  ) {
    if (dto.messageTemplateId) {
      await this.ensureTemplate(organizationId, dto.messageTemplateId);
    }
    if (dto.funnelId) {
      await this.assertFunnel(organizationId, dto.funnelId);
    }
    const isActive = dto.isActive !== undefined ? dto.isActive : canApprove;
    if (isActive && !canApprove) {
      throw new BadRequestException('Cần quyền automation.campaign.approve để kích hoạt flow');
    }

    const flow = await this.prisma.automationFlow.create({
      data: {
        organizationId,
        funnelId: dto.funnelId,
        name: dto.name,
        triggerType: dto.triggerType,
        messageTemplateId: dto.messageTemplateId,
        channel: dto.channel,
        delayMinutes: dto.delayMinutes ?? 0,
        triggerConfig: (dto.triggerConfig ?? {}) as Prisma.InputJsonValue,
        actions: (dto.actions ?? []) as Prisma.InputJsonValue,
        isActive,
        isPaused: dto.isPaused ?? false,
        quietHoursStart: dto.quietHoursStart,
        quietHoursEnd: dto.quietHoursEnd,
        maxSendsPerDay: dto.maxSendsPerDay,
        cooldownMinutes: dto.cooldownMinutes ?? 0,
      },
      include: {
        messageTemplate: true,
        funnel: { select: { id: true, selectedSlug: true, prompt: true, createdAt: true } },
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_FLOW_CREATED',
      entityType: 'AUTOMATION_FLOW',
      entityId: flow.id,
      metadata: redactForAudit({
        name: dto.name,
        triggerType: dto.triggerType,
      }) as Prisma.InputJsonValue,
    });
    return flow;
  }

  async updateFlow(
    organizationId: string,
    id: string,
    dto: UpdateAutomationFlowDto,
    userId?: string,
    canApprove = false,
  ) {
    const existing = await this.ensureFlow(organizationId, id);
    if (dto.messageTemplateId) {
      await this.ensureTemplate(organizationId, dto.messageTemplateId);
    }
    if (dto.funnelId) {
      await this.assertFunnel(organizationId, dto.funnelId);
    }
    if (dto.isActive === true && !canApprove) {
      throw new BadRequestException('Dùng endpoint approve để kích hoạt flow');
    }
    if (dto.isActive === false && existing.isActive) {
      // allowed — deactivate without approve
    }

    const { triggerConfig, actions, ...rest } = dto;
    const flow = await this.prisma.automationFlow.update({
      where: { id },
      data: {
        ...rest,
        ...(triggerConfig !== undefined && {
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
        }),
        ...(actions !== undefined && { actions: actions as Prisma.InputJsonValue }),
      },
      include: {
        messageTemplate: true,
        funnel: { select: { id: true, selectedSlug: true, prompt: true, createdAt: true } },
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_FLOW_UPDATED',
      entityType: 'AUTOMATION_FLOW',
      entityId: id,
      metadata: redactForAudit(dto) as Prisma.InputJsonValue,
    });
    return flow;
  }

  async approveFlow(organizationId: string, id: string, userId?: string) {
    await this.ensureFlow(organizationId, id);
    const flow = await this.prisma.automationFlow.update({
      where: { id },
      data: { isActive: true },
      include: { messageTemplate: true },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_FLOW_APPROVED',
      entityType: 'AUTOMATION_FLOW',
      entityId: id,
    });
    return flow;
  }

  async pauseFlow(organizationId: string, id: string, isPaused: boolean, userId?: string) {
    await this.ensureFlow(organizationId, id);
    const flow = await this.prisma.automationFlow.update({
      where: { id },
      data: { isPaused },
      include: { messageTemplate: true },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: isPaused ? 'AUTOMATION_FLOW_PAUSED' : 'AUTOMATION_FLOW_RESUMED',
      entityType: 'AUTOMATION_FLOW',
      entityId: id,
    });
    return flow;
  }

  async deleteFlow(organizationId: string, id: string, userId?: string) {
    await this.ensureFlow(organizationId, id);
    const flow = await this.prisma.automationFlow.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_FLOW_CANCELLED',
      entityType: 'AUTOMATION_FLOW',
      entityId: id,
    });
    return flow;
  }

  /** Placeholder: giả lập gửi tin — render template + ghi AutomationLog */
  async simulate(
    organizationId: string,
    flowId: string,
    dto: SimulateAutomationDto,
    userId?: string,
  ) {
    const flow = await this.ensureFlow(organizationId, flowId);
    if (!flow.isActive) {
      throw new BadRequestException('Flow chưa được duyệt/kích hoạt');
    }
    const template = flow.messageTemplate;
    const channel = flow.channel ?? template?.channel ?? MessageChannel.ZALO;

    const eligibility = await this.eligibility.check({
      organizationId,
      channel,
      campaignType: 'automation',
      flowId: flow.id,
      leadId: dto.leadId,
      customerId: dto.customerId,
      templateId: template?.id,
    });

    if (!eligibility.eligible) {
      const skippedLog = await this.prisma.automationLog.create({
        data: {
          organizationId,
          automationFlowId: flow.id,
          customerId: dto.customerId,
          leadId: dto.leadId,
          channel,
          status: AutomationLogStatus.SKIPPED,
          executedAt: new Date(),
          result: {
            eligibility: JSON.parse(JSON.stringify(eligibility)),
            simulated: true,
          } as Prisma.InputJsonValue,
        },
      });
      return {
        message: eligibility.reasonMessage ?? 'Không đủ điều kiện gửi',
        eligibility,
        log: skippedLog,
      };
    }

    let context: Record<string, string> = { ...(dto.context ?? {}) };

    if (dto.customerId) {
      await this.tenant.assertCustomer(organizationId, dto.customerId);
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId },
        include: { branch: true },
      });
      if (customer) {
        context = {
          ...context,
          customer_name: customer.name,
          branch_name: customer.branch?.name ?? context.branch_name ?? '',
        };
      }
    }

    if (dto.leadId) {
      await this.tenant.assertLead(organizationId, dto.leadId);
      const lead = await this.prisma.lead.findFirst({
        where: { id: dto.leadId, organizationId },
      });
      if (lead) {
        context = {
          ...context,
          customer_name: lead.name,
        };
      }
    }

    const bodyTemplate = template?.body ?? 'Tin nhắn giả lập — chưa gắn template';
    const renderedContent = renderTemplate(bodyTemplate, context);

    const log = await this.prisma.automationLog.create({
      data: {
        organizationId,
        automationFlowId: flow.id,
        customerId: dto.customerId,
        leadId: dto.leadId,
        channel,
        renderedContent,
        status: AutomationLogStatus.SENT,
        executedAt: new Date(),
        result: {
          simulated: true,
          channel,
          delayMinutes: flow.delayMinutes,
          message: 'Tin nhắn giả lập — chưa gửi thật ở MVP',
          eligibility: JSON.parse(JSON.stringify(eligibility)),
        } as Prisma.InputJsonValue,
      },
      include: { customer: true, lead: true, automationFlow: true },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'AUTOMATION_FLOW_SENT',
      entityType: 'AUTOMATION_FLOW',
      entityId: flow.id,
      metadata: redactForAudit({
        logId: log.id,
        channel,
        customerId: dto.customerId,
        leadId: dto.leadId,
        simulated: true,
      }) as Prisma.InputJsonValue,
    });

    return { message: 'Automation đã chạy giả lập', log };
  }

  async listLogs(organizationId: string, query: LogQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.AutomationLogWhereInput = {
      organizationId,
      ...(query.channel && { channel: query.channel }),
    };
    const [items, total] = await Promise.all([
      this.prisma.automationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { automationFlow: true, customer: true, lead: true },
      }),
      this.prisma.automationLog.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  private async ensureTemplate(organizationId: string, id: string) {
    const t = await this.prisma.messageTemplate.findFirst({ where: { id, organizationId } });
    if (!t) throw new NotFoundException('Template không tồn tại');
    return t;
  }

  private async ensureFlow(organizationId: string, id: string) {
    const f = await this.prisma.automationFlow.findFirst({
      where: { id, organizationId },
      include: { messageTemplate: true },
    });
    if (!f) throw new NotFoundException('Automation flow không tồn tại');
    return f;
  }
}
