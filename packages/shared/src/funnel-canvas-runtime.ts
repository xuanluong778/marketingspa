import type {
  FunnelCompleteSpec,
  FunnelCompleteNode,
  FunnelCompleteConnection,
  FunnelEdgeBranch,
} from './funnel-complete';
import type { FunnelNodeType } from './funnel-templates';

export const FUNNEL_CANVAS_EVENTS = [
  'FORM_SUBMITTED',
  'LEAD_CREATED',
  'CTA_CLICK',
  'STAGE_CHANGED',
  'MQL',
  'SQL',
  'BOOKING_CREATED',
  'BOOKING_CONFIRMED',
  'BOOKING_COMPLETED',
  'BOOKING_CANCELLED',
  'VISIT',
  'PURCHASE',
  'TIMEOUT',
  'SUCCESS',
  'FAILURE',
  'LEAD_UNTOUCHED',
] as const;

export type FunnelCanvasRuntimeEvent = (typeof FUNNEL_CANVAS_EVENTS)[number] | string;

export const FUNNEL_CONVERSION_CODES = [
  'LEAD',
  'MQL',
  'SQL',
  'BOOKING',
  'VISIT',
  'PURCHASE',
] as const;

export type FunnelConversionCode = (typeof FUNNEL_CONVERSION_CODES)[number];

export const FUNNEL_PASSTHROUGH_NODE_TYPES: readonly FunnelNodeType[] = [
  'TRAFFIC',
  'LANDING',
  'OFFER',
  'CONTENT',
  'QUIZ',
  'GAME',
  'CTA',
  'REFERRAL',
];

export type FunnelCanvasRuntimeContext = {
  event: FunnelCanvasRuntimeEvent;
  branch?: FunnelEdgeBranch | string;
  stageCode?: string | null;
  previousStatus?: string | null;
  pipelineStatus?: string | null;
  qualification?: string | null;
  score?: number | null;
  tags?: string[];
  conversion?: FunnelConversionCode | string | null;
  revenue?: number | null;
  appointmentStatus?: string | null;
};

export type FunnelCanvasPlannedTransition = {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  event: string;
  branch: FunnelEdgeBranch;
  delayMinutes: number;
  kind: 'now' | 'delay' | 'timeout';
};

export type FunnelCanvasRuntimeJobData = {
  organizationId: string;
  funnelId: string;
  leadId: string;
  nodeId: string;
  event: string;
  branch?: string;
  edgeId?: string | null;
  publishedVersion: number;
  appointmentId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  revenue?: number | null;
  fromSchedule?: boolean;
};

export const FUNNEL_BOOKING_EVENTS = [
  'BOOKING_CREATED',
  'BOOKING_CONFIRMED',
  'BOOKING_COMPLETED',
  'BOOKING_CANCELLED',
  'VISIT',
] as const;

export type FunnelBookingEvent = (typeof FUNNEL_BOOKING_EVENTS)[number];

export type FunnelCanvasNodeMeta = {
  formKey?: string;
  flowId?: string;
  triggerType?: string;
  stageCode?: string;
  stageId?: string;
  bookingEvent?: string;
  conversion?: string;
  scoreDelta?: number;
  delayMinutes?: number;
  timeoutMinutes?: number;
  conditionField?: string;
  conditionOp?: string;
  conditionValue?: string | number | boolean | null;
  audienceKey?: string;
};

export function readCanvasNodeMeta(node: FunnelCompleteNode): FunnelCanvasNodeMeta {
  const m = node.meta ?? {};
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    formKey: str(m.formKey) ?? 'public',
    flowId: str(m.flowId),
    triggerType: str(m.triggerType) ?? str(m.trigger),
    stageCode: str(m.stageCode) ?? node.stage?.code,
    stageId: str(m.stageId),
    bookingEvent: str(m.bookingEvent) ?? 'BOOKING_CREATED',
    conversion: str(m.conversion) ?? str(m.goal),
    scoreDelta: num(m.scoreDelta),
    delayMinutes: num(m.delayMinutes),
    timeoutMinutes: num(m.timeoutMinutes),
    conditionField: str(m.conditionField),
    conditionOp: str(m.conditionOp),
    conditionValue:
      m.conditionValue === null || m.conditionValue === undefined
        ? undefined
        : (m.conditionValue as string | number | boolean),
    audienceKey: str(m.audienceKey),
  };
}

export function canvasNodeMetaToRecord(meta: FunnelCanvasNodeMeta): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    out[k] = v as string | number | boolean | null;
  }
  return out;
}

const PASS = new Set<string>(FUNNEL_PASSTHROUGH_NODE_TYPES);

export function isFunnelPassthroughNode(type: string): boolean {
  return PASS.has(type);
}

export function canvasRuntimeIdempotencyKey(input: {
  funnelId: string;
  publishedVersion: number;
  leadId: string;
  nodeId: string;
  event: string;
  edgeId?: string | null;
}): string {
  const edge = input.edgeId ? `:${input.edgeId}` : '';
  return `CANVAS:${input.funnelId}:v${input.publishedVersion}:${input.leadId}:${input.nodeId}:${input.event}${edge}`.slice(
    0,
    190,
  );
}

export function defaultCanvasTimeoutMinutes(spec: FunnelCompleteSpec): number {
  const hit = spec.followUp?.find(
    (f) => f.trigger === 'LEAD_UNTOUCHED' || f.trigger === 'NO_SHOW',
  );
  if (hit?.delayMinutes && hit.delayMinutes > 0) return hit.delayMinutes;
  return 24 * 60;
}

export function normalizeCanvasEvent(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

export function expectedStageForCanvasEvent(ctx: FunnelCanvasRuntimeContext): string | null {
  const ev = normalizeCanvasEvent(String(ctx.event));
  switch (ev) {
    case 'FORM_SUBMITTED':
    case 'LEAD_CREATED':
      return 'NEW';
    case 'STAGE_CHANGED':
      return (ctx.stageCode || ctx.pipelineStatus || '').toUpperCase() || null;
    case 'MQL':
      return 'QUALIFIED';
    case 'SQL':
      return ctx.stageCode?.toUpperCase() || 'BOOKED';
    case 'BOOKING_CREATED':
      return 'BOOKED';
    case 'BOOKING_CONFIRMED':
      return 'CONFIRMED';
    case 'BOOKING_COMPLETED':
    case 'VISIT':
      return 'VISITED';
    case 'PURCHASE':
      return 'PURCHASED';
    case 'BOOKING_CANCELLED':
      return 'CONTACTED';
    default:
      return null;
  }
}

export function conversionForCanvasEvent(ctx: FunnelCanvasRuntimeContext): FunnelConversionCode | null {
  if (ctx.conversion && FUNNEL_CONVERSION_CODES.includes(ctx.conversion as FunnelConversionCode)) {
    return ctx.conversion as FunnelConversionCode;
  }
  const ev = normalizeCanvasEvent(String(ctx.event));
  if (ev === 'FORM_SUBMITTED' || ev === 'LEAD_CREATED') return 'LEAD';
  if (ev === 'MQL') return 'MQL';
  if (ev === 'SQL') return 'SQL';
  if (ev === 'BOOKING_CREATED' || ev === 'BOOKING_CONFIRMED') return 'BOOKING';
  if (ev === 'VISIT' || ev === 'BOOKING_COMPLETED') return 'VISIT';
  if (ev === 'PURCHASE') return 'PURCHASE';
  return null;
}

export function resolveGoalConversion(
  node: FunnelCompleteNode,
  spec: FunnelCompleteSpec,
  ctx: FunnelCanvasRuntimeContext,
): FunnelConversionCode | null {
  const meta = node.meta ?? {};
  const pinnedRaw =
    typeof meta.conversion === 'string' ? meta.conversion : typeof meta.goal === 'string' ? meta.goal : '';
  const pinned = normalizeCanvasEvent(pinnedRaw);
  if (FUNNEL_CONVERSION_CODES.includes(pinned as FunnelConversionCode)) {
    return pinned as FunnelConversionCode;
  }
  return conversionForCanvasEvent(ctx) ?? goalConversionOfNode(node, spec);
}

export function goalConversionOfNode(
  node: FunnelCompleteNode,
  spec: FunnelCompleteSpec,
): FunnelConversionCode | null {
  const meta = node.meta ?? {};
  const raw = typeof meta.conversion === 'string' ? meta.conversion : typeof meta.goal === 'string' ? meta.goal : '';
  const fromMeta = normalizeCanvasEvent(raw);
  if (FUNNEL_CONVERSION_CODES.includes(fromMeta as FunnelConversionCode)) {
    return fromMeta as FunnelConversionCode;
  }
  const blob = `${node.label} ${node.description ?? ''}`.toLowerCase();
  if (/\bpurchase\b|mua|won|doanh thu/.test(blob)) return 'PURCHASE';
  if (/\bvisit\b|đến spa|check-?in|arrived/.test(blob)) return 'VISIT';
  if (/\bbook|đặt lịch|appointment/.test(blob)) return 'BOOKING';
  if (/\bsql\b/.test(blob)) return 'SQL';
  if (/\bmql\b/.test(blob)) return 'MQL';
  if (/\blead\b|form|đăng ký/.test(blob)) return 'LEAD';
  const primary = spec.conversionGoal?.primaryEvent;
  if (primary === 'PURCHASE') return 'PURCHASE';
  if (primary === 'VISIT') return 'VISIT';
  if (primary === 'BOOKING_CONFIRMED') return 'BOOKING';
  if (primary === 'LEAD_CREATED' || primary === 'FORM_SUBMITTED') return 'LEAD';
  return 'LEAD';
}

export function evaluateFunnelEdgeCondition(
  condition: FunnelCompleteConnection['condition'],
  ctx: FunnelCanvasRuntimeContext,
): boolean {
  if (!condition) return true;
  const field = condition.field.trim();
  const actual = resolveConditionField(field, ctx);
  return compareCondition(actual, condition.op, condition.value);
}

function resolveConditionField(field: string, ctx: FunnelCanvasRuntimeContext): string | number | boolean | null {
  const key = field.trim();
  const aliases: Record<string, unknown> = {
    event: ctx.event,
    branch: ctx.branch ?? 'default',
    stage: ctx.stageCode ?? ctx.pipelineStatus,
    stageCode: ctx.stageCode,
    pipelineStatus: ctx.pipelineStatus ?? ctx.stageCode,
    qualification: ctx.qualification,
    score: ctx.score ?? 0,
    conversion: ctx.conversion,
    revenue: ctx.revenue ?? 0,
    appointmentStatus: ctx.appointmentStatus,
    tags: (ctx.tags ?? []).join(','),
  };
  const hit = aliases[key] ?? aliases[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];
  if (hit == null) return null;
  if (typeof hit === 'number' || typeof hit === 'boolean') return hit;
  return String(hit);
}

function compareCondition(
  actual: string | number | boolean | null,
  op: NonNullable<FunnelCompleteConnection['condition']>['op'],
  value: string | number | boolean,
): boolean {
  if (op === 'in') {
    const set = String(value)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return set.includes(String(actual ?? '').trim().toLowerCase());
  }
  if (op === 'contains') {
    return String(actual ?? '')
      .toLowerCase()
      .includes(String(value).toLowerCase());
  }
  if (op === 'eq' || op === 'neq') {
    const ok =
      typeof value === 'boolean'
        ? Boolean(actual) === value
        : typeof value === 'number'
          ? Number(actual) === value
          : String(actual ?? '').toLowerCase() === String(value).toLowerCase();
    return op === 'eq' ? ok : !ok;
  }
  const a = Number(actual);
  const b = Number(value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === 'gte') return a >= b;
  if (op === 'lte') return a <= b;
  if (op === 'gt') return a > b;
  if (op === 'lt') return a < b;
  return false;
}

export function inferCanvasConnectionRuntime(
  conn: FunnelCompleteConnection,
  spec: FunnelCompleteSpec,
): {
  event?: string;
  branch: FunnelEdgeBranch;
  delayMinutes: number;
  timeoutMinutes: number;
} {
  const label = (conn.label ?? '').toLowerCase();
  let event = conn.event ? normalizeCanvasEvent(conn.event) : undefined;
  let branch = (conn.branch as FunnelEdgeBranch | undefined) ?? 'default';
  let delayMinutes = conn.delayMinutes ?? 0;
  let timeoutMinutes = conn.timeoutMinutes ?? 0;

  if (/timeout|no.?reply|untouched|quá hạn|không phản hồi/.test(label)) {
    event = event || 'TIMEOUT';
    if (branch === 'default') branch = 'timeout';
    if (!timeoutMinutes) timeoutMinutes = defaultCanvasTimeoutMinutes(spec);
  }
  if (/no-?show|hủy|cancel|lost|thất bại|fail/.test(label)) {
    if (branch === 'default') branch = 'failure';
    if (!event && /hủy|cancel/.test(label)) event = 'BOOKING_CANCELLED';
  }
  if (/success|won|ok|thành công/.test(label) && branch === 'default') {
    branch = 'success';
  }
  if (event === 'TIMEOUT' && branch === 'default') branch = 'timeout';
  if (event === 'FAILURE' && branch === 'default') branch = 'failure';
  if (event === 'SUCCESS' && branch === 'default') branch = 'success';
  return { event, branch, delayMinutes, timeoutMinutes };
}

export function canvasNodeListensToEvent(
  node: FunnelCompleteNode,
  spec: FunnelCompleteSpec,
  ctx: FunnelCanvasRuntimeContext,
): boolean {
  const ev = normalizeCanvasEvent(String(ctx.event));
  if (node.type === 'FORM') return ev === 'FORM_SUBMITTED' || ev === 'LEAD_CREATED';
  if (node.type === 'CTA') return ev === 'CTA_CLICK';
  if (node.type === 'STAGE') {
    const code = (readCanvasNodeMeta(node).stageCode || node.stage?.code || '').toUpperCase();
    const expected = expectedStageForCanvasEvent(ctx);
    return Boolean(code && expected && code === expected);
  }
  if (node.type === 'BOOKING') {
    const want = normalizeCanvasEvent(readCanvasNodeMeta(node).bookingEvent ?? 'BOOKING_CREATED');
    if (want === ev) return true;
    if (want === 'VISIT' && (ev === 'BOOKING_COMPLETED' || ev === 'VISIT')) return true;
    return false;
  }
  if (node.type === 'GOAL') {
    const got = conversionForCanvasEvent(ctx);
    if (!got) return false;
    const meta = node.meta ?? {};
    const pinnedRaw =
      typeof meta.conversion === 'string' ? meta.conversion : typeof meta.goal === 'string' ? meta.goal : '';
    const pinned = normalizeCanvasEvent(pinnedRaw);
    if (FUNNEL_CONVERSION_CODES.includes(pinned as FunnelConversionCode)) {
      return pinned === got;
    }
    return true;
  }
  if (node.type === 'RETARGET') {
    if (ev === 'TIMEOUT' || ev === 'LEAD_UNTOUCHED') return true;
    const trigger = normalizeCanvasEvent(readCanvasNodeMeta(node).triggerType ?? '');
    return Boolean(trigger && trigger === ev);
  }
  if (node.type === 'AUTOMATION') {
    const trigger = normalizeCanvasEvent(String(node.meta?.triggerType ?? node.meta?.trigger ?? ''));
    if (trigger && trigger === ev) return true;
    if (ev === 'LEAD_UNTOUCHED' || ev === 'TIMEOUT') return !trigger || trigger === ev;
    return false;
  }
  return false;
}

export function entryCanvasNodeIds(spec: FunnelCompleteSpec, ctx: FunnelCanvasRuntimeContext): string[] {
  return spec.nodes.filter((n) => canvasNodeListensToEvent(n, spec, ctx)).map((n) => n.id);
}

function currentBranch(ctx: FunnelCanvasRuntimeContext): FunnelEdgeBranch {
  const b = String(ctx.branch || 'default').toLowerCase();
  if (b === 'success' || b === 'failure' || b === 'timeout' || b === 'default') return b;
  const ev = normalizeCanvasEvent(String(ctx.event));
  if (ev === 'TIMEOUT' || ev === 'LEAD_UNTOUCHED') return 'timeout';
  if (ev === 'FAILURE' || ev === 'BOOKING_CANCELLED') return 'failure';
  if (ev === 'SUCCESS') return 'success';
  return 'default';
}

function unlabeledEdgeAllowed(
  from: FunnelCompleteNode,
  to: FunnelCompleteNode,
  spec: FunnelCompleteSpec,
  ctx: FunnelCanvasRuntimeContext,
): boolean {
  const ev = normalizeCanvasEvent(String(ctx.event));
  if (ev === 'TIMEOUT' || ev === 'LEAD_UNTOUCHED') {
    return to.type === 'RETARGET' || to.stage?.code?.toUpperCase() === 'LOST';
  }
  if (to.type === 'STAGE') {
    const expected = expectedStageForCanvasEvent(ctx);
    const code = (to.stage?.code || '').toUpperCase();
    if (!expected || !code) return false;
    if (from.type === 'STAGE') return false;
    return code === expected;
  }
  if (to.type === 'GOAL') return canvasNodeListensToEvent(to, spec, ctx);
  if (to.type === 'RETARGET') return false;
  if (to.type === 'AUTOMATION') return true;
  if (to.type === 'BOOKING') return canvasNodeListensToEvent(to, spec, ctx);
  if (to.type === 'FORM') return ev === 'FORM_SUBMITTED' || ev === 'LEAD_CREATED' || ev === 'CTA_CLICK';
  if (isFunnelPassthroughNode(to.type)) return ev !== 'TIMEOUT';
  return false;
}

export function selectCanvasTransitions(
  spec: FunnelCompleteSpec,
  fromNodeId: string,
  ctx: FunnelCanvasRuntimeContext,
): FunnelCanvasPlannedTransition[] {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const from = byId.get(fromNodeId);
  if (!from) return [];
  const branchNow = currentBranch(ctx);
  const out: FunnelCanvasPlannedTransition[] = [];

  for (const conn of spec.connections) {
    if (conn.from !== fromNodeId) continue;
    const to = byId.get(conn.to);
    if (!to) continue;
    const inferred = inferCanvasConnectionRuntime(conn, spec);
    if (!evaluateFunnelEdgeCondition(conn.condition, ctx)) continue;

    const edgeBranch = inferred.branch;
    const isTimeoutEdge = edgeBranch === 'timeout' || inferred.event === 'TIMEOUT' || (inferred.timeoutMinutes > 0 && edgeBranch !== 'success');
    if (isTimeoutEdge && branchNow !== 'timeout' && normalizeCanvasEvent(String(ctx.event)) !== 'TIMEOUT') {
      if (inferred.timeoutMinutes > 0 || inferred.event === 'TIMEOUT' || edgeBranch === 'timeout') {
        out.push({
          edgeId: conn.id,
          fromNodeId,
          toNodeId: conn.to,
          event: 'TIMEOUT',
          branch: 'timeout',
          delayMinutes: inferred.timeoutMinutes || defaultCanvasTimeoutMinutes(spec),
          kind: 'timeout',
        });
      }
      continue;
    }

    if (edgeBranch !== 'default' && edgeBranch !== branchNow) continue;

    if (inferred.event) {
      const want = inferred.event;
      const got = normalizeCanvasEvent(String(ctx.event));
      const eventOk =
        want === got ||
        (want === 'SUCCESS' && (branchNow === 'success' || branchNow === 'default')) ||
        (want === 'FAILURE' && branchNow === 'failure') ||
        (want === 'TIMEOUT' && (got === 'TIMEOUT' || got === 'LEAD_UNTOUCHED'));
      if (!eventOk) continue;
    } else if (!unlabeledEdgeAllowed(from, to, spec, ctx)) {
      continue;
    }

    const delay = inferred.delayMinutes;
    out.push({
      edgeId: conn.id,
      fromNodeId,
      toNodeId: conn.to,
      event: inferred.event || normalizeCanvasEvent(String(ctx.event)),
      branch: edgeBranch,
      delayMinutes: delay,
      kind: delay > 0 ? 'delay' : 'now',
    });
  }
  return out;
}

export function mapCanvasEventToAutomationTrigger(event: string): string | null {
  const ev = normalizeCanvasEvent(event);
  switch (ev) {
    case 'FORM_SUBMITTED':
    case 'LEAD_CREATED':
      return 'LEAD_CREATED';
    case 'STAGE_CHANGED':
      return 'STAGE_CHANGED';
    case 'MQL':
    case 'SQL':
      return 'SCORE_CHANGED';
    case 'BOOKING_CREATED':
      return 'BOOKING_CREATED';
    case 'BOOKING_CONFIRMED':
      return 'APPOINTMENT_CREATED';
    case 'BOOKING_COMPLETED':
    case 'VISIT':
      return 'ORDER_COMPLETED';
    case 'BOOKING_CANCELLED':
      return 'APPOINTMENT_CANCELLED';
    case 'PURCHASE':
      return 'PURCHASED';
    case 'TIMEOUT':
    case 'LEAD_UNTOUCHED':
      return 'LEAD_UNTOUCHED';
    default:
      return null;
  }
}

export function mapConversionToFunnelEventType(conversion: FunnelConversionCode): string {
  switch (conversion) {
    case 'LEAD':
      return 'LEAD_CREATED';
    case 'MQL':
    case 'SQL':
      return 'LEAD_QUALIFIED';
    case 'BOOKING':
      return 'APPOINTMENT_BOOKED';
    case 'VISIT':
      return 'CUSTOMER_ARRIVED';
    case 'PURCHASE':
      return 'SERVICE_PURCHASED';
    default:
      return 'LEAD_CREATED';
  }
}
