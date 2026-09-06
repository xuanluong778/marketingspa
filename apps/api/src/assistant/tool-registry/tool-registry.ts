import type {
  AssistantToolContext,
  AssistantToolDescriptor,
  AssistantToolResult,
} from '@marketingspa/shared';
import { assistantHasAllPermissions } from '@marketingspa/shared';

export type AssistantArgsParseResult<T> =
  { success: true; data: T } | { success: false; error: { issues: Array<{ message?: string }> } };

/** Minimal schema interface — domain tools can later use Zod via @marketingspa/shared without Nest importing zod. */
export type AssistantArgsSchema<T> = {
  safeParse(input: unknown): AssistantArgsParseResult<T>;
};

export const emptyArgsSchema: AssistantArgsSchema<Record<string, never>> = {
  safeParse: () => ({ success: true, data: {} }),
};

export const looseObjectArgsSchema: AssistantArgsSchema<Record<string, unknown>> = {
  safeParse: (input) => {
    if (input == null) return { success: true, data: {} };
    if (typeof input !== 'object' || Array.isArray(input)) {
      return {
        success: false,
        error: { issues: [{ message: 'args must be a plain object' }] },
      };
    }
    return { success: true, data: input as Record<string, unknown> };
  },
};

export type AssistantToolDefinition<TArgs = Record<string, unknown>> = {
  name: string;
  description: string;
  /** AND permissions (always include assistant.use for domain tools) */
  permissions: readonly string[];
  mutates: boolean;
  argsSchema: AssistantArgsSchema<TArgs>;
  timeoutMs?: number;
  /**
   * Domain tools must call existing Nest services/gateways only — never PrismaService domain queries.
   * Session/audit tables are outside tool handlers.
   */
  handler: (ctx: AssistantToolContext, args: TArgs) => Promise<AssistantToolResult>;
};

/**
 * In-memory tool catalog for Trợ lý Bạch Cốt Tinh.
 * Separate from Chatbot CSKH and Ads MCP catalogs.
 */
export class AssistantToolRegistry {
  private readonly tools = new Map<string, AssistantToolDefinition>();

  register(def: AssistantToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`assistant_tool_duplicate:${def.name}`);
    }
    this.tools.set(def.name, def);
  }

  get(name: string): AssistantToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): AssistantToolDefinition[] {
    return [...this.tools.values()];
  }

  listDescriptorsForContext(
    ctx: Pick<AssistantToolContext, 'role' | 'permissions'>,
  ): AssistantToolDescriptor[] {
    return this.list()
      .filter((t) => assistantHasAllPermissions(ctx, t.permissions))
      .map((t) => ({
        name: t.name,
        description: t.description,
        permissions: [...t.permissions],
        mutates: t.mutates,
      }));
  }
}
