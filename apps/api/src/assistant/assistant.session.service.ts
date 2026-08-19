import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ASSISTANT_TOOL_LIMITS, sanitizeAssistantAuditMeta } from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

/** Persistence cho assistant_sessions / assistant_messages only — không query domain. */
@Injectable()
export class AssistantSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, opts: { title?: string; timezone?: string } = {}) {
    return this.prisma.assistantSession.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        title: opts.title?.slice(0, 200) || null,
        timezone: opts.timezone || 'Asia/Ho_Chi_Minh',
        status: 'ACTIVE',
      },
    });
  }

  async listForUser(user: AuthUser, take = 20) {
    return this.prisma.assistantSession.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(take, 50),
    });
  }

  async getOwned(
    user: AuthUser,
    sessionId: string,
    includeMessages: true,
  ): Promise<{
    id: string;
    organizationId: string;
    userId: string;
    title: string | null;
    timezone: string;
    status: string;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      toolName: string | null;
      toolCallId: string | null;
      meta: unknown;
      createdAt: Date;
    }>;
  }>;
  async getOwned(
    user: AuthUser,
    sessionId: string,
    includeMessages?: false,
  ): Promise<{
    id: string;
    organizationId: string;
    userId: string;
    title: string | null;
    timezone: string;
    status: string;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  async getOwned(user: AuthUser, sessionId: string, includeMessages = false) {
    const session = await this.prisma.assistantSession.findFirst({
      where: {
        id: sessionId,
        organizationId: user.organizationId,
        userId: user.id,
      },
      include: includeMessages
        ? {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: ASSISTANT_TOOL_LIMITS.maxChatHistoryMessages,
            },
          }
        : undefined,
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trợ lý');
    }
    return session;
  }

  /** Soft-delete (ARCHIVE). Only owner of session. */
  async deleteOwned(user: AuthUser, sessionId: string) {
    await this.getOwned(user, sessionId, false);
    return this.prisma.assistantSession.update({
      where: { id: sessionId },
      data: { status: 'ARCHIVED' },
    });
  }

  /**
   * Append message — content must already be redacted by caller.
   * Tenant: always JWT org + session ownership.
   */
  async appendMessage(
    user: AuthUser,
    sessionId: string,
    input: {
      role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
      content: string;
      toolName?: string | null;
      toolCallId?: string | null;
      meta?: Record<string, unknown> | null;
    },
  ) {
    await this.getOwned(user, sessionId, false);
    const content = String(input.content ?? '').slice(0, ASSISTANT_TOOL_LIMITS.maxMessageChars * 4);
    const [message] = await this.prisma.$transaction([
      this.prisma.assistantMessage.create({
        data: {
          organizationId: user.organizationId,
          sessionId,
          userId: user.id,
          role: input.role,
          content,
          toolName: input.toolName ?? null,
          toolCallId: input.toolCallId ?? null,
          meta: sanitizeAssistantAuditMeta(input.meta ?? null) as object | undefined,
        },
      }),
      this.prisma.assistantSession.update({
        where: { id: sessionId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return message;
  }

  /** Admin can read any session in same org only — never cross-tenant. */
  async getInOrg(user: AuthUser, sessionId: string, isAdmin: boolean) {
    if (!isAdmin) {
      return this.getOwned(user, sessionId, true);
    }
    const session = await this.prisma.assistantSession.findFirst({
      where: {
        id: sessionId,
        organizationId: user.organizationId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: ASSISTANT_TOOL_LIMITS.maxChatHistoryMessages,
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên trợ lý');
    }
    if (session.organizationId !== user.organizationId) {
      throw new ForbiddenException('assistant_tenant_mismatch');
    }
    return session;
  }
}
