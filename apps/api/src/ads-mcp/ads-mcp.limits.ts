import { ADS_MCP_LIMITS, adsMcpDateRangeSchema, adsMcpLimitSchema } from '@marketingspa/shared';

export function clampMcpLimit(limit?: number): number {
  const parsed = adsMcpLimitSchema.safeParse(limit ?? ADS_MCP_LIMITS.defaultLimit);
  if (!parsed.success) return ADS_MCP_LIMITS.defaultLimit;
  return Math.min(parsed.data, ADS_MCP_LIMITS.maxRows);
}

export function assertMcpDateRange(dateFrom: string, dateTo: string) {
  return adsMcpDateRangeSchema.parse({ dateFrom, dateTo });
}

/** Timeout cứng — MCP không được treo khi query DB. */
export async function withMcpTimeout<T>(
  promise: Promise<T>,
  ms = ADS_MCP_LIMITS.timeoutMs,
  label = 'AdsMcpTool',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timeout sau ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function previousPeriod(
  dateFrom: string,
  dateTo: string,
): {
  dateFrom: string;
  dateTo: string;
} {
  const from = new Date(dateFrom + 'T00:00:00.000Z');
  const to = new Date(dateTo + 'T00:00:00.000Z');
  const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(from);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (span - 1));
  return {
    dateFrom: prevFrom.toISOString().slice(0, 10),
    dateTo: prevTo.toISOString().slice(0, 10),
  };
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
