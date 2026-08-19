/** Funnel-scoped automation helpers (Prompt 9) — shared API + worker. */

export const FUNNEL_AUTOMATION_TRIGGERS = [
  'LEAD_CREATED',
  'STAGE_CHANGED',
  'SCORE_CHANGED',
  'MESSAGE_RECEIVED',
  'NO_REPLY',
  'BOOKING_CREATED',
  'PURCHASED',
] as const;

export type FunnelAutomationTrigger = (typeof FUNNEL_AUTOMATION_TRIGGERS)[number];

export type NormalizedAutomationAction =
  | { type: 'SEND_MESSAGE'; templateId?: string }
  | { type: 'SEND_EMAIL'; templateId?: string }
  | { type: 'WAIT'; minutes: number }
  | { type: 'ADD_TAG'; tag: string }
  | { type: 'CHANGE_STATUS'; pipelineStatus?: string; stageId?: string }
  | { type: 'ASSIGN_EMPLOYEE'; employeeId?: string; mode?: 'round_robin' }
  | { type: 'CREATE_TASK'; title: string; dueInMinutes?: number }
  | { type: 'WEBHOOK'; url: string; secretHeader?: string }
  | { type: 'CREATE_APPOINTMENT'; branchId?: string; delayMinutes?: number }
  | { type: 'UNKNOWN'; rawType: string };

/**
 * Funnel-specific flow only runs for leads of that funnel.
 * Legacy flows with null funnelId still run org-wide (backward compatible).
 */
export function automationFlowMatchesFunnel(
  flowFunnelId: string | null | undefined,
  leadFunnelId: string | null | undefined,
): boolean {
  if (!flowFunnelId) return true;
  if (!leadFunnelId) return false;
  return flowFunnelId === leadFunnelId;
}

export function normalizeAutomationAction(raw: unknown): NormalizedAutomationAction {
  if (!raw || typeof raw !== 'object') return { type: 'UNKNOWN', rawType: 'invalid' };
  const a = raw as Record<string, unknown>;
  const type = String(a.type ?? '').toUpperCase();

  if (type === 'SEND_MESSAGE') {
    return { type: 'SEND_MESSAGE', templateId: str(a.templateId) };
  }
  if (type === 'SEND_EMAIL') {
    return { type: 'SEND_EMAIL', templateId: str(a.templateId) };
  }
  if (type === 'WAIT') {
    const minutes = num(a.minutes) ?? num(a.delayMinutes) ?? 0;
    return { type: 'WAIT', minutes: Math.max(0, minutes) };
  }
  if (type === 'ADD_TAG') {
    return { type: 'ADD_TAG', tag: str(a.tag) ?? '' };
  }
  if (type === 'CHANGE_STATUS' || type === 'CHANGE_STAGE') {
    return {
      type: 'CHANGE_STATUS',
      pipelineStatus: str(a.pipelineStatus) ?? str(a.stageCode),
      stageId: str(a.stageId),
    };
  }
  if (type === 'ASSIGN_EMPLOYEE' || type === 'ASSIGN_SALE') {
    return {
      type: 'ASSIGN_EMPLOYEE',
      employeeId: str(a.employeeId),
      mode: a.mode === 'round_robin' ? 'round_robin' : undefined,
    };
  }
  if (type === 'CREATE_TASK') {
    return {
      type: 'CREATE_TASK',
      title: str(a.title) ?? 'Task automation',
      dueInMinutes: num(a.dueInMinutes),
    };
  }
  if (type === 'WEBHOOK') {
    return { type: 'WEBHOOK', url: str(a.url) ?? '', secretHeader: str(a.secretHeader) };
  }
  if (type === 'CREATE_APPOINTMENT') {
    return {
      type: 'CREATE_APPOINTMENT',
      branchId: str(a.branchId),
      delayMinutes: num(a.delayMinutes),
    };
  }
  return { type: 'UNKNOWN', rawType: type || 'unknown' };
}

export function isSafeWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(host)) return false;
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

export function stageTriggerMatches(
  triggerConfig: Record<string, unknown> | null | undefined,
  next: { stageId?: string | null; stageCode?: string | null; previousStatus?: string | null },
): boolean {
  if (!triggerConfig || Object.keys(triggerConfig).length === 0) return true;
  const wantId = str(triggerConfig.stageId);
  const wantCode = str(triggerConfig.stageCode) ?? str(triggerConfig.pipelineStatus);
  const fromId = str(triggerConfig.fromStageId);
  if (wantId && next.stageId && wantId !== next.stageId) return false;
  if (wantCode && next.stageCode && wantCode.toUpperCase() !== next.stageCode.toUpperCase()) {
    return false;
  }
  if (fromId && next.stageId && fromId === next.stageId) return false;
  return true;
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
