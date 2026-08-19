import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  assistantErrResult,
  assistantOkResult,
  type AssistantEvidence,
  type AssistantLink,
  type AssistantToolContext,
  type AssistantToolResult,
} from '@marketingspa/shared';
import type { ResolvedAssistantRange } from './date-range';

export function decimalish(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    try {
      return Number((v as { toNumber: () => number }).toNumber());
    } catch {
      return Number(v);
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function okTool(
  ctx: AssistantToolContext,
  tool: string,
  data: unknown,
  options: {
    evidence?: AssistantEvidence[];
    links?: AssistantLink[];
    source?: 'AssistantToolRegistry' | 'AdsMcpGateway';
    range?: ResolvedAssistantRange;
  } = {},
): AssistantToolResult {
  const dataWithRange =
    options.range && data && typeof data === 'object' && !Array.isArray(data)
      ? {
          ...(data as object),
          period: options.range.period,
          periodLabel: options.range.label,
          dateFrom: options.range.dateFrom,
          dateTo: options.range.dateTo,
        }
      : data;

  return assistantOkResult({
    tool,
    organizationId: ctx.organizationId,
    timezone: ctx.timezone,
    data: dataWithRange,
    evidence: options.evidence,
    links: options.links,
    source: options.source ?? 'AssistantToolRegistry',
  });
}

export function emptyTool(
  ctx: AssistantToolContext,
  tool: string,
  message: string,
): AssistantToolResult {
  return assistantErrResult({
    code: 'EMPTY',
    message,
    tool,
    organizationId: ctx.organizationId,
  });
}

export function validationTool(
  ctx: AssistantToolContext,
  tool: string,
  message: string,
): AssistantToolResult {
  return assistantErrResult({
    code: 'VALIDATION',
    message,
    tool,
    organizationId: ctx.organizationId,
  });
}

export function mapDomainError(
  err: unknown,
  ctx: AssistantToolContext,
  tool: string,
): AssistantToolResult {
  if (err instanceof NotFoundException) {
    return assistantErrResult({
      code: 'NOT_FOUND',
      message: err.message || 'Không tìm thấy bản ghi',
      tool,
      organizationId: ctx.organizationId,
    });
  }
  if (err instanceof ForbiddenException) {
    return assistantErrResult({
      code: 'FORBIDDEN',
      message: err.message || 'Không có quyền',
      tool,
      organizationId: ctx.organizationId,
    });
  }
  if (err instanceof BadRequestException) {
    return assistantErrResult({
      code: 'VALIDATION',
      message: err.message || 'Tham số không hợp lệ',
      tool,
      organizationId: ctx.organizationId,
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.startsWith('custom_period') ||
    msg.startsWith('invalid_date') ||
    msg.startsWith('date_')
  ) {
    return validationTool(ctx, tool, msg);
  }
  return assistantErrResult({
    code: 'UPSTREAM',
    message: 'Lỗi khi đọc dữ liệu domain',
    tool,
    organizationId: ctx.organizationId,
    retryable: true,
  });
}

export function clampLimit(raw: unknown, fallback = 20): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

/** Primitive snapshot for LLM (drop heavy nests). */
export function pick<T extends Record<string, unknown>>(
  obj: T | null | undefined,
  keys: string[],
): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) out[k] = (obj as Record<string, unknown>)[k];
  }
  return out;
}
