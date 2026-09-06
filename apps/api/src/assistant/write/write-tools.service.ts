import {
  ASSISTANT_TOOLS,
  ASSISTANT_TOOL_LIMITS,
  assistantHasAllPermissions,
  assistantToolPermissionMap,
  isAssistantWriteTool,
  maskSensitiveText,
  maskPhone,
  maskEmail,
  type AssistantActionPreview,
  type AssistantToolContext,
  type AssistantToolName,
} from '@marketingspa/shared';
import { Injectable } from '@nestjs/common';
import { looseObjectArgsSchema, type AssistantToolRegistry } from '../tool-registry/tool-registry';
import { okTool, validationTool, mapDomainError } from '../tools/result-helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantPendingActionService, hashProposeArgs } from './pending-action.service';
import { isForbiddenWriteToolName, stripConfirmSecrets } from './confirmation.logic';

/**
 * Write tools: handlers ONLY propose (mutates=true).
 * Actual domain write runs in AssistantWriteExecuteService after UI confirm.
 */
@Injectable()
export class AssistantWriteToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pending: AssistantPendingActionService,
  ) {}

  registerAll(registry: AssistantToolRegistry): void {
    const tools = [
      ASSISTANT_TOOLS.WORK_CREATE_TASK,
      ASSISTANT_TOOLS.CRM_CREATE_LEAD,
      ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER,
      ASSISTANT_TOOLS.INBOX_MARK_READ,
      ASSISTANT_TOOLS.INBOX_DRAFT_REPLY,
    ] as const;

    for (const name of tools) {
      if (isForbiddenWriteToolName(name) || !isAssistantWriteTool(name)) {
        throw new Error(`assistant_write_tool_forbidden:${name}`);
      }
      registry.register({
        name,
        description: writeToolDescription(name),
        permissions: assistantToolPermissionMap[name],
        mutates: true,
        argsSchema: looseObjectArgsSchema,
        timeoutMs: ASSISTANT_TOOL_LIMITS.timeoutMs,
        handler: async (ctx, args) => this.handlePropose(ctx, name, args),
      });
    }
  }

  private async handlePropose(
    ctx: AssistantToolContext,
    toolName: AssistantToolName,
    rawArgs: Record<string, unknown>,
  ) {
    const args = stripConfirmSecrets(rawArgs);
    // Prompt injection: ignore any client/LLM skip-confirm flags
    delete args.skipConfirm;
    delete args.confirmed;
    delete args.executeNow;
    delete args.force;
    delete args.confirmToken;
    delete args.actionId;

    if (
      !isAssistantWriteTool(toolName) ||
      !assistantHasAllPermissions(ctx, assistantToolPermissionMap[toolName])
    ) {
      return {
        ok: false as const,
        code: 'FORBIDDEN' as const,
        message: 'Thiếu quyền cho write tool',
        tool: toolName,
        organizationId: ctx.organizationId,
        retryable: false,
      };
    }

    try {
      const prepared = await this.prepare(ctx, toolName, args);
      if (!prepared.ok) {
        return validationTool(ctx, toolName, prepared.message);
      }

      const user = {
        id: ctx.userId,
        email: '',
        name: '',
        organizationId: ctx.organizationId,
        role: ctx.role,
        permissions: ctx.permissions,
        employeeId: ctx.employeeId ?? null,
      };

      const proposeKey =
        typeof args.idempotencyKey === 'string'
          ? String(args.idempotencyKey).slice(0, 120)
          : hashProposeArgs(toolName, prepared.args);

      const proposed = await this.pending.propose(user, {
        toolName,
        args: prepared.args,
        preview: prepared.preview,
        requestId: ctx.requestId,
        sessionId: ctx.sessionId ?? null,
        proposeIdempotencyKey: proposeKey,
      });

      return okTool(
        ctx,
        toolName,
        {
          requiresConfirmation: true as const,
          status: 'PROPOSED',
          actionId: proposed.actionId,
          confirmToken: proposed.confirmToken,
          expiresAt: proposed.expiresAt,
          preview: proposed.preview,
          /**
           * executeBlocked: true — domain write must not run until
           * POST /assistant/actions/confirm with this token.
           */
          executeBlocked: true,
          autoSent: false,
        },
        {
          evidence: [
            { label: 'Yêu cầu xác nhận', value: 1 },
            { label: 'Hết hạn', value: proposed.expiresAt },
          ],
        },
      );
    } catch (err) {
      return mapDomainError(err, ctx, toolName);
    }
  }

  private async prepare(
    ctx: AssistantToolContext,
    toolName: AssistantToolName,
    args: Record<string, unknown>,
  ): Promise<
    | { ok: true; args: Record<string, unknown>; preview: AssistantActionPreview }
    | { ok: false; message: string }
  > {
    const actor = {
      userId: ctx.userId,
      role: ctx.role,
      label: `${ctx.role}`,
    };

    switch (toolName) {
      case ASSISTANT_TOOLS.WORK_CREATE_TASK: {
        const projectId = s(args.projectId);
        const title = s(args.title);
        if (!projectId || !title) {
          return { ok: false, message: 'Cần projectId và title để tạo công việc' };
        }
        const project = await this.prisma.workProject.findFirst({
          where: { id: projectId, organizationId: ctx.organizationId },
          select: { id: true, name: true },
        });
        if (!project) return { ok: false, message: 'Dự án không tồn tại trong tổ chức' };
        const assigneeIds = arr(args.assigneeIds);
        const clean = {
          projectId,
          title: title.slice(0, 300),
          description: s(args.description)?.slice(0, 2000) || undefined,
          assigneeIds,
          deadline: s(args.deadline) || undefined,
          priority: s(args.priority) || undefined,
          labels: arr(args.labels),
          columnId: s(args.columnId) || undefined,
        };
        return {
          ok: true,
          args: clean,
          preview: {
            action: 'Tạo và giao công việc',
            tool: toolName,
            actor,
            targets: [{ type: 'project', id: project.id, label: project.name }],
            changes: [
              { field: 'title', to: clean.title },
              { field: 'assigneeIds', to: assigneeIds.join(',') || '(chưa gán)' },
              { field: 'deadline', to: clean.deadline ?? null },
              { field: 'priority', to: clean.priority ?? null },
            ],
            warnings: ['Chỉ ghi DB sau khi bấm “Xác nhận thực hiện”.'],
          },
        };
      }
      case ASSISTANT_TOOLS.CRM_CREATE_LEAD: {
        let name = s(args.name);
        const conversationId = s(args.conversationId);
        let phone = s(args.phone);
        let note = s(args.note);
        if (conversationId) {
          const conv = await this.prisma.chatbotConversation.findFirst({
            where: { id: conversationId, organizationId: ctx.organizationId },
            select: {
              id: true,
              visitorName: true,
              visitorPhone: true,
              channelRef: true,
            },
          });
          if (!conv) return { ok: false, message: 'Hội thoại không thuộc tổ chức' };
          if (!name) name = conv.visitorName || 'Lead Fanpage';
          if (!phone) phone = conv.visitorPhone || undefined;
          if (!note) note = `Từ hội thoại ${conv.id.slice(0, 8)}…`;
        }
        if (!name) return { ok: false, message: 'Cần name hoặc conversationId' };
        const clean = {
          name: name.slice(0, 200),
          phone: phone?.slice(0, 40) || undefined,
          email: s(args.email)?.slice(0, 120) || undefined,
          note: note?.slice(0, 1000) || undefined,
          conversationId: conversationId || undefined,
          branchId: s(args.branchId) || undefined,
          assignedToId: s(args.assignedToId) || undefined,
          reminderAt: s(args.reminderAt) || undefined,
          tags: arr(args.tags),
        };
        return {
          ok: true,
          args: clean,
          preview: {
            action: 'Tạo lead từ hội thoại / form',
            tool: toolName,
            actor,
            targets: clean.conversationId
              ? [{ type: 'conversation', id: clean.conversationId, label: 'Hội thoại CSKH' }]
              : [{ type: 'lead', label: 'Lead mới' }],
            changes: [
              { field: 'name', to: clean.name.slice(0, 2) + '***' },
              { field: 'phone', to: maskPhone(clean.phone ?? null) },
              { field: 'email', to: maskEmail(clean.email ?? null) },
              { field: 'note', to: maskSensitiveText(clean.note, 60) },
            ],
            warnings: ['Không tạo nếu đã trùng (domain dedupe). Cần “Xác nhận thực hiện”.'],
          },
        };
      }
      case ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER: {
        const leadId = s(args.leadId);
        const reminderAt = s(args.reminderAt);
        if (!leadId || !reminderAt) {
          return { ok: false, message: 'Cần leadId và reminderAt (ISO/date)' };
        }
        const lead = await this.prisma.lead.findFirst({
          where: { id: leadId, organizationId: ctx.organizationId },
          select: { id: true, name: true, reminderAt: true },
        });
        if (!lead) return { ok: false, message: 'Lead không thuộc tổ chức' };
        const clean = {
          leadId,
          reminderAt,
          note: s(args.note)?.slice(0, 500) || undefined,
        };
        return {
          ok: true,
          args: clean,
          preview: {
            action: 'Tạo lịch nhắc chăm sóc khách',
            tool: toolName,
            actor,
            targets: [
              {
                type: 'lead',
                id: lead.id,
                label: (lead.name || 'Lead').slice(0, 2) + '***',
              },
            ],
            changes: [
              {
                field: 'reminderAt',
                from: lead.reminderAt?.toISOString() ?? null,
                to: reminderAt,
              },
              { field: 'note', to: maskSensitiveText(clean.note, 60) },
            ],
            warnings: ['Chỉ cập nhật lead.reminderAt — không gửi tin nhắn tự động.'],
          },
        };
      }
      case ASSISTANT_TOOLS.INBOX_MARK_READ: {
        const conversationId = s(args.conversationId);
        if (!conversationId) return { ok: false, message: 'Cần conversationId' };
        const conv = await this.prisma.chatbotConversation.findFirst({
          where: { id: conversationId, organizationId: ctx.organizationId },
          select: { id: true, visitorName: true, staffReadAt: true, channelRef: true },
        });
        if (!conv) return { ok: false, message: 'Hội thoại không thuộc tổ chức' };
        return {
          ok: true,
          args: { conversationId },
          preview: {
            action: 'Đánh dấu hội thoại đã đọc',
            tool: toolName,
            actor,
            targets: [
              {
                type: 'conversation',
                id: conv.id,
                label: maskSensitiveText(conv.visitorName, 40) || 'Hội thoại',
              },
            ],
            changes: [
              {
                field: 'staffReadAt',
                from: conv.staffReadAt?.toISOString() ?? null,
                to: '(now)',
              },
            ],
            warnings: ['Không gửi tin Fanpage / Meta.'],
          },
        };
      }
      case ASSISTANT_TOOLS.INBOX_DRAFT_REPLY: {
        const conversationId = s(args.conversationId);
        const draft = s(args.draftText) || s(args.message) || s(args.text) || '';
        if (!conversationId || !draft) {
          return { ok: false, message: 'Cần conversationId và draftText' };
        }
        if (draft.length > ASSISTANT_TOOL_LIMITS.maxDraftReplyChars) {
          return {
            ok: false,
            message: `Nháp tối đa ${ASSISTANT_TOOL_LIMITS.maxDraftReplyChars} ký tự`,
          };
        }
        const conv = await this.prisma.chatbotConversation.findFirst({
          where: { id: conversationId, organizationId: ctx.organizationId },
          select: { id: true, visitorName: true },
        });
        if (!conv) return { ok: false, message: 'Hội thoại không thuộc tổ chức' };
        const clean = {
          conversationId,
          draftText: draft.slice(0, ASSISTANT_TOOL_LIMITS.maxDraftReplyChars),
        };
        return {
          ok: true,
          args: clean,
          preview: {
            action: 'Soạn nháp trả lời Fanpage',
            tool: toolName,
            actor,
            targets: [
              {
                type: 'conversation',
                id: conv.id,
                label: maskSensitiveText(conv.visitorName, 40) || 'Hội thoại',
              },
            ],
            changes: [
              {
                field: 'draftText',
                to: maskSensitiveText(clean.draftText, 120),
              },
              { field: 'status', to: 'DRAFT' },
              { field: 'metaSent', to: false },
            ],
            warnings: [
              'CHỈ LƯU NHÁP — không tự gửi Fanpage, không đăng bài, không chạy quảng cáo.',
            ],
          },
        };
      }
      default:
        return { ok: false, message: 'Write tool không hỗ trợ' };
    }
  }
}

function writeToolDescription(name: string): string {
  switch (name) {
    case ASSISTANT_TOOLS.WORK_CREATE_TASK:
      return 'Đề xuất tạo + giao công việc (cần Xác nhận thực hiện). Args: projectId, title, assigneeIds?, deadline?';
    case ASSISTANT_TOOLS.CRM_CREATE_LEAD:
      return 'Đề xuất tạo lead từ hội thoại (cần Xác nhận). Args: name?|conversationId, phone?, note?';
    case ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER:
      return 'Đề xuất lịch nhắc chăm sóc lead (cần Xác nhận). Args: leadId, reminderAt, note?';
    case ASSISTANT_TOOLS.INBOX_MARK_READ:
      return 'Đề xuất đánh dấu hội thoại đã đọc (cần Xác nhận). Args: conversationId';
    case ASSISTANT_TOOLS.INBOX_DRAFT_REPLY:
      return 'Đề xuất nháp trả lời Fanpage — KHÔNG gửi (cần Xác nhận). Args: conversationId, draftText';
    default:
      return name;
  }
}

function s(v: unknown): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t || undefined;
}

function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}
