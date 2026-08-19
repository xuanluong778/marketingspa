import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ASSISTANT_PERMISSIONS,
  assistantCanaryDenyMessage,
  assistantHasAllPermissions,
  isAssistantOrgAllowed,
  loadAssistantCanaryConfig,
} from '@marketingspa/shared';
import { AssistantSessionService } from './assistant.session.service';
import { AssistantToolRuntime } from './tool-registry/tool-runtime';
import { buildAssistantToolContext } from './tool-registry/context';
import { AssistantOrchestratorService } from './assistant.orchestrator.service';
import { AssistantAuditService } from './assistant.audit.service';
import { AssistantPendingActionService } from './write/pending-action.service';
import { randomUUID } from 'crypto';

/** Canary/org rollout — OWNER/SUPER_ADMIN never bypass. */
function assertAssistantOrgAllowed(user: AuthUser): void {
  if (!isAssistantOrgAllowed(user.organizationId)) {
    throw new ForbiddenException(assistantCanaryDenyMessage());
  }
}

/**
 * HTTP surface: Trợ lý Bạch Cốt Tinh.
 * Không nhận organizationId từ body/query/LLM — chỉ JWT.
 */
@Controller('assistant')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AssistantController {
  constructor(
    private readonly sessions: AssistantSessionService,
    private readonly runtime: AssistantToolRuntime,
    private readonly orchestrator: AssistantOrchestratorService,
    private readonly audit: AssistantAuditService,
    private readonly pending: AssistantPendingActionService,
  ) {}

  /**
   * Rollout status (canary allowlist). Safe for clients to hide FAB without 403 noise.
   * JWT tenant only — no elevating by body orgId.
   */
  @Get('status')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  status(@CurrentUser() user: AuthUser) {
    const cfg = loadAssistantCanaryConfig();
    const orgAllowed = isAssistantOrgAllowed(user.organizationId);
    return {
      enabled: orgAllowed,
      canaryMode: cfg.canaryMode,
      masterEnabled: cfg.masterEnabled,
      organizationId: user.organizationId,
      message: orgAllowed ? null : assistantCanaryDenyMessage(cfg),
    };
  }

  @Get('tools')
  @RequirePermissions(ASSISTANT_PERMISSIONS.ADMIN)
  listTools(@CurrentUser() user: AuthUser, @Headers('x-timezone') timezoneHeader?: string) {
    assertAssistantOrgAllowed(user);
    const ctx = buildAssistantToolContext(user, { timezoneHeader });
    return {
      tools: this.runtime.listAllowedTools(ctx),
      limits: this.runtime.getLimits(),
      timezone: ctx.timezone,
      organizationId: ctx.organizationId,
    };
  }

  @Get('sessions')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  listSessions(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    assertAssistantOrgAllowed(user);
    const take = Math.min(50, Math.max(1, Number(limit) || 20));
    return this.sessions.listForUser(user, take);
  }

  @Post('sessions')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  async createSession(
    @CurrentUser() user: AuthUser,
    @Body() body: { title?: string },
    @Headers('x-timezone') timezoneHeader?: string,
  ) {
    assertAssistantOrgAllowed(user);
    const ctx = buildAssistantToolContext(user, { timezoneHeader });
    const session = await this.sessions.create(user, {
      title: body?.title,
      timezone: ctx.timezone,
    });
    await this.audit.log(user, {
      requestId: ctx.requestId,
      sessionId: session.id,
      action: 'SESSION_CREATE',
      ok: true,
    });
    return session;
  }

  @Get('sessions/:id')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  getSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertAssistantOrgAllowed(user);
    const isAdmin = assistantHasAllPermissions(
      { role: user.role, permissions: user.permissions ?? [] },
      [ASSISTANT_PERMISSIONS.ADMIN],
    );
    if (isAdmin) {
      return this.sessions.getInOrg(user, id, true);
    }
    return this.sessions.getOwned(user, id, true);
  }

  @Delete('sessions/:id')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  async deleteSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertAssistantOrgAllowed(user);
    const session = await this.sessions.deleteOwned(user, id);
    return { id: session.id, status: session.status };
  }

  @Post('chat')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  chat(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      sessionId?: string;
      message: string;
      idempotencyKey?: string;
      filters?: {
        period?: string;
        dateFrom?: string;
        dateTo?: string;
        pageId?: string;
        pageName?: string;
        compare?: boolean;
      } | null;
      organizationId?: never;
    },
    @Headers('x-timezone') timezoneHeader?: string,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    assertAssistantOrgAllowed(user);
    return this.orchestrator.chat(
      user,
      {
        sessionId: body?.sessionId,
        message: body?.message ?? '',
        idempotencyKey: body?.idempotencyKey || idempotencyHeader,
        filters: body?.filters ?? null,
      },
      { timezoneHeader },
    );
  }

  @Post('actions/confirm')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  confirmAction(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      actionId: string;
      confirmToken: string;
      idempotencyKey?: string;
    },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    assertAssistantOrgAllowed(user);
    return this.pending.confirm(
      user,
      {
        actionId: body?.actionId,
        confirmToken: body?.confirmToken,
        idempotencyKey: body?.idempotencyKey || idempotencyHeader,
      },
      { requestId: randomUUID() },
    );
  }

  @Post('actions/cancel')
  @RequirePermissions(ASSISTANT_PERMISSIONS.USE)
  cancelAction(@CurrentUser() user: AuthUser, @Body() body: { actionId: string }) {
    assertAssistantOrgAllowed(user);
    return this.pending.cancel(user, body?.actionId, { requestId: randomUUID() });
  }
}
