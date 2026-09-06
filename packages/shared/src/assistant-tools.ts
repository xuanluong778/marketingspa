/**
 * AI Assistant / Trợ lý Bạch Cốt Tinh — shared contracts (Zod).
 * Domain tools never read DB from the LLM; runtime injects JWT context only.
 * OWNER/SUPER_ADMIN: permission bypass only — never tenant bypass.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const ASSISTANT_PERMISSIONS = {
  USE: 'assistant.use',
  ADMIN: 'assistant.admin',
  /** Inbox Fanpage observe (tools inbox.*) — separate from CSKH bot write */
  INBOX_READ: 'chatbot.inbox.read',
  /** Optional explicit PII full reveal (default still mask without this) */
  PII_REVEAL: 'assistant.pii.reveal',
} as const;

export type AssistantPermissionCode =
  (typeof ASSISTANT_PERMISSIONS)[keyof typeof ASSISTANT_PERMISSIONS];

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOL_LIMITS = {
  maxDateSpanDays: 90,
  maxRows: 50,
  defaultLimit: 20,
  timeoutMs: 8_000,
  maxToolCallsPerTurn: 8,
  maxChatHistoryMessages: 40,
  maxMessageChars: 4_000,
  maxAuditMetaJsonChars: 2_000,
  /** OpenAI request timeout (orchestrator) */
  llmTimeoutMs: 45_000,
  /** Max parallel LLM↔tool rounds inside one chat turn */
  maxLlmRounds: 6,
  /** Retry LLM once on transient failure (not tool FORBIDDEN/EMPTY) */
  maxLlmRetries: 1,
  /** Chat rate limit per user in org */
  chatRateLimitMax: 30,
  chatRateLimitWindowMs: 60_000,
  /** Idempotency cache TTL */
  idempotencyTtlMs: 10 * 60_000,
  /** Pending write action TTL (user must confirm) */
  writeConfirmTtlMs: 10 * 60_000,
  /** Max draft Fanpage reply length */
  maxDraftReplyChars: 2_000,
} as const;

export const ASSISTANT_DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

// ---------------------------------------------------------------------------
// Tool names (registry catalog — handlers live in Nest, not shared)
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOLS = {
  LIST_CAPABILITIES: 'assistant.list_capabilities',
  /**
   * Báo cáo điều hành tổng hợp ngày/tuần/tháng (read-only composition).
   * Gọi các domain service đã tồn tại; mỗi metric kèm evidence + links.
   */
  REPORT_EXECUTIVE: 'report.executive',
  CRM_SEARCH_CUSTOMERS: 'crm.search_customers',
  CRM_GET_CUSTOMER_360: 'crm.get_customer_360',
  CRM_LIST_LEADS: 'crm.list_leads',
  /** Leads NEW quá hạn phản hồi / cần chăm sóc */
  CRM_LIST_STALE_LEADS: 'crm.list_stale_leads',
  CRM_FUNNEL_STATS: 'crm.funnel_stats',
  FINANCE_DASHBOARD: 'finance.dashboard',
  FINANCE_LIST_ORDERS: 'finance.list_orders',
  FINANCE_LIST_PAYMENTS: 'finance.list_payments',
  FINANCE_LIST_EXPENSES: 'finance.list_expenses',
  WORK_MY_WORK: 'work.my_work',
  WORK_DASHBOARD: 'work.dashboard',
  WORK_LIST_PROJECTS: 'work.list_projects',
  WORK_LIST_TASKS: 'work.list_tasks',
  WORK_CALENDAR: 'work.calendar',
  WORK_EMPLOYEE_STATS: 'work.employee_stats',
  HRM_LIST_EMPLOYEES: 'hrm.list_employees',
  HRM_GET_EMPLOYEE_SUMMARY: 'hrm.get_employee_summary',
  /** Delegate AdsMcpGateway (read, no live Meta/Google) */
  ADS_LIST_ACCOUNTS: 'ads.list_accounts',
  ADS_LIST_CAMPAIGNS: 'ads.list_campaigns',
  ADS_GET_METRICS: 'ads.get_metrics',
  INBOX_LIST_CONVERSATIONS: 'inbox.list_conversations',
  INBOX_GET_CONVERSATION: 'inbox.get_conversation',
  /** Thống kê hội thoại theo từng Fanpage (channelRef = pageId) */
  INBOX_PAGE_STATS: 'inbox.page_stats',

  // ---- Controlled write tools (mutates=true; propose only until UI confirm) ----
  /** Tạo + giao việc (Work) — chỉ propose; execute sau Xác nhận */
  WORK_CREATE_TASK: 'work.create_task',
  /** Tạo lead từ hội thoại / form */
  CRM_CREATE_LEAD: 'crm.create_lead',
  /** Lịch nhắc chăm sóc (lead.reminderAt) */
  CRM_CREATE_CARE_REMINDER: 'crm.create_care_reminder',
  /** Đánh dấu hội thoại đã đọc (staff_read_at) — không gửi Meta */
  INBOX_MARK_READ: 'inbox.mark_read',
  /** Soạn nháp trả lời Fanpage (DRAFT STAFF) — không tự gửi */
  INBOX_DRAFT_REPLY: 'inbox.draft_reply',
} as const;

export type AssistantToolName = (typeof ASSISTANT_TOOLS)[keyof typeof ASSISTANT_TOOLS];

/** AND-list of permission codes per tool (beyond always requiring server JWT). */
export const assistantToolPermissionMap: Record<AssistantToolName, readonly string[]> = {
  [ASSISTANT_TOOLS.LIST_CAPABILITIES]: [ASSISTANT_PERMISSIONS.USE],
  /** Report uses partial sections by domain perms; tool itself only needs assistant.use */
  [ASSISTANT_TOOLS.REPORT_EXECUTIVE]: [ASSISTANT_PERMISSIONS.USE],
  [ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS]: [ASSISTANT_PERMISSIONS.USE, 'customer.read'],
  [ASSISTANT_TOOLS.CRM_GET_CUSTOMER_360]: [ASSISTANT_PERMISSIONS.USE, 'customer.read'],
  [ASSISTANT_TOOLS.CRM_LIST_LEADS]: [ASSISTANT_PERMISSIONS.USE, 'lead.read'],
  [ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS]: [ASSISTANT_PERMISSIONS.USE, 'lead.read'],
  [ASSISTANT_TOOLS.CRM_FUNNEL_STATS]: [ASSISTANT_PERMISSIONS.USE, 'lead.read'],
  [ASSISTANT_TOOLS.FINANCE_DASHBOARD]: [ASSISTANT_PERMISSIONS.USE, 'order.read'],
  [ASSISTANT_TOOLS.FINANCE_LIST_ORDERS]: [ASSISTANT_PERMISSIONS.USE, 'order.read'],
  [ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS]: [ASSISTANT_PERMISSIONS.USE, 'order.read'],
  [ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES]: [ASSISTANT_PERMISSIONS.USE, 'order.read'],
  [ASSISTANT_TOOLS.WORK_MY_WORK]: [ASSISTANT_PERMISSIONS.USE, 'work.task.read'],
  [ASSISTANT_TOOLS.WORK_DASHBOARD]: [ASSISTANT_PERMISSIONS.USE, 'work.project.read'],
  [ASSISTANT_TOOLS.WORK_LIST_PROJECTS]: [ASSISTANT_PERMISSIONS.USE, 'work.project.read'],
  [ASSISTANT_TOOLS.WORK_LIST_TASKS]: [ASSISTANT_PERMISSIONS.USE, 'work.task.read'],
  [ASSISTANT_TOOLS.WORK_CALENDAR]: [ASSISTANT_PERMISSIONS.USE, 'work.task.read'],
  [ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS]: [ASSISTANT_PERMISSIONS.USE, 'work.task.read'],
  [ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES]: [ASSISTANT_PERMISSIONS.USE, 'hrm.employee.read'],
  [ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY]: [ASSISTANT_PERMISSIONS.USE, 'hrm.employee.read'],
  [ASSISTANT_TOOLS.ADS_LIST_ACCOUNTS]: [ASSISTANT_PERMISSIONS.USE, 'ads.read'],
  [ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS]: [ASSISTANT_PERMISSIONS.USE, 'ads.read'],
  [ASSISTANT_TOOLS.ADS_GET_METRICS]: [ASSISTANT_PERMISSIONS.USE, 'ads.read'],
  [ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS]: [
    ASSISTANT_PERMISSIONS.USE,
    ASSISTANT_PERMISSIONS.INBOX_READ,
  ],
  [ASSISTANT_TOOLS.INBOX_GET_CONVERSATION]: [
    ASSISTANT_PERMISSIONS.USE,
    ASSISTANT_PERMISSIONS.INBOX_READ,
  ],
  [ASSISTANT_TOOLS.INBOX_PAGE_STATS]: [ASSISTANT_PERMISSIONS.USE, ASSISTANT_PERMISSIONS.INBOX_READ],
  [ASSISTANT_TOOLS.WORK_CREATE_TASK]: [ASSISTANT_PERMISSIONS.USE, 'work.task.write'],
  [ASSISTANT_TOOLS.CRM_CREATE_LEAD]: [ASSISTANT_PERMISSIONS.USE, 'lead.write'],
  [ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER]: [ASSISTANT_PERMISSIONS.USE, 'lead.write'],
  [ASSISTANT_TOOLS.INBOX_MARK_READ]: [ASSISTANT_PERMISSIONS.USE, ASSISTANT_PERMISSIONS.INBOX_READ],
  [ASSISTANT_TOOLS.INBOX_DRAFT_REPLY]: [
    ASSISTANT_PERMISSIONS.USE,
    ASSISTANT_PERMISSIONS.INBOX_READ,
  ],
};

/** mutates=true only for controlled write tools (never auto-execute without confirm). */
export const assistantToolMutatesMap: Record<AssistantToolName, boolean> = {
  [ASSISTANT_TOOLS.LIST_CAPABILITIES]: false,
  [ASSISTANT_TOOLS.REPORT_EXECUTIVE]: false,
  [ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS]: false,
  [ASSISTANT_TOOLS.CRM_GET_CUSTOMER_360]: false,
  [ASSISTANT_TOOLS.CRM_LIST_LEADS]: false,
  [ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS]: false,
  [ASSISTANT_TOOLS.CRM_FUNNEL_STATS]: false,
  [ASSISTANT_TOOLS.FINANCE_DASHBOARD]: false,
  [ASSISTANT_TOOLS.FINANCE_LIST_ORDERS]: false,
  [ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS]: false,
  [ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES]: false,
  [ASSISTANT_TOOLS.WORK_MY_WORK]: false,
  [ASSISTANT_TOOLS.WORK_DASHBOARD]: false,
  [ASSISTANT_TOOLS.WORK_LIST_PROJECTS]: false,
  [ASSISTANT_TOOLS.WORK_LIST_TASKS]: false,
  [ASSISTANT_TOOLS.WORK_CALENDAR]: false,
  [ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS]: false,
  [ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES]: false,
  [ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY]: false,
  [ASSISTANT_TOOLS.ADS_LIST_ACCOUNTS]: false,
  [ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS]: false,
  [ASSISTANT_TOOLS.ADS_GET_METRICS]: false,
  [ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS]: false,
  [ASSISTANT_TOOLS.INBOX_GET_CONVERSATION]: false,
  [ASSISTANT_TOOLS.INBOX_PAGE_STATS]: false,
  [ASSISTANT_TOOLS.WORK_CREATE_TASK]: true,
  [ASSISTANT_TOOLS.CRM_CREATE_LEAD]: true,
  [ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER]: true,
  [ASSISTANT_TOOLS.INBOX_MARK_READ]: true,
  [ASSISTANT_TOOLS.INBOX_DRAFT_REPLY]: true,
};

export function isAssistantWriteTool(name: string): boolean {
  return (
    name in assistantToolMutatesMap && assistantToolMutatesMap[name as AssistantToolName] === true
  );
}

/** Hard-forbidden operations — never register as assistant tools. */
export const ASSISTANT_FORBIDDEN_WRITE_OPS = [
  'fanpage_send',
  'meta_send',
  'publish_post',
  'ads_run',
  'delete_data',
  'change_permissions',
  'payment',
] as const;

/** Period presets — resolve bằng timezone JWT/server, không tin timezone client trong args. */
export const ASSISTANT_PERIODS = [
  'today',
  'yesterday',
  'last_7_days',
  /** Tuần lịch (CN/T2 theo ISO weekday → T2–CN trong timezone org) */
  'this_week',
  'this_month',
  'custom',
] as const;

export type AssistantPeriod = (typeof ASSISTANT_PERIODS)[number];

export const assistantPeriodSchema = z.enum(ASSISTANT_PERIODS);

// ---------------------------------------------------------------------------
// Tool context (server-built only)
// ---------------------------------------------------------------------------

export const assistantPiiRevealSchema = z.object({
  phone: z.boolean().default(false),
  email: z.boolean().default(false),
});

export type AssistantPiiReveal = z.infer<typeof assistantPiiRevealSchema>;

export const assistantToolContextSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  timezone: z.string().min(1).default(ASSISTANT_DEFAULT_TIMEZONE),
  role: z.string().min(1),
  permissions: z.array(z.string()).default([]),
  employeeId: z.string().uuid().nullable().optional(),
  locale: z.string().default('vi'),
  requestId: z.string().uuid(),
  /** Injected by orchestrator for write propose (bind session) — never from LLM args */
  sessionId: z.string().uuid().optional(),
  piiReveal: assistantPiiRevealSchema.default({ phone: false, email: false }),
});

export type AssistantToolContext = z.infer<typeof assistantToolContextSchema>;

// ---------------------------------------------------------------------------
// Controlled write confirmation (client preview + one-time token)
// ---------------------------------------------------------------------------

export const assistantActionPreviewSchema = z.object({
  action: z.string().min(1).max(160),
  tool: z.string().min(1).max(80),
  actor: z.object({
    userId: z.string().uuid(),
    role: z.string().max(40),
    label: z.string().max(120).optional(),
  }),
  targets: z
    .array(
      z.object({
        type: z.string().max(40),
        id: z.string().max(80).optional(),
        label: z.string().max(200),
      }),
    )
    .max(20)
    .default([]),
  changes: z
    .array(
      z.object({
        field: z.string().max(80),
        from: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
        to: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      }),
    )
    .max(40)
    .default([]),
  warnings: z.array(z.string().max(200)).max(10).default([]),
});

export type AssistantActionPreview = z.infer<typeof assistantActionPreviewSchema>;

export const assistantPendingActionStatusSchema = z.enum([
  'PROPOSED',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
]);

export type AssistantPendingActionStatus = z.infer<typeof assistantPendingActionStatusSchema>;

/** Shape returned on chat (token only once to client, never re-logged). */
export const assistantPendingActionPublicSchema = z.object({
  actionId: z.string().uuid(),
  tool: z.string().min(1),
  status: assistantPendingActionStatusSchema,
  expiresAt: z.string().datetime(),
  preview: assistantActionPreviewSchema,
  /** One-time secret — binded server-side; omit on later reads */
  confirmToken: z.string().min(16).max(128).optional(),
  requiresConfirmation: z.literal(true),
});

export type AssistantPendingActionPublic = z.infer<typeof assistantPendingActionPublicSchema>;

export const ASSISTANT_PENDING_STATUSES = {
  PROPOSED: 'PROPOSED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
} as const;

/** Roles that may skip permission *string* checks — never tenant checks. */
export function assistantRoleBypassesPermission(role: string): boolean {
  return role === 'OWNER' || role === 'SUPER_ADMIN';
}

/**
 * Permission AND check. OWNER/SUPER_ADMIN → true for permission only.
 * Does NOT validate organizationId (caller must enforce tenant separately).
 */
export function assistantHasAllPermissions(
  ctx: Pick<AssistantToolContext, 'role' | 'permissions'>,
  required: readonly string[],
): boolean {
  if (!required.length) return true;
  if (assistantRoleBypassesPermission(ctx.role)) return true;
  const have = new Set(ctx.permissions ?? []);
  return required.every((p) => have.has(p));
}

/**
 * Reject client/LLM attempts to override tenant. Always use JWT org/user.
 */
export function assertAssistantTenantMatches(
  ctx: Pick<AssistantToolContext, 'userId' | 'organizationId'>,
  auth: { id: string; organizationId: string },
): void {
  if (ctx.organizationId !== auth.organizationId) {
    throw new Error('assistant_tenant_mismatch');
  }
  if (ctx.userId !== auth.id) {
    throw new Error('assistant_user_mismatch');
  }
}

// ---------------------------------------------------------------------------
// Evidence + links + envelopes
// ---------------------------------------------------------------------------

export const assistantEvidenceSchema = z.object({
  label: z.string().min(1).max(120),
  value: z.union([z.number().finite(), z.string().max(500), z.null()]),
  unit: z.string().max(16).optional(),
});

export type AssistantEvidence = z.infer<typeof assistantEvidenceSchema>;

export const assistantLinkRelSchema = z.enum([
  'report',
  'customer',
  'lead',
  'order',
  'project',
  'task',
  'employee',
  'conversation',
  'ads_campaign',
  'list',
  'content',
]);

export const assistantLinkSchema = z.object({
  rel: assistantLinkRelSchema,
  label: z.string().min(1).max(120),
  /** App-relative path; frontend prefixes origin. Tenant assumed via JWT session. */
  href: z.string().min(1).max(500),
  entityType: z.string().min(1).max(64),
  entityId: z.string().max(80).optional(),
  requiredPermission: z.union([z.string(), z.array(z.string())]).optional(),
});

export type AssistantLink = z.infer<typeof assistantLinkSchema>;

export const assistantToolErrorCodeSchema = z.enum([
  'FORBIDDEN',
  'VALIDATION',
  'TIMEOUT',
  'NOT_FOUND',
  'EMPTY',
  'UPSTREAM',
  'NOT_WIRED',
]);

export type AssistantToolErrorCode = z.infer<typeof assistantToolErrorCodeSchema>;

export const assistantToolErrorSchema = z.object({
  ok: z.literal(false),
  code: assistantToolErrorCodeSchema,
  message: z.string().min(1).max(500),
  tool: z.string().min(1),
  organizationId: z.string().uuid(),
  retryable: z.boolean().default(false),
});

export type AssistantToolError = z.infer<typeof assistantToolErrorSchema>;

export const assistantToolSuccessSchema = z.object({
  ok: z.literal(true),
  tool: z.string().min(1),
  organizationId: z.string().uuid(),
  timezone: z.string().min(1),
  generatedAt: z.string().datetime(),
  data: z.unknown(),
  evidence: z.array(assistantEvidenceSchema).max(40).optional(),
  links: z.array(assistantLinkSchema).max(30).optional(),
  source: z.enum(['AssistantToolRegistry', 'AdsMcpGateway']),
  pii: z.object({
    masked: z.boolean(),
    revealedFields: z.array(z.string()).default([]),
  }),
});

export type AssistantToolSuccess = z.infer<typeof assistantToolSuccessSchema>;

export type AssistantToolResult = AssistantToolSuccess | AssistantToolError;

export function assistantOkResult(
  partial: Omit<AssistantToolSuccess, 'ok' | 'generatedAt' | 'source' | 'pii'> &
    Partial<Pick<AssistantToolSuccess, 'source' | 'pii' | 'generatedAt'>>,
): AssistantToolSuccess {
  return assistantToolSuccessSchema.parse({
    ok: true as const,
    generatedAt: partial.generatedAt ?? new Date().toISOString(),
    source: partial.source ?? 'AssistantToolRegistry',
    pii: partial.pii ?? { masked: true, revealedFields: [] },
    ...partial,
  });
}

export function assistantErrResult(
  partial: Omit<AssistantToolError, 'ok' | 'retryable'> & { retryable?: boolean },
): AssistantToolError {
  return assistantToolErrorSchema.parse({
    ok: false as const,
    retryable: partial.retryable ?? false,
    ...partial,
  });
}

// ---------------------------------------------------------------------------
// PII masking (pure)
// ---------------------------------------------------------------------------

export function maskPhone(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return raw ?? null;
  const s = String(raw).replace(/\s+/g, '');
  if (s.length < 6) return '****';
  return `${s.slice(0, 2)}****${s.slice(-3)}`;
}

export function maskEmail(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return raw ?? null;
  const s = String(raw).trim();
  const at = s.indexOf('@');
  if (at <= 0) return '***@***';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const keep = Math.min(2, Math.max(1, local.length));
  return `${local.slice(0, keep)}***@${domain}`;
}

export function redactSensitiveTokenLike(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  return '[REDACTED]';
}

/**
 * Strip keys commonly carrying secrets before audit storage.
 * Never logs phone/email/tokens.
 */
export function sanitizeAssistantAuditMeta(
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!meta || typeof meta !== 'object') return null;
  const ban =
    /phone|email|password|token|secret|authorization|cookie|body|message|transcript/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    // App-relative content CTAs for assistant bubbles (no secrets)
    if (k === 'links' && Array.isArray(v)) {
      out.links = v
        .slice(0, 12)
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const o = item as Record<string, unknown>;
          const href = typeof o.href === 'string' ? o.href.trim() : '';
          const label = typeof o.label === 'string' ? o.label.trim().slice(0, 80) : '';
          const rel = typeof o.rel === 'string' ? o.rel.slice(0, 32) : 'list';
          if (!href.startsWith('/') || href.startsWith('//') || !label) return null;
          return {
            rel,
            label,
            href: href.slice(0, 200),
            entityType:
              typeof o.entityType === 'string' ? o.entityType.slice(0, 64) : 'module',
            ...(typeof o.entityId === 'string' ? { entityId: o.entityId.slice(0, 80) } : {}),
          };
        })
        .filter(Boolean);
      continue;
    }
    if (ban.test(k)) continue;
    if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 80)}…`;
      continue;
    }
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
      continue;
    }
    if (typeof v === 'string') {
      out[k] = v.slice(0, 120);
      continue;
    }
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) {
      out[k] = v.slice(0, 20);
    }
  }
  const json = JSON.stringify(out);
  if (json.length > ASSISTANT_TOOL_LIMITS.maxAuditMetaJsonChars) {
    return { truncated: true, keys: Object.keys(out).slice(0, 20) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Date range (generic args helper)
// ---------------------------------------------------------------------------

export const assistantDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const assistantDateRangeSchema = z
  .object({
    dateFrom: assistantDateSchema,
    dateTo: assistantDateSchema,
  })
  .superRefine((val, ctx) => {
    if (val.dateFrom > val.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateFrom must be <= dateTo',
        path: ['dateFrom'],
      });
    }
    const from = new Date(`${val.dateFrom}T00:00:00.000Z`);
    const to = new Date(`${val.dateTo}T00:00:00.000Z`);
    const span = (to.getTime() - from.getTime()) / 86_400_000;
    if (span > ASSISTANT_TOOL_LIMITS.maxDateSpanDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `date span max ${ASSISTANT_TOOL_LIMITS.maxDateSpanDays} days`,
        path: ['dateTo'],
      });
    }
  });

/** Optional period + custom range for tool args (Zod). */
export const assistantPeriodArgsSchema = z
  .object({
    period: assistantPeriodSchema.optional().default('this_month'),
    dateFrom: assistantDateSchema.optional(),
    dateTo: assistantDateSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.period === 'custom') {
      if (!val.dateFrom || !val.dateTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'custom period requires dateFrom and dateTo (YYYY-MM-DD)',
          path: ['dateFrom'],
        });
        return;
      }
      if (val.dateFrom > val.dateTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'dateFrom must be <= dateTo',
          path: ['dateFrom'],
        });
      }
    }
  });

export const assistantLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(ASSISTANT_TOOL_LIMITS.maxRows)
  .default(ASSISTANT_TOOL_LIMITS.defaultLimit);

/** Redact phone/email patterns inside free-text (inbox preview). */
export function maskSensitiveText(raw: string | null | undefined, maxLen = 160): string | null {
  if (raw == null) return null;
  let s = String(raw);
  s = s.replace(/\b0\d{8,11}\b/g, (m) => maskPhone(m) ?? '****');
  s = s.replace(/[\w.+-]+@[\w.-]+\.\w+/gi, (m) => maskEmail(m) ?? '***@***');
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

// ---------------------------------------------------------------------------
// Tool definition shape (for registry descriptors / LLM)
// ---------------------------------------------------------------------------

export const assistantToolDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).max(500),
  permissions: z.array(z.string()).min(1),
  mutates: z.boolean().default(false),
});

export type AssistantToolDescriptor = z.infer<typeof assistantToolDescriptorSchema>;

export function listAssistantToolDescriptors(
  filter?: (name: AssistantToolName, perms: readonly string[]) => boolean,
): AssistantToolDescriptor[] {
  return (Object.keys(assistantToolPermissionMap) as AssistantToolName[])
    .map((name) => {
      const permissions = [...assistantToolPermissionMap[name]];
      if (filter && !filter(name, permissions)) {
        return null;
      }
      return {
        name,
        description: name,
        permissions,
        mutates: assistantToolMutatesMap[name] === true,
      };
    })
    .filter(Boolean) as AssistantToolDescriptor[];
}

/** Build descriptors only for tools the context can invoke (after permission filter). */
export function listToolsForContext(
  ctx: Pick<AssistantToolContext, 'role' | 'permissions'>,
): AssistantToolDescriptor[] {
  return (Object.entries(assistantToolPermissionMap) as [AssistantToolName, readonly string[]][])
    .filter(([, perms]) => assistantHasAllPermissions(ctx, perms))
    .map(([name, permissions]) => {
      const mutates = assistantToolMutatesMap[name] === true;
      return {
        name,
        description: mutates
          ? `Write tool ${name} (requires UI confirmation before execute).`
          : `Internal tool ${name} (read-only).`,
        permissions: [...permissions],
        mutates,
      };
    });
}
