import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ASSISTANT_TOOLS, ASSISTANT_TOOL_LIMITS, maskSensitiveText } from '@marketingspa/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkManagementService } from '../../work-management/work-management.service';
import { LeadsService } from '../../leads/leads.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import type { CreateWorkTaskDto } from '../../work-management/dto/work-management.dto';
import type { CreateLeadDto } from '../../leads/dto/lead.dto';

export type WriteExecuteResult = {
  entityType: string;
  entityId?: string;
  summary: string;
  [key: string]: unknown;
};

/**
 * Domain execute after user confirmed. Never called from LLM tool handlers.
 * Uses existing services when available; tenant always via JWT org.
 */
@Injectable()
export class AssistantWriteExecuteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly work: WorkManagementService,
    private readonly leads: LeadsService,
  ) {}

  async run(
    user: AuthUser,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<WriteExecuteResult> {
    switch (toolName) {
      case ASSISTANT_TOOLS.WORK_CREATE_TASK:
        return this.execCreateTask(user, args);
      case ASSISTANT_TOOLS.CRM_CREATE_LEAD:
        return this.execCreateLead(user, args);
      case ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER:
        return this.execCareReminder(user, args);
      case ASSISTANT_TOOLS.INBOX_MARK_READ:
        return this.execMarkRead(user, args);
      case ASSISTANT_TOOLS.INBOX_DRAFT_REPLY:
        return this.execDraftReply(user, args);
      default:
        throw new BadRequestException(`Write tool không hỗ trợ execute: ${toolName}`);
    }
  }

  private async execCreateTask(
    user: AuthUser,
    args: Record<string, unknown>,
  ): Promise<WriteExecuteResult> {
    const projectId = str(args.projectId);
    const title = str(args.title);
    if (!projectId || !title) {
      throw new BadRequestException('projectId và title là bắt buộc');
    }
    const assigneeIds = strArr(args.assigneeIds);
    const dto: CreateWorkTaskDto = {
      projectId,
      title,
      description: str(args.description) || undefined,
      assigneeIds: assigneeIds.length ? assigneeIds : undefined,
      deadline: str(args.deadline) || undefined,
      priority: str(args.priority) || undefined,
      labels: strArr(args.labels),
      columnId: str(args.columnId) || undefined,
    };
    const task = await this.work.createTask(user.organizationId, user, dto);
    const id = String((task as { id?: string }).id ?? '');
    return {
      entityType: 'work_task',
      entityId: id,
      summary: 'Đã tạo công việc',
      projectId,
      title: title.slice(0, 120),
    };
  }

  private async execCreateLead(
    user: AuthUser,
    args: Record<string, unknown>,
  ): Promise<WriteExecuteResult> {
    const name = str(args.name);
    if (!name) throw new BadRequestException('name là bắt buộc');
    const conversationId = str(args.conversationId) || null;
    if (conversationId) {
      const conv = await this.prisma.chatbotConversation.findFirst({
        where: { id: conversationId, organizationId: user.organizationId },
        select: { id: true, visitorName: true, visitorPhone: true },
      });
      if (!conv) throw new NotFoundException('Hội thoại không thuộc tổ chức');
    }

    const dto: CreateLeadDto = {
      name,
      phone: str(args.phone) || undefined,
      email: str(args.email) || undefined,
      note: str(args.note) || undefined,
      branchId: str(args.branchId) || undefined,
      assignedToId: str(args.assignedToId) || undefined,
      reminderAt: str(args.reminderAt) || undefined,
      autoAssign: args.autoAssign === false ? false : true,
      tags: strArr(args.tags),
    };
    const lead = await this.leads.create(user.organizationId, dto, user.id);
    const leadId = String((lead as { id?: string }).id ?? '');

    if (conversationId && leadId) {
      await this.prisma.chatbotConversation.updateMany({
        where: { id: conversationId, organizationId: user.organizationId },
        data: { linkedLeadId: leadId },
      });
    }

    return {
      entityType: 'lead',
      entityId: leadId,
      summary: 'Đã tạo lead',
      conversationId: conversationId ?? undefined,
      // never return raw phone
      nameMasked: name.slice(0, 2) + '***',
    };
  }

  private async execCareReminder(
    user: AuthUser,
    args: Record<string, unknown>,
  ): Promise<WriteExecuteResult> {
    const leadId = str(args.leadId);
    const reminderAt = str(args.reminderAt);
    if (!leadId || !reminderAt) {
      throw new BadRequestException('leadId và reminderAt là bắt buộc');
    }
    const when = new Date(reminderAt);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('reminderAt không hợp lệ');
    }
    const note = str(args.note);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId: user.organizationId },
      select: { id: true, note: true, reminderAt: true, name: true },
    });
    if (!lead) throw new NotFoundException('Lead không thuộc tổ chức');

    const nextNote =
      note && note.trim()
        ? [lead.note?.trim(), `[Nhắc CSKH ${when.toISOString()}]: ${note.trim()}`]
            .filter(Boolean)
            .join('\n')
            .slice(0, 4000)
        : lead.note;

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        reminderAt: when,
        ...(nextNote !== lead.note ? { note: nextNote } : {}),
      },
    });
    await this.prisma.leadActivity.create({
      data: {
        organizationId: user.organizationId,
        leadId: lead.id,
        actorUserId: user.id,
        action: 'REMINDER_SET',
        metadata: { source: 'assistant', reminderAt: when.toISOString() },
      },
    });

    return {
      entityType: 'lead',
      entityId: lead.id,
      summary: 'Đã đặt lịch nhắc chăm sóc',
      reminderAt: when.toISOString(),
    };
  }

  private async execMarkRead(
    user: AuthUser,
    args: Record<string, unknown>,
  ): Promise<WriteExecuteResult> {
    const conversationId = str(args.conversationId);
    if (!conversationId) throw new BadRequestException('conversationId là bắt buộc');
    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id: conversationId, organizationId: user.organizationId },
      select: { id: true, staffReadAt: true },
    });
    if (!conv) throw new NotFoundException('Hội thoại không thuộc tổ chức');
    const now = new Date();
    await this.prisma.chatbotConversation.update({
      where: { id: conv.id },
      data: { staffReadAt: now },
    });
    return {
      entityType: 'conversation',
      entityId: conv.id,
      summary: 'Đã đánh dấu hội thoại đã đọc',
      staffReadAt: now.toISOString(),
      // No Meta send
      metaSent: false,
    };
  }

  private async execDraftReply(
    user: AuthUser,
    args: Record<string, unknown>,
  ): Promise<WriteExecuteResult> {
    const conversationId = str(args.conversationId);
    let draft = str(args.draftText) || str(args.message) || str(args.text) || '';
    if (!conversationId || !draft.trim()) {
      throw new BadRequestException('conversationId và draftText là bắt buộc');
    }
    draft = draft.trim().slice(0, ASSISTANT_TOOL_LIMITS.maxDraftReplyChars);

    const conv = await this.prisma.chatbotConversation.findFirst({
      where: { id: conversationId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException('Hội thoại không thuộc tổ chức');

    // DRAFT only — never call Graph send / never status SENT
    const msg = await this.prisma.chatbotMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        message: draft,
        status: 'DRAFT',
        direction: 'OUTBOUND',
        senderType: 'STAFF',
        // no externalMessageId — never counted as Meta send
      },
      select: { id: true, status: true, senderType: true },
    });

    return {
      entityType: 'chatbot_message_draft',
      entityId: msg.id,
      summary: 'Đã lưu nháp trả lời Fanpage (chưa gửi)',
      conversationId: conv.id,
      status: msg.status,
      senderType: msg.senderType,
      metaSent: false,
      draftPreview: maskSensitiveText(draft, 80),
    };
  }
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}
