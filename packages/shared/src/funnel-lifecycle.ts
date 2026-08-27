/**
 * Prompt 16 — Funnel publish lifecycle, quota, prompt safety, activate graph.
 */
import { createFunnelCanvasNode } from './funnel-canvas';
import type { FunnelCompleteSpec } from './funnel-complete';
import { parseFunnelCompleteSpec } from './funnel-complete';
import { FUNNEL_ACTIVATE_MIN_SCORE, validateFunnelCompleteSpec } from './funnel-validator';

export const FUNNEL_PUBLISH_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type FunnelPublishStatus = (typeof FUNNEL_PUBLISH_STATUSES)[number];

export const FUNNEL_STATUS_TRANSITIONS: Record<FunnelPublishStatus, FunnelPublishStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionFunnelStatus(
  from: FunnelPublishStatus,
  to: FunnelPublishStatus,
): boolean {
  if (from === to) return true;
  return FUNNEL_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Max funnels (all statuses except archived) and max concurrent ACTIVE. */
export function resolveFunnelQuota(
  planCode: string | null | undefined,
  isTrial: boolean,
): { maxFunnels: number; maxActive: number } {
  if (isTrial) return { maxFunnels: 3, maxActive: 1 };
  const code = (planCode || '').toLowerCase();
  if (code.includes('business') || code.includes('enterprise')) {
    return { maxFunnels: 200, maxActive: 50 };
  }
  if (code.includes('pro')) return { maxFunnels: 50, maxActive: 15 };
  if (code.includes('starter') || code.includes('basic')) {
    return { maxFunnels: 10, maxActive: 3 };
  }
  return { maxFunnels: 20, maxActive: 5 };
}

export function sanitizeFunnelUserPrompt(input: string, max = 2000): string {
  let s = String(input ?? '').slice(0, max);
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(
    /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+instructions?\b/gi,
    '[redacted]',
  );
  s = s.replace(/\b(system|developer)\s*:\s*/gi, '');
  s = s.replace(/jailbreak|bypass\s+schema|override\s+schema/gi, '[redacted]');
  s = s.replace(/"schemaVersion"\s*:/gi, '"_ignored":');
  s = s.replace(/mode\s*[:=]\s*["']?(live|published|active)["']?/gi, 'mode draft');
  return s.replace(/\s+/g, ' ').trim();
}

export type FunnelSpecDiffItem = { path: string; before: string; after: string };

export function diffFunnelCompleteSpecs(
  before: FunnelCompleteSpec,
  after: FunnelCompleteSpec,
): FunnelSpecDiffItem[] {
  const items: FunnelSpecDiffItem[] = [];
  const scalar = ['name', 'offer', 'cta', 'strategy', 'summary'] as const;
  for (const k of scalar) {
    if (String(before[k] ?? '') !== String(after[k] ?? '')) {
      items.push({
        path: k,
        before: String(before[k] ?? '').slice(0, 180),
        after: String(after[k] ?? '').slice(0, 180),
      });
    }
  }
  if (before.nodes.length !== after.nodes.length) {
    items.push({
      path: 'nodes.count',
      before: String(before.nodes.length),
      after: String(after.nodes.length),
    });
  }
  const bt = before.nodes.map((n) => n.type).sort().join(',');
  const at = after.nodes.map((n) => n.type).sort().join(',');
  if (bt !== at) items.push({ path: 'nodes.types', before: bt, after: at });
  if (before.followUp.length !== after.followUp.length) {
    items.push({
      path: 'followUp.count',
      before: String(before.followUp.length),
      after: String(after.followUp.length),
    });
  }
  return items.slice(0, 30);
}

function addTypedNode(
  spec: FunnelCompleteSpec,
  type: FunnelCompleteSpec['nodes'][number]['type'],
  id: string,
  label: string,
  fromId?: string,
  toId?: string,
): void {
  if (spec.nodes.some((n) => n.type === type || n.id === id)) return;
  if (spec.nodes.length >= 40) return;
  const node = createFunnelCanvasNode({
    type,
    label,
    existingIds: new Set(spec.nodes.map((n) => n.id)),
    position: { x: 80, y: 200 + spec.nodes.length * 12 },
  });
  node.id = id;
  spec.nodes.push(node);
  if (fromId && spec.nodes.some((n) => n.id === fromId) && spec.connections.length < 60) {
    spec.connections.push({ id: `${id}_in`, from: fromId, to: id });
  }
  if (toId && spec.nodes.some((n) => n.id === toId) && spec.connections.length < 60) {
    spec.connections.push({ id: `${id}_out`, from: id, to: toId });
  }
}

function ensureLeadFormPhone(spec: FunnelCompleteSpec): void {
  const fields = [...(spec.leadForm?.fields ?? [])];
  const tel = fields.find((f) => f.type === 'tel');
  if (tel) {
    tel.required = true;
  } else if (fields.length < 20) {
    fields.push({
      key: 'phone',
      label: 'Số điện thoại',
      type: 'tel',
      required: true,
      placeholder: '09…',
    });
  }
  const hasName = fields.some(
    (f) => f.type === 'text' || /name|full_name|ho_ten|họ/i.test(f.key),
  );
  if (!hasName && fields.length < 20) {
    fields.unshift({
      key: 'full_name',
      label: 'Họ và tên',
      type: 'text',
      required: true,
      placeholder: 'Nguyễn Thị A',
    });
  }
  spec.leadForm = {
    title: spec.leadForm?.title?.trim() || 'Đăng ký tư vấn',
    submitLabel: spec.leadForm?.submitLabel?.trim() || 'Gửi thông tin',
    fields,
    privacyNote: spec.leadForm?.privacyNote,
  };
}

function spliceFormIntoGraph(spec: FunnelCompleteSpec, formId: string): void {
  const prefer = ['LANDING', 'OFFER', 'TRAFFIC', 'CONTENT', 'QUIZ', 'GAME', 'CTA', 'RETARGET'];
  const fromNode = spec.nodes.find((n) => prefer.includes(n.type) && n.id !== formId);
  const outgoing = fromNode
    ? spec.connections.find((c) => c.from === fromNode.id && c.to !== formId)
    : undefined;
  if (fromNode && outgoing) {
    const originalTo = outgoing.to;
    outgoing.to = formId;
    if (
      spec.connections.length < 60 &&
      !spec.connections.some((c) => c.from === formId && c.to === originalTo)
    ) {
      spec.connections.push({ id: 'pub_form_out', from: formId, to: originalTo });
    }
    return;
  }
  const dest =
    spec.nodes.find((n) => n.type === 'GOAL')?.id ??
    spec.nodes.find((n) => n.type === 'STAGE')?.id;
  if (fromNode && spec.connections.length < 60) {
    spec.connections.push({ id: 'pub_form_in', from: fromNode.id, to: formId });
  }
  if (dest && spec.connections.length < 60) {
    spec.connections.push({ id: 'pub_form_out', from: formId, to: dest });
  }
}

function connectOrphanNodes(spec: FunnelCompleteSpec): void {
  const linked = new Set<string>();
  for (const c of spec.connections) {
    linked.add(c.from);
    linked.add(c.to);
  }
  const hub =
    spec.nodes.find((n) => n.type === 'FORM') ??
    spec.nodes.find((n) => n.type === 'LANDING') ??
    spec.nodes[0];
  if (!hub || spec.nodes.length <= 1) return;
  for (const n of spec.nodes) {
    if (linked.has(n.id) || n.id === hub.id) continue;
    if (spec.connections.length >= 60) break;
    spec.connections.push({
      id: `pub_orphan_${n.id}`.slice(0, 64),
      from: hub.id,
      to: n.id,
    });
    linked.add(n.id);
  }
}

/**
 * Add missing blocking graph pieces so a template draft can pass validator.
 * Does not publish. Does not invent KPIs.
 */
export function ensureFunnelActivateRequirements(input: FunnelCompleteSpec): FunnelCompleteSpec {
  const spec = JSON.parse(JSON.stringify(input)) as FunnelCompleteSpec;
  ensureLeadFormPhone(spec);

  if (!spec.nodes.some((n) => n.type === 'FORM')) {
    addTypedNode(spec, 'FORM', 'pub_form', 'Form đăng ký');
    spliceFormIntoGraph(spec, 'pub_form');
  }

  const form = spec.nodes.find((n) => n.type === 'FORM');
  const goal = spec.nodes.find((n) => n.type === 'GOAL');
  const first = spec.nodes[0];

  addTypedNode(spec, 'TRAFFIC', 'pub_traffic', 'Nguồn traffic', undefined, form?.id ?? first?.id);
  addTypedNode(spec, 'LANDING', 'pub_landing', 'Landing page', 'pub_traffic', form?.id);
  addTypedNode(spec, 'OFFER', 'pub_offer', spec.offer.slice(0, 160) || 'Offer', form?.id, goal?.id);
  addTypedNode(spec, 'CTA', 'pub_cta', spec.cta.slice(0, 160) || 'CTA', form?.id, goal?.id);
  addTypedNode(spec, 'GOAL', 'pub_goal', spec.conversionGoal?.label?.slice(0, 160) || 'Goal', form?.id);

  if (!spec.cta?.trim()) spec.cta = 'Đặt lịch tư vấn';
  if (!spec.offer?.trim()) spec.offer = 'Tặng buổi tư vấn lộ trình cá nhân hóa';
  if (!spec.conversionGoal?.label?.trim() || !spec.conversionGoal?.primaryEvent) {
    spec.conversionGoal = {
      code: spec.conversionGoal?.code || 'FUNNEL_GOAL',
      label: spec.conversionGoal?.label?.trim() || spec.cta.slice(0, 160),
      primaryEvent: spec.conversionGoal?.primaryEvent || 'FORM_SUBMITTED',
    };
  }
  if (!spec.followUp.length) {
    spec.followUp.push({
      name: 'Xác nhận lead mới',
      trigger: 'LEAD_CREATED',
      delayMinutes: 5,
      channel: 'ZALO',
      message: spec.offer.slice(0, 500),
    });
  }

  connectOrphanNodes(spec);
  spec.mode = 'draft';
  spec.schemaVersion = 'funnel-complete.v1';
  return parseFunnelCompleteSpec(spec);
}

export function assertFunnelCanActivate(spec: FunnelCompleteSpec): {
  ok: boolean;
  score: number;
  blocking: string[];
} {
  const v = validateFunnelCompleteSpec(spec);
  return {
    ok: v.canActivate,
    score: v.score,
    blocking: v.blocking,
  };
}

export { FUNNEL_ACTIVATE_MIN_SCORE };
