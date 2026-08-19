import { Injectable, Logger } from '@nestjs/common';
import { sanitizeAssistantAuditMeta } from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

export type AssistantAuditInput = {
  requestId: string;
  sessionId?: string | null;
  toolName?: string | null;
  /** TOOL_INVOKE | SESSION_CREATE | CHAT | FORBIDDEN | ERROR */
  action: string;
  ok?: boolean | null;
  errorCode?: string | null;
  durationMs?: number | null;
  /** Will be sanitized — never store phone/email/token/message body */
  meta?: Record<string, unknown> | null;
};

/**
 * Assistant audit — always scoped to JWT organizationId.
 * Never persists raw PII or free-form conversational content.
 */
@Injectable()
export class AssistantAuditService {
  private readonly logger = new Logger(AssistantAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(user: AuthUser, input: AssistantAuditInput) {
    try {
      await this.prisma.assistantAuditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          sessionId: input.sessionId ?? null,
          requestId: input.requestId.slice(0, 64),
          toolName: input.toolName?.slice(0, 80) ?? null,
          action: input.action.slice(0, 40),
          ok: input.ok ?? null,
          errorCode: input.errorCode?.slice(0, 40) ?? null,
          durationMs: input.durationMs ?? null,
          meta: sanitizeAssistantAuditMeta(input.meta ?? null) as object | undefined,
        },
      });
    } catch (err) {
      // Audit must not break tool path
      this.logger.warn(
        `assistant audit failed requestId=${input.requestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
