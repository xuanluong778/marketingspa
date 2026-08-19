import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ASSISTANT_PENDING_STATUSES,
  ASSISTANT_TOOL_LIMITS,
  assistantHasAllPermissions,
  assistantToolPermissionMap,
  isAssistantWriteTool,
  type AssistantActionPreview,
  type AssistantToolName,
} from '@marketingspa/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { AssistantAuditService } from '../assistant.audit.service';
import {
  bindingMatches,
  confirmExpiresAt,
  generateConfirmSecret,
  hashConfirmSecret,
  isExpired,
  secretsEqual,
  type ConfirmBinding,
} from './confirmation.logic';
import { AssistantWriteExecuteService } from './write-execute.service';

export type ProposeWriteInput = {
  toolName: string;
  args: Record<string, unknown>;
  preview: AssistantActionPreview;
  requestId: string;
  sessionId?: string | null;
  proposeIdempotencyKey?: string | null;
};

export type ProposeWriteResult = {
  actionId: string;
  confirmToken: string;
  expiresAt: string;
  preview: AssistantActionPreview;
  tool: string;
  requiresConfirmation: true;
  status: 'PROPOSED';
};

/**
 * Store pending mutating actions; execute only after explicit confirm with one-time token.
 */
@Injectable()
export class AssistantPendingActionService {
  private readonly logger = new Logger(AssistantPendingActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AssistantAuditService,
    private readonly execute: AssistantWriteExecuteService,
  ) {}

  async propose(user: AuthUser, input: ProposeWriteInput): Promise<ProposeWriteResult> {
    if (!isAssistantWriteTool(input.toolName)) {
      throw new BadRequestException('Tool không phải write tool được phép');
    }
    const perms = assistantToolPermissionMap[input.toolName as AssistantToolName];
    if (
      !assistantHasAllPermissions(
        { role: user.role, permissions: user.permissions ?? [] },
        perms ?? [],
      )
    ) {
      throw new ForbiddenException('Thiếu quyền đề xuất thao tác này');
    }

    const proposeKey = (input.proposeIdempotencyKey || '').trim().slice(0, 120) || null;
    const secret = generateConfirmSecret();
    const hash = hashConfirmSecret(secret);
    const expiresAt = confirmExpiresAt();

    // Re-propose same key → rotate one-time token (still requires UI confirm; never silent execute)
    if (proposeKey) {
      const existing = await this.prisma.assistantPendingAction.findFirst({
        where: {
          organizationId: user.organizationId,
          userId: user.id,
          proposeIdempotencyKey: proposeKey,
        },
      });
      if (existing) {
        if (existing.status === ASSISTANT_PENDING_STATUSES.CONFIRMED && existing.executedAt) {
          throw new BadRequestException('Thao tác này đã được xác nhận trước đó (idempotency).');
        }
        if (
          existing.status === ASSISTANT_PENDING_STATUSES.PROPOSED &&
          !isExpired(existing.expiresAt)
        ) {
          await this.prisma.assistantPendingAction.update({
            where: { id: existing.id },
            data: {
              confirmSecretHash: hash,
              expiresAt,
              requestId: input.requestId.slice(0, 64),
              sessionId: input.sessionId ?? existing.sessionId,
              argsJson: input.args as object,
              previewJson: input.preview as object,
            },
          });
          await this.audit.log(user, {
            requestId: input.requestId,
            sessionId: input.sessionId,
            toolName: input.toolName,
            action: 'WRITE_PROPOSE',
            ok: true,
            meta: { actionId: existing.id, rotated: true },
          });
          return {
            actionId: existing.id,
            confirmToken: secret,
            expiresAt: expiresAt.toISOString(),
            preview: input.preview,
            tool: input.toolName,
            requiresConfirmation: true,
            status: 'PROPOSED',
          };
        }
        // CANCELLED / EXPIRED / FAILED / expired PROPOSED: recycle row for same idempotency key
        await this.prisma.assistantPendingAction.update({
          where: { id: existing.id },
          data: {
            status: ASSISTANT_PENDING_STATUSES.PROPOSED,
            confirmSecretHash: hash,
            expiresAt,
            requestId: input.requestId.slice(0, 64),
            sessionId: input.sessionId ?? null,
            argsJson: input.args as object,
            previewJson: input.preview as object,
            confirmedAt: null,
            cancelledAt: null,
            executedAt: null,
            resultMeta: null as unknown as object,
            errorCode: null,
            errorMessage: null,
            toolName: input.toolName.slice(0, 80),
          },
        });
        await this.audit.log(user, {
          requestId: input.requestId,
          sessionId: input.sessionId,
          toolName: input.toolName,
          action: 'WRITE_PROPOSE',
          ok: true,
          meta: { actionId: existing.id, recycled: true },
        });
        return {
          actionId: existing.id,
          confirmToken: secret,
          expiresAt: expiresAt.toISOString(),
          preview: input.preview,
          tool: input.toolName,
          requiresConfirmation: true,
          status: 'PROPOSED',
        };
      }
    }

    const id = randomUUID();

    await this.prisma.assistantPendingAction.create({
      data: {
        id,
        organizationId: user.organizationId,
        userId: user.id,
        sessionId: input.sessionId ?? null,
        requestId: input.requestId.slice(0, 64),
        toolName: input.toolName.slice(0, 80),
        status: ASSISTANT_PENDING_STATUSES.PROPOSED,
        confirmSecretHash: hash,
        proposeIdempotencyKey: proposeKey,
        argsJson: input.args as object,
        previewJson: input.preview as object,
        expiresAt,
      },
    });

    await this.audit.log(user, {
      requestId: input.requestId,
      sessionId: input.sessionId,
      toolName: input.toolName,
      action: 'WRITE_PROPOSE',
      ok: true,
      meta: {
        actionId: id,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      actionId: id,
      confirmToken: secret,
      expiresAt: expiresAt.toISOString(),
      preview: input.preview,
      tool: input.toolName,
      requiresConfirmation: true,
      status: 'PROPOSED',
    };
  }

  async cancel(
    user: AuthUser,
    actionId: string,
    opts: { requestId?: string } = {},
  ): Promise<{ actionId: string; status: string }> {
    const row = await this.getOwnedPending(user, actionId);
    if (row.status !== ASSISTANT_PENDING_STATUSES.PROPOSED) {
      throw new BadRequestException(`Không thể huỷ trạng thái ${row.status}`);
    }
    if (isExpired(row.expiresAt)) {
      await this.prisma.assistantPendingAction.update({
        where: { id: row.id },
        data: { status: ASSISTANT_PENDING_STATUSES.EXPIRED },
      });
      throw new BadRequestException('Đề xuất đã hết hạn — không ghi dữ liệu');
    }
    await this.prisma.assistantPendingAction.update({
      where: { id: row.id },
      data: {
        status: ASSISTANT_PENDING_STATUSES.CANCELLED,
        cancelledAt: new Date(),
      },
    });
    await this.audit.log(user, {
      requestId: opts.requestId ?? randomUUID(),
      sessionId: row.sessionId,
      toolName: row.toolName,
      action: 'WRITE_CANCEL',
      ok: true,
      meta: { actionId: row.id },
    });
    return { actionId: row.id, status: ASSISTANT_PENDING_STATUSES.CANCELLED };
  }

  async confirm(
    user: AuthUser,
    body: {
      actionId: string;
      confirmToken: string;
      /** Replay / double-submit protection */
      idempotencyKey?: string | null;
    },
    opts: { requestId?: string } = {},
  ): Promise<{
    actionId: string;
    status: string;
    tool: string;
    result: Record<string, unknown> | null;
  }> {
    const requestId = opts.requestId ?? randomUUID();
    const token = String(body.confirmToken || '').trim();
    if (!token || token.length < 16) {
      throw new BadRequestException('confirmToken không hợp lệ');
    }
    const tokenHash = hashConfirmSecret(token);
    const executeKey = (body.idempotencyKey || '').trim().slice(0, 120) || null;

    // Atomic claim: PROPOSED → CONFIRMED only if hash matches + not expired
    const claimed = await this.prisma.$transaction(async (tx) => {
      const row = await tx.assistantPendingAction.findFirst({
        where: {
          id: body.actionId,
          organizationId: user.organizationId,
          userId: user.id,
        },
      });
      if (!row) {
        throw new NotFoundException('Không tìm thấy đề xuất');
      }

      // Idempotent re-confirm of already-executed action
      if (row.status === ASSISTANT_PENDING_STATUSES.CONFIRMED && row.executedAt && row.resultMeta) {
        if (executeKey && row.executeIdempotencyKey && row.executeIdempotencyKey !== executeKey) {
          throw new BadRequestException('Đề xuất đã thực thi với idempotency key khác');
        }
        return { kind: 'already' as const, row };
      }

      if (row.status === ASSISTANT_PENDING_STATUSES.CANCELLED) {
        throw new BadRequestException('Đề xuất đã bị huỷ — không ghi dữ liệu');
      }
      if (row.status === ASSISTANT_PENDING_STATUSES.FAILED) {
        throw new BadRequestException('Đề xuất đã lỗi — không ghi lại');
      }
      if (row.status === ASSISTANT_PENDING_STATUSES.EXPIRED || isExpired(row.expiresAt)) {
        if (row.status === ASSISTANT_PENDING_STATUSES.PROPOSED) {
          await tx.assistantPendingAction.update({
            where: { id: row.id },
            data: { status: ASSISTANT_PENDING_STATUSES.EXPIRED },
          });
        }
        throw new BadRequestException('Đề xuất đã hết hạn — không ghi dữ liệu');
      }
      if (row.status !== ASSISTANT_PENDING_STATUSES.PROPOSED) {
        throw new BadRequestException(`Không thể xác nhận trạng thái ${row.status}`);
      }
      if (!secretsEqual(row.confirmSecretHash, tokenHash)) {
        throw new ForbiddenException('Token xác nhận không khớp hoặc đã dùng');
      }

      const binding: ConfirmBinding = {
        organizationId: row.organizationId,
        userId: row.userId,
        toolName: row.toolName,
        requestId: row.requestId,
      };
      if (
        !bindingMatches(binding, {
          organizationId: user.organizationId,
          userId: user.id,
          toolName: row.toolName,
          requestId: row.requestId,
        })
      ) {
        throw new ForbiddenException('Xác nhận không khớp ràng buộc org/user/tool/request');
      }

      // Invalidating hash (one-time): rotate to spent marker
      const spent = hashConfirmSecret(`spent:${row.id}:${randomUUID()}`);
      const updated = await tx.assistantPendingAction.update({
        where: { id: row.id },
        data: {
          status: ASSISTANT_PENDING_STATUSES.CONFIRMED,
          confirmedAt: new Date(),
          confirmSecretHash: spent,
          executeIdempotencyKey: executeKey ?? `exec:${row.id}`,
        },
      });
      return { kind: 'claimed' as const, row: updated };
    });

    if (claimed.kind === 'already') {
      await this.audit.log(user, {
        requestId,
        sessionId: claimed.row.sessionId,
        toolName: claimed.row.toolName,
        action: 'WRITE_CONFIRM_IDEMPOTENT',
        ok: true,
        meta: { actionId: claimed.row.id },
      });
      return {
        actionId: claimed.row.id,
        status: claimed.row.status,
        tool: claimed.row.toolName,
        result: (claimed.row.resultMeta as Record<string, unknown>) ?? null,
      };
    }

    const row = claimed.row;
    const perms = assistantToolPermissionMap[row.toolName as AssistantToolName] ?? [];
    if (
      !assistantHasAllPermissions({ role: user.role, permissions: user.permissions ?? [] }, perms)
    ) {
      await this.prisma.assistantPendingAction.update({
        where: { id: row.id },
        data: {
          status: ASSISTANT_PENDING_STATUSES.FAILED,
          errorCode: 'FORBIDDEN',
          errorMessage: 'Thiếu quyền lúc xác nhận',
        },
      });
      await this.audit.log(user, {
        requestId,
        sessionId: row.sessionId,
        toolName: row.toolName,
        action: 'WRITE_CONFIRM',
        ok: false,
        errorCode: 'FORBIDDEN',
        meta: { actionId: row.id },
      });
      throw new ForbiddenException('Thiếu quyền thực hiện thao tác');
    }

    await this.audit.log(user, {
      requestId,
      sessionId: row.sessionId,
      toolName: row.toolName,
      action: 'WRITE_CONFIRM',
      ok: true,
      meta: { actionId: row.id, phase: 'before_execute' },
    });

    try {
      const args = (row.argsJson ?? {}) as Record<string, unknown>;
      const result = await this.execute.run(user, row.toolName, args);
      await this.prisma.assistantPendingAction.update({
        where: { id: row.id },
        data: {
          executedAt: new Date(),
          resultMeta: result as object,
          errorCode: null,
          errorMessage: null,
        },
      });
      await this.audit.log(user, {
        requestId,
        sessionId: row.sessionId,
        toolName: row.toolName,
        action: 'WRITE_EXECUTE',
        ok: true,
        meta: {
          actionId: row.id,
          entityType: result.entityType ?? null,
          entityId: typeof result.entityId === 'string' ? result.entityId.slice(0, 80) : null,
        },
      });
      return {
        actionId: row.id,
        status: ASSISTANT_PENDING_STATUSES.CONFIRMED,
        tool: row.toolName,
        result,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`write execute failed actionId=${row.id}: ${msg}`);
      await this.prisma.assistantPendingAction.update({
        where: { id: row.id },
        data: {
          status: ASSISTANT_PENDING_STATUSES.FAILED,
          errorCode: 'UPSTREAM',
          errorMessage: msg.slice(0, 500),
        },
      });
      await this.audit.log(user, {
        requestId,
        sessionId: row.sessionId,
        toolName: row.toolName,
        action: 'WRITE_EXECUTE',
        ok: false,
        errorCode: 'UPSTREAM',
        meta: { actionId: row.id },
      });
      throw err;
    }
  }

  private async getOwnedPending(user: AuthUser, actionId: string) {
    const row = await this.prisma.assistantPendingAction.findFirst({
      where: {
        id: actionId,
        organizationId: user.organizationId,
        userId: user.id,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy đề xuất');
    return row;
  }
}

/** Stable propose key from args (optional client key preferred). */
export function hashProposeArgs(toolName: string, args: Record<string, unknown>): string {
  const json = JSON.stringify(args, Object.keys(args).sort());
  return createHash('sha256').update(`${toolName}:${json}`).digest('hex').slice(0, 64);
}

export function writeConfirmTtlMs(): number {
  return ASSISTANT_TOOL_LIMITS.writeConfirmTtlMs;
}
