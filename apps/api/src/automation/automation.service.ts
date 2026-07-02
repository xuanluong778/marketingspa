import { Injectable, NotFoundException } from '@nestjs/common';
import { AutomationLogStatus, MessageChannel, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  getVariableCatalog() {
    return TEMPLATE_VARIABLES;
  }

  async listTemplates(organizationId: string, query: TemplateQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.messageTemplate.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.messageTemplate.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createTemplate(organizationId: string, dto: CreateMessageTemplateDto) {
    const variables = dto.variables ?? extractTemplateVariables(dto.body);
    return this.prisma.messageTemplate.create({
      data: {
        organizationId,
        name: dto.name,
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        variables,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateTemplate(organizationId: string, id: string, dto: UpdateMessageTemplateDto) {
    await this.ensureTemplate(organizationId, id);
    const { variables, body, ...rest } = dto;
    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...rest,
        ...(body !== undefined && { body }),
        ...(variables !== undefined
          ? { variables }
          : body !== undefined
            ? { variables: extractTemplateVariables(body) }
            : {}),
      },
    });
  }

  async deleteTemplate(organizationId: string, id: string) {
    await this.ensureTemplate(organizationId, id);
    return this.prisma.messageTemplate.update({ where: { id }, data: { isActive: false } });
  }

  listFlows(organizationId: string) {
    return this.prisma.automationFlow.findMany({
      where: { organizationId },
      include: { messageTemplate: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  createFlow(organizationId: string, dto: CreateAutomationFlowDto) {
    return this.prisma.automationFlow.create({
      data: {
        organizationId,
        name: dto.name,
        triggerType: dto.triggerType,
        messageTemplateId: dto.messageTemplateId,
        channel: dto.channel,
        delayMinutes: dto.delayMinutes ?? 0,
        triggerConfig: (dto.triggerConfig ?? {}) as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
      include: { messageTemplate: true },
    });
  }

  async updateFlow(organizationId: string, id: string, dto: UpdateAutomationFlowDto) {
    await this.ensureFlow(organizationId, id);
    const { triggerConfig, ...rest } = dto;
    return this.prisma.automationFlow.update({
      where: { id },
      data: {
        ...rest,
        ...(triggerConfig !== undefined && {
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
        }),
      },
      include: { messageTemplate: true },
    });
  }

  async deleteFlow(organizationId: string, id: string) {
    await this.ensureFlow(organizationId, id);
    return this.prisma.automationFlow.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Placeholder: giả lập gửi tin — render template + ghi AutomationLog */
  async simulate(organizationId: string, flowId: string, dto: SimulateAutomationDto) {
    const flow = await this.ensureFlow(organizationId, flowId);
    const template = flow.messageTemplate;
    const channel = flow.channel ?? template?.channel ?? MessageChannel.ZALO;

    let context: Record<string, string> = { ...(dto.context ?? {}) };

    if (dto.customerId) {
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
        },
      },
      include: { customer: true, lead: true, automationFlow: true },
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
