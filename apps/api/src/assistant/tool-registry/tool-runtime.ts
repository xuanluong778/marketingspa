import { Injectable, Logger } from '@nestjs/common';
import {
  ASSISTANT_TOOL_LIMITS,
  assistantErrResult,
  assistantHasAllPermissions,
  type AssistantToolContext,
  type AssistantToolResult,
} from '@marketingspa/shared';
import { AssistantToolRegistry } from './tool-registry';
import { maskObjectPii } from './pii';

function withTimeout<T>(promise: Promise<T>, ms: number, tool: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(`timeout:${tool}`), { code: 'TIMEOUT' }));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Validates args, enforces RBAC (OWNER/SUPER_ADMIN = permission bypass only),
 * enforces tenant via ctx (must have been built from JWT), timeout, PII mask on success data.
 */
@Injectable()
export class AssistantToolRuntime {
  private readonly logger = new Logger(AssistantToolRuntime.name);

  constructor(private readonly registry: AssistantToolRegistry) {}

  getLimits() {
    return { ...ASSISTANT_TOOL_LIMITS };
  }

  listAllowedTools(ctx: AssistantToolContext) {
    return this.registry.listDescriptorsForContext(ctx);
  }

  async invoke(
    toolName: string,
    rawArgs: unknown,
    ctx: AssistantToolContext,
  ): Promise<AssistantToolResult> {
    const started = Date.now();
    const def = this.registry.get(toolName);
    if (!def) {
      return assistantErrResult({
        code: 'NOT_FOUND',
        message: `Tool không tồn tại: ${toolName}`,
        tool: toolName,
        organizationId: ctx.organizationId,
      });
    }

    if (!assistantHasAllPermissions(ctx, def.permissions)) {
      return assistantErrResult({
        code: 'FORBIDDEN',
        message: 'Thiếu quyền để gọi tool này',
        tool: toolName,
        organizationId: ctx.organizationId,
      });
    }

    const parsed = def.argsSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return assistantErrResult({
        code: 'VALIDATION',
        message: parsed.error.issues[0]?.message ?? 'Tham số tool không hợp lệ',
        tool: toolName,
        organizationId: ctx.organizationId,
      });
    }

    const timeoutMs = def.timeoutMs ?? ASSISTANT_TOOL_LIMITS.timeoutMs;

    try {
      const result = await withTimeout(def.handler(ctx, parsed.data), timeoutMs, toolName);

      if (!result.ok) {
        // Force org echo to JWT org — never trust handler for tenant
        return { ...result, organizationId: ctx.organizationId };
      }

      // Tenant hard rule: success must not claim foreign org
      if (result.organizationId !== ctx.organizationId) {
        this.logger.error(`tool ${toolName} returned foreign organizationId (blocked)`);
        return assistantErrResult({
          code: 'UPSTREAM',
          message: 'Kết quả tool vi phạm tenant',
          tool: toolName,
          organizationId: ctx.organizationId,
        });
      }

      const maskedData = maskObjectPii(result.data, ctx.piiReveal) as unknown;
      // Preserve one-time confirmToken for client UI (maskObjectPii strips *token* keys)
      if (
        result.data &&
        typeof result.data === 'object' &&
        !Array.isArray(result.data) &&
        typeof (result.data as { confirmToken?: unknown }).confirmToken === 'string' &&
        (result.data as { requiresConfirmation?: boolean }).requiresConfirmation === true &&
        maskedData &&
        typeof maskedData === 'object' &&
        !Array.isArray(maskedData)
      ) {
        (maskedData as Record<string, unknown>).confirmToken = (
          result.data as { confirmToken: string }
        ).confirmToken;
      }
      return {
        ...result,
        organizationId: ctx.organizationId,
        data: maskedData,
        pii: {
          masked: !(ctx.piiReveal.phone && ctx.piiReveal.email),
          revealedFields: [
            ...(ctx.piiReveal.phone ? ['phone'] : []),
            ...(ctx.piiReveal.email ? ['email'] : []),
          ],
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('timeout:') || (err as { code?: string })?.code === 'TIMEOUT') {
        return assistantErrResult({
          code: 'TIMEOUT',
          message: `Tool timeout (${timeoutMs}ms)`,
          tool: toolName,
          organizationId: ctx.organizationId,
          retryable: true,
        });
      }
      this.logger.warn(`tool ${toolName} failed after ${Date.now() - started}ms: ${msg}`);
      return assistantErrResult({
        code: 'UPSTREAM',
        message: 'Lỗi khi thực thi tool',
        tool: toolName,
        organizationId: ctx.organizationId,
        retryable: true,
      });
    }
  }
}
