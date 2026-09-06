import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ASSISTANT_TOOL_LIMITS,
  CREDIT_FEATURE_CODES,
  resolveContentMarketingIntent,
  type AssistantLink,
  type AssistantToolResult,
} from '@marketingspa/shared';
import {
  OpenAiService,
  type OpenAiChatMessage,
  type OpenAiFunctionTool,
} from '../openai/openai.service';
import { RateLimitService } from '../common/services/rate-limit.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AssistantSessionService } from './assistant.session.service';
import { AssistantAuditService } from './assistant.audit.service';
import { AssistantToolRuntime } from './tool-registry/tool-runtime';
import { AssistantToolRegistry } from './tool-registry/tool-registry';
import { buildAssistantToolContext } from './tool-registry/context';
import { ymdInTimeZone } from './tools/date-range';
import {
  applyDefaultPeriodArgs,
  buildAssistantSystemPrompt,
  publicToolTrace,
  redactToolResultForLlm,
  sanitizeUserMessageForLlm,
  stripForbiddenToolArgs,
  toOpenAiFunctionName,
  fromOpenAiFunctionName,
} from './assistant.prompt';
import { RagKbService } from '../rag-kb/rag-kb.service';
import { CreditService, isInsufficientCredits } from '../credit/credit.service';

export type AssistantChatRequest = {
  sessionId?: string;
  message: string;
  /** Client idempotency key (header or body) */
  idempotencyKey?: string;
  /** Filters remembered for this session only (client-sent). */
  filters?: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    pageId?: string;
    pageName?: string;
    compare?: boolean;
  } | null;
};

export type AssistantChatResponse = {
  sessionId: string;
  messageId: string;
  content: string;
  toolTraces: Array<Record<string, unknown>>;
  links: AssistantLink[];
  /** Write proposals needing “Xác nhận thực hiện” (token one-shot for client only). */
  pendingActions: Array<{
    actionId: string;
    tool: string;
    confirmToken: string;
    expiresAt: string;
    preview: Record<string, unknown>;
    requiresConfirmation: true;
  }>;
  requestId: string;
  timezone: string;
};

type IdemCacheEntry = {
  expiresAt: number;
  response: AssistantChatResponse;
};

/**
 * LLM orchestrator: expose only allowlisted tools for JWT user,
 * enforce no org/user id in args, audit each tool invoke, redact persistence.
 */
@Injectable()
export class AssistantOrchestratorService {
  private readonly logger = new Logger(AssistantOrchestratorService.name);
  private readonly idempotency = new Map<string, IdemCacheEntry>();

  constructor(
    private readonly openai: OpenAiService,
    private readonly rateLimit: RateLimitService,
    private readonly sessions: AssistantSessionService,
    private readonly audit: AssistantAuditService,
    private readonly runtime: AssistantToolRuntime,
    private readonly registry: AssistantToolRegistry,
    private readonly ragKb: RagKbService,
    private readonly credit: CreditService,
  ) {}

  async chat(
    user: AuthUser,
    body: AssistantChatRequest,
    opts: { timezoneHeader?: string | null } = {},
  ): Promise<AssistantChatResponse> {
    const requestId = randomUUID();
    const message = sanitizeUserMessageForLlm(
      body.message ?? '',
      ASSISTANT_TOOL_LIMITS.maxMessageChars,
    );
    if (!message) {
      throw new BadRequestException('Tin nhắn không được để trống');
    }

    this.rateLimit.assertWithinLimit(
      `assistant:chat:${user.organizationId}:${user.id}`,
      ASSISTANT_TOOL_LIMITS.chatRateLimitMax,
      ASSISTANT_TOOL_LIMITS.chatRateLimitWindowMs,
      'Bạn đã gửi quá nhiều tin Trợ lý. Vui lòng thử lại sau.',
    );

    const idemKey = (body.idempotencyKey || '').trim().slice(0, 120);
    if (idemKey) {
      const cached = this.getIdempotent(user, idemKey);
      if (cached) return cached;
    }

    if (!this.openai.isConfigured()) {
      throw new ServiceUnavailableException(
        'AI chưa được cấu hình (OPENAI_API_KEY). Liên hệ quản trị.',
      );
    }

    const ctx = buildAssistantToolContext(user, {
      timezoneHeader: opts.timezoneHeader,
      requestId,
    });

    let sessionId = body.sessionId?.trim() || '';
    if (sessionId) {
      await this.sessions.getOwned(user, sessionId, false);
    } else {
      const created = await this.sessions.create(user, {
        title: message.slice(0, 80),
        timezone: ctx.timezone,
      });
      sessionId = created.id;
      await this.audit.log(user, {
        requestId,
        sessionId,
        action: 'SESSION_CREATE',
        ok: true,
      });
    }

    // Bind writes to this session (not from client/LLM args)
    ctx.sessionId = sessionId;

    await this.sessions.appendMessage(user, sessionId, {
      role: 'USER',
      content: message,
      meta: { requestId },
    });

    await this.audit.log(user, {
      requestId,
      sessionId,
      action: 'CHAT',
      ok: true,
      meta: { phase: 'start', chars: message.length },
    });

    const history = await this.sessions.getOwned(user, sessionId, true);
    const historyMessages = history.messages ?? [];
    const allowed = this.runtime.listAllowedTools(ctx);
    const allowSet = new Set(allowed.map((t) => t.name));
    const todayYmd = ymdInTimeZone(new Date(), ctx.timezone);

    const contentIntent = resolveContentMarketingIntent(message);

    const systemPrompt = buildAssistantSystemPrompt({
      timezone: ctx.timezone,
      locale: ctx.locale,
      allowedToolNames: allowed.map((t) => toOpenAiFunctionName(t.name)),
      todayYmd,
      sessionFilters: body.filters ?? null,
    });

    const kbBlock = await this.ragKb.getPromptBlock(user.organizationId, message, {
      limit: 5,
      mode: 'chat',
    });

    const tools = this.toOpenAiTools(allowed.map((t) => t.name));
    const llmMessages: OpenAiChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(kbBlock ? [{ role: 'system' as const, content: kbBlock }] : []),
      ...this.historyToLlmMessages(historyMessages),
    ];

    if (contentIntent) {
      llmMessages.push({
        role: 'system',
        content: `## Intent hiện tại: CONTENT_MARKETING (${contentIntent.variants.join(', ')})
- Trả lời NGẮN (2–4 câu), không hướng dẫn viết content dài dòng.
- Gợi ý user bấm nút CTA (server sẽ gắn link). Không claim đã mở trang / không tự điều hướng.
- ${contentIntent.pure ? 'Thuần content: KHÔNG gọi tool dữ liệu doanh nghiệp.' : 'Có thể kèm data: chỉ gọi tool nếu user hỏi số liệu thật.'}
- Map section: ad=quảng cáo/bán hàng, personal=thương hiệu, advanced=nâng cao, video=/teleprompter.
- Khi hỏi sự thật thương hiệu/dịch vụ: ưu tiên AI Knowledge Base (system message) nếu có.`,
      });
    }

    const toolTraces: Array<Record<string, unknown>> = [];
    const collectedLinks: AssistantLink[] = [];
    const pendingActions: AssistantChatResponse['pendingActions'] = [];
    let toolCallsThisTurn = 0;
    let finalContent = 'Xin lỗi, tôi chưa tổng hợp được câu trả lời. Vui lòng thử lại.';

    // Pure content + canned reply: skip LLM long essay, ensure deterministic CTA path
    const skipLlmForContent =
      Boolean(contentIntent?.pure && contentIntent.preferredReply && contentIntent.links.length);

    try {
      if (skipLlmForContent && contentIntent?.preferredReply) {
        finalContent = contentIntent.preferredReply;
        for (const l of contentIntent.links) collectedLinks.push(l);
      } else {
      await this.credit.runPaidFeature({
        organizationId: user.organizationId,
        featureCode: CREDIT_FEATURE_CODES.ASSISTANT_CHAT,
        referenceId: `assistant.chat:${requestId}`,
        reason: 'assistant chat LLM',
        fn: async (creditCtx) => {
          creditCtx.markProviderStarted();
      for (let round = 0; round < ASSISTANT_TOOL_LIMITS.maxLlmRounds; round++) {
        const pureContent = Boolean(contentIntent?.pure);
        const llm = await this.llmWithRetry({
          messages: llmMessages,
          tools: tools.length && !pureContent ? tools : undefined,
          toolChoice: tools.length && !pureContent ? 'auto' : 'none',
          maxTokens: pureContent ? 400 : 900,
          temperature: 0.45,
          timeoutMs: ASSISTANT_TOOL_LIMITS.llmTimeoutMs,
        });

        const assistantMsg = llm.message;
        const calls = assistantMsg.tool_calls ?? [];

        if (calls.length > 0) {
          // Append assistant tool_calls message for protocol continuity (not persisted raw)
          llmMessages.push({
            role: 'assistant',
            content: assistantMsg.content,
            tool_calls: calls,
          });

          for (const call of calls) {
            if (toolCallsThisTurn >= ASSISTANT_TOOL_LIMITS.maxToolCallsPerTurn) {
              break;
            }
            toolCallsThisTurn += 1;

            const rawLlmName = call.function?.name?.trim() || '';
            const toolName = fromOpenAiFunctionName(rawLlmName);
            const toolCallId = call.id || randomUUID();
            let rawArgs: unknown = {};
            try {
              rawArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
            } catch {
              rawArgs = {};
            }

            let result: AssistantToolResult;
            const started = Date.now();

            if (!toolName || !allowSet.has(toolName) || !this.registry.get(toolName)) {
              result = {
                ok: false,
                code: 'FORBIDDEN',
                message: 'Tool không nằm trong allowlist hoặc không có quyền',
                tool: toolName || rawLlmName || 'unknown',
                organizationId: ctx.organizationId,
                retryable: false,
              };
            } else {
              const cleaned = applyDefaultPeriodArgs(
                toolName,
                stripForbiddenToolArgs(rawArgs),
                body.filters ?? null,
              );
              // Inject page filters for inbox/report when set in session
              if (body.filters?.pageId && cleaned.pageId == null && cleaned.fanpagePageId == null) {
                cleaned.pageId = body.filters.pageId;
              }
              if (
                body.filters?.pageName &&
                cleaned.pageName == null &&
                cleaned.fanpageName == null
              ) {
                cleaned.pageName = body.filters.pageName;
              }
              if (
                body.filters?.compare === true &&
                (toolName === 'report.executive' || toolName.startsWith('finance.')) &&
                cleaned.compare == null
              ) {
                cleaned.compare = true;
              }
              result = await this.runtime.invoke(toolName, cleaned, ctx);
            }

            const durationMs = Date.now() - started;
            await this.audit.log(user, {
              requestId,
              sessionId,
              toolName: toolName || null,
              action: 'TOOL_INVOKE',
              ok: result.ok,
              errorCode: result.ok ? null : result.code,
              durationMs,
              meta: {
                toolCallId,
                retryable: result.ok ? false : Boolean(result.retryable),
              },
            });

            toolTraces.push(
              publicToolTrace({
                toolCallId,
                tool: toolName || 'unknown',
                ok: result.ok,
                code: result.ok ? null : result.code,
                durationMs,
                evidence: result.ok ? result.evidence : undefined,
              }),
            );

            if (result.ok && Array.isArray(result.links)) {
              for (const link of result.links) {
                collectedLinks.push(link);
              }
            }

            // Collect pending write confirmations (token only for HTTP client, not re-logged)
            if (result.ok && result.data && typeof result.data === 'object') {
              const d = result.data as Record<string, unknown>;
              if (
                d.requiresConfirmation === true &&
                typeof d.actionId === 'string' &&
                typeof d.confirmToken === 'string'
              ) {
                pendingActions.push({
                  actionId: d.actionId,
                  tool: toolName || String(d.tool ?? ''),
                  confirmToken: d.confirmToken,
                  expiresAt: String(d.expiresAt ?? ''),
                  preview: (d.preview as Record<string, unknown>) ?? {},
                  requiresConfirmation: true,
                });
              }
            }

            // Persist redacted TOOL message (no full raw args, no confirm token)
            await this.sessions.appendMessage(user, sessionId, {
              role: 'TOOL',
              content: summarizeToolForStorage(result),
              toolName: toolName || null,
              toolCallId,
              meta: {
                ok: result.ok,
                code: result.ok ? 'OK' : result.code,
                durationMs,
                requiresConfirmation: result.ok
                  ? Boolean(
                      result.data &&
                      typeof result.data === 'object' &&
                      (result.data as { requiresConfirmation?: boolean }).requiresConfirmation,
                    )
                  : false,
              },
            });

            llmMessages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: redactToolResultForLlm(result),
            });
          }
          continue;
        }

        // Final text answer
        finalContent = (assistantMsg.content ?? '').trim() || finalContent;
        break;
      }
          return true as const;
        },
      });
      } // end else (LLM path)

      // Always attach CONTENT_MARKETING CTAs when detected (server-side; no auto-navigate)
      if (contentIntent?.links.length) {
        for (const l of contentIntent.links) {
          if (!collectedLinks.some((x) => x.href === l.href && x.label === l.label)) {
            collectedLinks.push(l);
          }
        }
        if (
          contentIntent.preferredReply &&
          (!finalContent || finalContent.length > 800)
        ) {
          // Prefer short canned guidance over a long generic essay when user stuck
          if (contentIntent.variants.includes('generic')) {
            finalContent = contentIntent.preferredReply;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`orchestrator failed requestId=${requestId}: ${msg}`);
      await this.audit.log(user, {
        requestId,
        sessionId,
        action: 'ERROR',
        ok: false,
        errorCode: 'UPSTREAM',
        meta: { phase: 'llm' },
      });
      if (isInsufficientCredits(err)) {
        throw err;
      }
      finalContent =
        contentIntent?.preferredReply ||
        'Mình vừa bị nghẽn đường truyền một chút 😅 Thử lại giúp mình nhé — chưa có số liệu mới từ hệ thống lần này.';
      if (contentIntent?.links.length) {
        for (const l of contentIntent.links) collectedLinks.push(l);
      }
    }

    // Soft fallbacks only when model returned empty; never invent business numbers
    finalContent = postProcessAnswer(finalContent, toolTraces);

    const assistantRow = await this.sessions.appendMessage(user, sessionId, {
      role: 'ASSISTANT',
      content: finalContent.slice(0, ASSISTANT_TOOL_LIMITS.maxMessageChars * 4),
      meta: {
        requestId,
        toolTraceCount: toolTraces.length,
        linkCount: collectedLinks.length,
        intent: contentIntent?.intent ?? null,
        cmVariants: contentIntent?.variants ?? null,
        links: collectedLinks.slice(0, 30),
      },
    });

    const response: AssistantChatResponse = {
      sessionId,
      messageId: assistantRow.id,
      content: finalContent,
      toolTraces,
      links: dedupeLinks(collectedLinks).slice(0, 30),
      pendingActions,
      requestId,
      timezone: ctx.timezone,
    };

    if (idemKey) {
      this.setIdempotent(user, idemKey, response);
    }

    return response;
  }

  private async llmWithRetry(params: {
    messages: OpenAiChatMessage[];
    tools?: OpenAiFunctionTool[];
    toolChoice?: 'auto' | 'none';
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
  }) {
    let lastErr: unknown;
    const attempts = 1 + ASSISTANT_TOOL_LIMITS.maxLlmRetries;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.openai.chatCompletionWithTools(params);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = /timeout|429|5\d\d|ECONN|fetch/i.test(msg);
        if (!retryable || i === attempts - 1) throw err;
      }
    }
    throw lastErr;
  }

  private toOpenAiTools(names: string[]): OpenAiFunctionTool[] {
    return names.map((name) => {
      const def = this.registry.get(name);
      const openAiName = toOpenAiFunctionName(name);
      return {
        type: 'function' as const,
        function: {
          name: openAiName,
          description: `${def?.description ?? name} (internal: ${name})`,
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              period: {
                type: 'string',
                enum: ['today', 'yesterday', 'last_7_days', 'this_week', 'this_month', 'custom'],
                description: 'Khoảng thời gian (mặc định today nếu bỏ trống)',
              },
              dateFrom: { type: 'string', description: 'YYYY-MM-DD khi period=custom' },
              dateTo: { type: 'string', description: 'YYYY-MM-DD khi period=custom' },
              compare: {
                type: 'boolean',
                description: 'So sánh kỳ trước chỉ khi true và đủ dữ liệu',
              },
              pageName: { type: 'string', description: 'Tên Fanpage để resolve pageId' },
              fanpageName: { type: 'string' },
              pageId: { type: 'string', description: 'Fanpage pageId' },
              fanpagePageId: { type: 'string' },
              limit: { type: 'integer', minimum: 1, maximum: 50 },
              search: { type: 'string' },
              q: { type: 'string' },
              customerId: { type: 'string' },
              employeeId: { type: 'string' },
              conversationId: { type: 'string' },
              projectId: { type: 'string' },
              title: { type: 'string', description: 'Tiêu đề công việc / lead' },
              description: { type: 'string' },
              assigneeIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'employeeId assignees',
              },
              deadline: { type: 'string', description: 'ISO deadline for task' },
              priority: { type: 'string' },
              name: { type: 'string', description: 'Tên lead' },
              phone: { type: 'string' },
              note: { type: 'string' },
              leadId: { type: 'string' },
              reminderAt: { type: 'string', description: 'ISO nhắc chăm sóc' },
              draftText: {
                type: 'string',
                description: 'Nội dung nháp Fanpage — không gửi tự động',
              },
              unreadOnly: { type: 'boolean' },
              pipelineStatus: { type: 'string' },
              platform: { type: 'string' },
              groupBy: { type: 'string' },
              branchId: { type: 'string' },
              orderStatus: { type: 'string' },
              paymentStatus: { type: 'string' },
              expenseCategory: { type: 'string' },
              minutes: { type: 'integer' },
            },
          },
        },
      };
    });
  }

  private historyToLlmMessages(
    messages: Array<{
      role: string;
      content: string;
      toolName?: string | null;
      toolCallId?: string | null;
    }>,
  ): OpenAiChatMessage[] {
    const out: OpenAiChatMessage[] = [];
    const slice = messages.slice(-ASSISTANT_TOOL_LIMITS.maxChatHistoryMessages);
    for (const m of slice) {
      if (m.role === 'USER') {
        out.push({ role: 'user', content: m.content });
      } else if (m.role === 'ASSISTANT') {
        out.push({ role: 'assistant', content: m.content });
      } else if (m.role === 'TOOL') {
        // Compact tool history for model — role tool needs tool_call_id
        out.push({
          role: 'user',
          content: `[Kết quả tool ${m.toolName ?? 'tool'}]: ${m.content.slice(0, 800)}`,
        });
      }
    }
    return out;
  }

  private idemCacheKey(user: AuthUser, key: string) {
    const h = createHash('sha256')
      .update(`${user.organizationId}:${user.id}:${key}`)
      .digest('hex')
      .slice(0, 40);
    return h;
  }

  private getIdempotent(user: AuthUser, key: string): AssistantChatResponse | null {
    this.purgeIdempotency();
    const entry = this.idempotency.get(this.idemCacheKey(user, key));
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.idempotency.delete(this.idemCacheKey(user, key));
      return null;
    }
    return entry.response;
  }

  private setIdempotent(user: AuthUser, key: string, response: AssistantChatResponse) {
    this.purgeIdempotency();
    this.idempotency.set(this.idemCacheKey(user, key), {
      expiresAt: Date.now() + ASSISTANT_TOOL_LIMITS.idempotencyTtlMs,
      response,
    });
  }

  private purgeIdempotency() {
    const now = Date.now();
    for (const [k, v] of this.idempotency) {
      if (v.expiresAt < now) this.idempotency.delete(k);
    }
  }
}

function summarizeToolForStorage(result: AssistantToolResult): string {
  if (!result.ok) {
    return JSON.stringify({
      ok: false,
      tool: result.tool,
      code: result.code,
      message: result.message,
    });
  }
  const evidence = (result.evidence ?? []).slice(0, 15);
  return JSON.stringify({
    ok: true,
    tool: result.tool,
    evidence,
    linkCount: result.links?.length ?? 0,
  });
}

function postProcessAnswer(content: string, traces: Array<Record<string, unknown>>): string {
  const failed = traces.filter((t) => t.ok === false);
  const empty = failed.filter((t) => t.code === 'EMPTY');
  const forbidden = failed.filter((t) => t.code === 'FORBIDDEN');
  const timeouts = failed.filter((t) => t.code === 'TIMEOUT');

  const text = content.trim();
  if (!text) {
    if (empty.length && empty.length === failed.length && traces.length) {
      return 'Hôm nay hệ thống chưa ghi nhận số liệu ở mục này 😄. Muốn mình kiểm tra công việc hoặc tin nhắn Fanpage thay không?';
    }
    if (forbidden.length) {
      return 'Mục này quyền hiện tại của bạn chưa mở được. Hỏi quản trị bật quyền, hoặc mình hỗ trợ mục khác nhé.';
    }
    if (timeouts.length) {
      return 'Truy vấn hơi chậm timeout 😅 Thử lại giúp mình — lần này chưa kịp lấy số liệu mới.';
    }
    return 'Mình chưa kéo được dữ liệu lần này. Thử lại giúp, hoặc hỏi mục khác nhé.';
  }
  return text;
}

function dedupeLinks(links: AssistantLink[]): AssistantLink[] {
  const seen = new Set<string>();
  const out: AssistantLink[] = [];
  for (const l of links) {
    const k = `${l.rel}|${l.href}|${l.entityId ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}
