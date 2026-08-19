import { z } from 'zod';
import {
  FUNNEL_NODE_TYPES,
  type FunnelNodeType,
} from './funnel-templates';
import {
  funnelCompleteConnectionSchema,
  funnelCompleteNodeSchema,
  funnelCompleteSpecSchema,
  parseFunnelCompleteSpec,
  type FunnelCompleteSpec,
} from './funnel-complete';

export type FunnelCanvasNode = z.infer<typeof funnelCompleteNodeSchema>;
export type FunnelCanvasConnection = z.infer<typeof funnelCompleteConnectionSchema>;

export class FunnelCanvasValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
  ) {
    super(message);
    this.name = 'FunnelCanvasValidationError';
  }
}

/** Validate graph integrity without changing content blocks */
export function validateFunnelCanvasGraph(input: {
  nodes: FunnelCanvasNode[];
  connections: FunnelCanvasConnection[];
}): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const nodes = input.nodes ?? [];
  const connections = input.connections ?? [];

  if (nodes.length < 1) issues.push('Cần ít nhất 1 node');
  if (nodes.length > 40) issues.push('Tối đa 40 nodes');
  if (connections.length > 60) issues.push('Tối đa 60 connections');

  const ids = new Set<string>();
  for (const n of nodes) {
    const parsed = funnelCompleteNodeSchema.safeParse(n);
    if (!parsed.success) {
      issues.push(`Node không hợp lệ: ${n?.id ?? '?'}`);
      continue;
    }
    if (ids.has(parsed.data.id)) issues.push(`Trùng node id: ${parsed.data.id}`);
    ids.add(parsed.data.id);
    if (!(FUNNEL_NODE_TYPES as readonly string[]).includes(parsed.data.type)) {
      issues.push(`Node type không hợp lệ: ${parsed.data.type}`);
    }
  }

  const connIds = new Set<string>();
  const pairKeys = new Set<string>();
  for (const c of connections) {
    const parsed = funnelCompleteConnectionSchema.safeParse(c);
    if (!parsed.success) {
      issues.push(`Connection không hợp lệ: ${c?.id ?? '?'}`);
      continue;
    }
    const { id, from, to } = parsed.data;
    if (connIds.has(id)) issues.push(`Trùng connection id: ${id}`);
    connIds.add(id);
    if (from === to) issues.push(`Không được nối node vào chính nó: ${from}`);
    if (!ids.has(from)) issues.push(`Connection ${id}: from không tồn tại (${from})`);
    if (!ids.has(to)) issues.push(`Connection ${id}: to không tồn tại (${to})`);
    const pair = `${from}->${to}`;
    if (pairKeys.has(pair)) issues.push(`Connection trùng hướng: ${pair}`);
    pairKeys.add(pair);
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}

function syncStagesFromNodes(nodes: FunnelCanvasNode[]): FunnelCompleteSpec['stages'] {
  const stages = nodes
    .filter((n) => n.type === 'STAGE' && n.stage)
    .map((n, i) => ({
      ...n.stage!,
      position: n.stage!.position ?? i,
      name: n.stage!.name || n.label,
    }));
  if (stages.length > 0) return stages;
  return [
    {
      name: 'Lead mới',
      code: 'NEW',
      category: 'OPEN' as const,
      position: 0,
      probability: 10,
    },
    {
      name: 'Đã mua',
      code: 'PURCHASED',
      category: 'WON' as const,
      position: 1,
      probability: 100,
      isWon: true,
    },
  ];
}

/**
 * Apply canvas edits onto an existing completeSpec.
 * Re-validates full funnel-complete.v1; rejects invalid connections/nodes.
 */
export function applyFunnelCanvasDraft(
  current: FunnelCompleteSpec,
  patch: {
    name?: string;
    offer?: string;
    cta?: string;
    strategy?: string;
    summary?: string;
    nodes: FunnelCanvasNode[];
    connections: FunnelCanvasConnection[];
  },
): FunnelCompleteSpec {
  const graph = validateFunnelCanvasGraph({
    nodes: patch.nodes,
    connections: patch.connections,
  });
  if (!graph.ok) {
    throw new FunnelCanvasValidationError('Graph không hợp lệ', graph.issues);
  }

  const merged = {
    ...current,
    schemaVersion: 'funnel-complete.v1' as const,
    mode: 'draft' as const,
    name: patch.name?.trim() || current.name,
    offer: patch.offer?.trim() || current.offer,
    cta: patch.cta?.trim() || current.cta,
    strategy: patch.strategy?.trim() || current.strategy,
    summary: patch.summary ?? current.summary,
    nodes: patch.nodes,
    connections: patch.connections,
    stages: syncStagesFromNodes(patch.nodes),
    disclaimers: [
      'Funnel draft trên Canvas — chưa activate/deploy pipeline live.',
      'Nodes/connections đã validate theo funnel-complete.v1.',
    ],
  };

  const parsed = funnelCompleteSpecSchema.safeParse(merged);
  if (!parsed.success) {
    throw new FunnelCanvasValidationError(
      'Spec không khớp funnel-complete.v1',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 12),
    );
  }
  return parsed.data;
}

export function canConnectFunnelNodes(
  nodes: FunnelCanvasNode[],
  connections: FunnelCanvasConnection[],
  from: string,
  to: string,
): { ok: true } | { ok: false; reason: string } {
  if (!from || !to) return { ok: false, reason: 'Thiếu from/to' };
  if (from === to) return { ok: false, reason: 'Không nối node vào chính nó' };
  const ids = new Set(nodes.map((n) => n.id));
  if (!ids.has(from) || !ids.has(to)) return { ok: false, reason: 'Node không tồn tại' };
  if (connections.some((c) => c.from === from && c.to === to)) {
    return { ok: false, reason: 'Connection đã tồn tại' };
  }
  if (connections.length >= 60) return { ok: false, reason: 'Đã đạt tối đa 60 connections' };
  return { ok: true };
}

export function createFunnelCanvasNode(input: {
  type: FunnelNodeType;
  label?: string;
  position?: { x: number; y: number };
  existingIds: Set<string>;
}): FunnelCanvasNode {
  if (!(FUNNEL_NODE_TYPES as readonly string[]).includes(input.type)) {
    throw new FunnelCanvasValidationError('Node type không hợp lệ', [String(input.type)]);
  }
  let id = `${input.type.toLowerCase()}-${Date.now().toString(36)}`;
  let i = 0;
  while (input.existingIds.has(id)) {
    i += 1;
    id = `${input.type.toLowerCase()}-${Date.now().toString(36)}-${i}`;
  }
  const label = input.label?.trim() || `Node ${input.type}`;
  const node: FunnelCanvasNode = {
    id,
    type: input.type,
    label: label.slice(0, 160),
    description: undefined,
    position: input.position ?? { x: 120, y: 120 },
  };
  if (input.type === 'STAGE') {
    node.stage = {
      name: label.slice(0, 120),
      code: id.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase().slice(0, 64) || 'STAGE',
      category: 'OPEN',
      position: 0,
      probability: 20,
    };
  }
  if (input.type === 'FORM') node.meta = { formKey: 'public' };
  if (input.type === 'BOOKING') node.meta = { bookingEvent: 'BOOKING_CREATED' };
  if (input.type === 'GOAL') node.meta = { conversion: 'LEAD' };
  if (input.type === 'AUTOMATION') node.meta = { triggerType: 'LEAD_CREATED' };
  if (input.type === 'RETARGET') {
    node.meta = { conditionField: 'score', conditionOp: 'gte', conditionValue: 0 };
  }
  return funnelCompleteNodeSchema.parse(node);
}

export function assertFunnelCompleteDraft(raw: unknown): FunnelCompleteSpec {
  const spec = parseFunnelCompleteSpec(raw);
  if (spec.mode !== 'draft') {
    throw new FunnelCanvasValidationError('Chỉ chỉnh sửa Funnel ở mode draft', ['mode']);
  }
  const graph = validateFunnelCanvasGraph(spec);
  if (!graph.ok) {
    throw new FunnelCanvasValidationError('Graph không hợp lệ', graph.issues);
  }
  return spec;
}
