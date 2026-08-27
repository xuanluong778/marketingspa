/**
 * Prompt 14 — Funnel Validator + Funnel Score (0–100)
 * Rule-based only — no fabricated KPIs. AI explanation is layered in API.
 */
import { validateFunnelCanvasGraph } from './funnel-canvas';
import type { FunnelBlueprintDraft } from './funnel-blueprint';
import type { FunnelCompleteSpec } from './funnel-complete';

export const FUNNEL_SCORE_DIMENSIONS = [
  'offer',
  'audience',
  'capture',
  'followUp',
  'automation',
  'conversion',
  'remarketing',
  'tracking',
] as const;

export type FunnelScoreDimension = (typeof FUNNEL_SCORE_DIMENSIONS)[number];

export type FunnelValidationCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: 'blocking' | 'warning';
  message: string;
  hint?: string;
};

export type FunnelDimensionScore = {
  score: number;
  max: number;
  issues: string[];
};

export type FunnelValidatorResult = {
  ready: boolean;
  canActivate: boolean;
  score: number;
  dimensions: Record<FunnelScoreDimension, FunnelDimensionScore>;
  checks: FunnelValidationCheck[];
  blocking: string[];
  warnings: string[];
};

export const FUNNEL_ACTIVATE_MIN_SCORE = 60;

const DIMENSION_MAX: Record<FunnelScoreDimension, number> = {
  offer: 12,
  audience: 12,
  capture: 14,
  followUp: 12,
  automation: 14,
  conversion: 14,
  remarketing: 11,
  tracking: 11,
};

function check(
  id: string,
  label: string,
  passed: boolean,
  message: string,
  opts?: { severity?: 'blocking' | 'warning'; hint?: string },
): FunnelValidationCheck {
  return {
    id,
    label,
    passed,
    severity: opts?.severity ?? (passed ? 'warning' : 'blocking'),
    message,
    hint: opts?.hint,
  };
}

function nodeTypes(spec: FunnelCompleteSpec): Set<string> {
  return new Set(spec.nodes.map((n) => n.type));
}

function findOrphanNodeIds(spec: FunnelCompleteSpec): string[] {
  const connected = new Set<string>();
  for (const c of spec.connections) {
    connected.add(c.from);
    connected.add(c.to);
  }
  if (spec.nodes.length <= 1) return [];
  return spec.nodes.filter((n) => !connected.has(n.id)).map((n) => n.id);
}

function hasPathTrafficToGoal(spec: FunnelCompleteSpec): boolean {
  const trafficIds = spec.nodes.filter((n) => n.type === 'TRAFFIC').map((n) => n.id);
  const goalIds = new Set(spec.nodes.filter((n) => n.type === 'GOAL').map((n) => n.id));
  if (!trafficIds.length || !goalIds.size) return false;

  const adj = new Map<string, string[]>();
  for (const c of spec.connections) {
    const list = adj.get(c.from) ?? [];
    list.push(c.to);
    adj.set(c.from, list);
  }

  for (const start of trafficIds) {
    const seen = new Set<string>();
    const q = [start];
    while (q.length) {
      const cur = q.shift()!;
      if (goalIds.has(cur)) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of adj.get(cur) ?? []) q.push(next);
    }
  }
  return false;
}

function hasTrackingSignals(spec: FunnelCompleteSpec): boolean {
  const metaKeys = ['utmSource', 'utmCampaign', 'utmMedium', 'fbclid', 'gclid', 'tracking'];
  for (const n of spec.nodes) {
    if (!n.meta) continue;
    for (const k of metaKeys) {
      if (n.meta[k] != null && n.meta[k] !== '') return true;
    }
  }
  if (spec.kpis?.length >= 2) return true;
  if (spec.remarketing?.audiences?.length) return true;
  return nodeTypes(spec).has('GOAL');
}

function chatbotReachable(spec: FunnelCompleteSpec): boolean {
  const flow = spec.chatbotFlow;
  if (!flow?.steps?.length) return false;
  const ids = new Set(flow.steps.map((s) => s.id));
  if (!ids.has(flow.entryStepId)) return false;
  const reachable = new Set<string>();
  const q = [flow.entryStepId];
  while (q.length) {
    const cur = q.shift()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    const step = flow.steps.find((s) => s.id === cur);
    if (!step) continue;
    if (step.nextId && ids.has(step.nextId)) q.push(step.nextId);
    for (const o of step.options ?? []) {
      if (ids.has(o.nextId)) q.push(o.nextId);
    }
  }
  return reachable.size >= Math.min(2, flow.steps.length);
}

/** Validate funnel-complete.v1 before activate */
export function validateFunnelCompleteSpec(spec: FunnelCompleteSpec): FunnelValidatorResult {
  const checks: FunnelValidationCheck[] = [];
  const dimIssues: Record<FunnelScoreDimension, string[]> = {
    offer: [],
    audience: [],
    capture: [],
    followUp: [],
    automation: [],
    conversion: [],
    remarketing: [],
    tracking: [],
  };

  const types = nodeTypes(spec);
  const graph = validateFunnelCanvasGraph({ nodes: spec.nodes, connections: spec.connections });

  if (!graph.ok) {
    for (const issue of graph.issues) {
      checks.push(
        check('graph_invalid', 'Connection graph', false, issue, {
          severity: 'blocking',
          hint: 'Sửa nodes/connections trên Canvas',
        }),
      );
    }
  } else {
    checks.push(check('graph_valid', 'Connection graph', true, 'Graph hợp lệ'));
  }

  const orphans = findOrphanNodeIds(spec);
  checks.push(
    check(
      'no_orphan_nodes',
      'Không orphan node',
      orphans.length === 0,
      orphans.length
        ? `Node không kết nối: ${orphans.join(', ')}`
        : 'Mọi node đều có connection',
      { hint: 'Nối node lẻ vào luồng chính' },
    ),
  );

  const hasTraffic =
    types.has('TRAFFIC') ||
    types.has('RETARGET') ||
    (spec.remarketing?.channels?.length ?? 0) > 0 ||
    spec.strategy.toLowerCase().includes('facebook') ||
    spec.strategy.toLowerCase().includes('google') ||
    spec.strategy.toLowerCase().includes('meta');
  checks.push(
    check(
      'traffic_source',
      'Traffic source',
      hasTraffic,
      hasTraffic ? 'Đã có nguồn traffic' : 'Thiếu TRAFFIC node hoặc kênh ads/remarketing',
      { hint: 'Thêm node TRAFFIC hoặc cấu hình remarketing channels' },
    ),
  );

  const hasPhone = spec.leadForm.fields.some((f) => f.type === 'tel' && f.required);
  const hasFormNode = types.has('FORM');
  const captureOk = hasPhone && hasFormNode && spec.leadForm.fields.length >= 2;
  checks.push(
    check(
      'lead_capture',
      'Lead capture',
      captureOk,
      captureOk
        ? `Form có ${spec.leadForm.fields.length} trường, bắt buộc SĐT`
        : 'Cần node FORM + leadForm có SĐT bắt buộc',
      { hint: 'Thêm FORM node và trường phone required' },
    ),
  );

  const ctaOk = Boolean(spec.cta?.trim()) && (types.has('CTA') || types.has('LANDING'));
  checks.push(
    check(
      'cta',
      'CTA',
      ctaOk,
      ctaOk ? `CTA: "${spec.cta.slice(0, 40)}"` : 'Thiếu CTA text hoặc node CTA/LANDING',
    ),
  );

  const offerOk = Boolean(spec.offer?.trim()) && types.has('OFFER');
  checks.push(
    check(
      'offer',
      'Offer',
      offerOk,
      offerOk ? 'Offer + node OFFER đã có' : 'Thiếu offer text hoặc node OFFER',
    ),
  );

  const followUpOk =
    (spec.followUp?.length ?? 0) >= 1 &&
    spec.followUp.some((f) => f.message?.trim() && f.delayMinutes >= 0);
  checks.push(
    check(
      'follow_up',
      'Follow-up',
      followUpOk,
      followUpOk
        ? `${spec.followUp.length} follow-up rule`
        : 'Cần ít nhất 1 follow-up với message',
    ),
  );

  const conversionOk =
    Boolean(spec.conversionGoal?.label?.trim()) &&
    Boolean(spec.conversionGoal?.primaryEvent) &&
    types.has('GOAL');
  checks.push(
    check(
      'conversion_goal',
      'Conversion goal',
      conversionOk,
      conversionOk
        ? `Goal: ${spec.conversionGoal.label}`
        : 'Thiếu conversionGoal hoặc node GOAL',
    ),
  );

  const trackingOk = hasTrackingSignals(spec);
  checks.push(
    check(
      'tracking',
      'Tracking',
      trackingOk,
      trackingOk
        ? 'Có KPI / meta tracking / GOAL node'
        : 'Thiếu tracking — thêm KPI, meta UTM trên node, hoặc GOAL',
      { severity: 'blocking', hint: 'Cấu hình ít nhất 2 KPI hoặc meta tracking trên LANDING/TRAFFIC' },
    ),
  );

  const pathOk = hasPathTrafficToGoal(spec);
  if (types.has('TRAFFIC') && types.has('GOAL')) {
    checks.push(
      check(
        'path_traffic_goal',
        'Luồng Traffic → Goal',
        pathOk,
        pathOk ? 'Có đường đi từ TRAFFIC tới GOAL' : 'Không có path TRAFFIC → GOAL',
        { severity: 'warning' },
      ),
    );
  }

  // Dimension scoring (rule-based, no invented KPI values)
  let offerScore = 0;
  if (spec.offer?.trim()) offerScore += 4;
  if (types.has('OFFER')) offerScore += 4;
  if (spec.offer.length >= 20) offerScore += 2;
  else dimIssues.offer.push('Offer nên mô tả rõ hơn (≥20 ký tự)');
  if (offerScore > DIMENSION_MAX.offer) offerScore = DIMENSION_MAX.offer;

  let audienceScore = 0;
  if (types.has('TRAFFIC')) audienceScore += 5;
  if (spec.strategy?.trim().length >= 40) audienceScore += 4;
  else dimIssues.audience.push('Strategy/audience chưa đủ chi tiết');
  if (types.has('RETARGET')) audienceScore += 3;
  if (audienceScore > DIMENSION_MAX.audience) audienceScore = DIMENSION_MAX.audience;

  let captureScore = 0;
  if (hasFormNode) captureScore += 4;
  if (hasPhone) captureScore += 5;
  if (spec.leadForm.fields.length >= 4) captureScore += 3;
  else dimIssues.capture.push('Form nên có ≥4 trường để qualify lead');
  if (types.has('LANDING')) captureScore += 2;
  if (captureScore > DIMENSION_MAX.capture) captureScore = DIMENSION_MAX.capture;

  let followUpScore = 0;
  if (spec.followUp.length >= 1) followUpScore += 6;
  if (spec.followUp.length >= 2) followUpScore += 3;
  if (spec.followUp.some((f) => f.channel === 'ZALO' || f.channel === 'SMS')) followUpScore += 3;
  if (followUpScore > DIMENSION_MAX.followUp) followUpScore = DIMENSION_MAX.followUp;
  if (followUpScore < 6) dimIssues.followUp.push('Thêm follow-up đa kênh');

  let automationScore = 0;
  const autoCount = (spec.automations?.length ?? 0) + spec.followUp.filter((f) => f.trigger).length;
  if (autoCount >= 1) automationScore += 5;
  if (autoCount >= 2) automationScore += 4;
  if (spec.automations?.some((a) => (a.actions?.length ?? 0) > 0)) automationScore += 5;
  else if (spec.automations?.length) dimIssues.automation.push('Automation thiếu actions');
  if (types.has('AUTOMATION')) automationScore += 2;
  if (automationScore > DIMENSION_MAX.automation) automationScore = DIMENSION_MAX.automation;

  let conversionScore = 0;
  if (conversionOk) conversionScore += 8;
  if (pathOk) conversionScore += 4;
  if (spec.stages.length >= 3) conversionScore += 2;
  else dimIssues.conversion.push('Pipeline nên có ≥3 stages');
  if (conversionScore > DIMENSION_MAX.conversion) conversionScore = DIMENSION_MAX.conversion;

  let remarketingScore = 0;
  if (spec.remarketing?.audiences?.length) remarketingScore += 5;
  if (spec.remarketing?.channels?.length) remarketingScore += 4;
  if (types.has('RETARGET')) remarketingScore += 2;
  if (remarketingScore > DIMENSION_MAX.remarketing) remarketingScore = DIMENSION_MAX.remarketing;
  if (remarketingScore < 5) dimIssues.remarketing.push('Cấu hình remarketing audiences');

  let trackingScore = 0;
  if (spec.kpis.length >= 2) trackingScore += 5;
  if (hasTrackingSignals(spec)) trackingScore += 4;
  if (chatbotReachable(spec)) trackingScore += 2;
  if (trackingScore > DIMENSION_MAX.tracking) trackingScore = DIMENSION_MAX.tracking;
  if (!trackingOk) dimIssues.tracking.push('Bổ sung KPI hoặc UTM meta');

  const dimensions: Record<FunnelScoreDimension, FunnelDimensionScore> = {
    offer: { score: offerScore, max: DIMENSION_MAX.offer, issues: dimIssues.offer },
    audience: { score: audienceScore, max: DIMENSION_MAX.audience, issues: dimIssues.audience },
    capture: { score: captureScore, max: DIMENSION_MAX.capture, issues: dimIssues.capture },
    followUp: { score: followUpScore, max: DIMENSION_MAX.followUp, issues: dimIssues.followUp },
    automation: { score: automationScore, max: DIMENSION_MAX.automation, issues: dimIssues.automation },
    conversion: { score: conversionScore, max: DIMENSION_MAX.conversion, issues: dimIssues.conversion },
    remarketing: { score: remarketingScore, max: DIMENSION_MAX.remarketing, issues: dimIssues.remarketing },
    tracking: { score: trackingScore, max: DIMENSION_MAX.tracking, issues: dimIssues.tracking },
  };

  const score = Object.values(dimensions).reduce((s, d) => s + d.score, 0);
  const blocking = checks.filter((c) => !c.passed && c.severity === 'blocking').map((c) => c.message);
  const warnings = checks.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.message);
  const ready = blocking.length === 0;
  const canActivate = ready && score >= FUNNEL_ACTIVATE_MIN_SCORE;

  return { ready, canActivate, score, dimensions, checks, blocking, warnings };
}

/** Lighter validation for blueprint apply (stages + flows) */
export function validateFunnelBlueprintDraft(draft: FunnelBlueprintDraft): FunnelValidatorResult {
  const checks: FunnelValidationCheck[] = [];
  const emptyDim = (): FunnelDimensionScore => ({ score: 0, max: 0, issues: [] });
  const dimensions = Object.fromEntries(
    FUNNEL_SCORE_DIMENSIONS.map((d) => [d, { ...emptyDim(), max: DIMENSION_MAX[d] }]),
  ) as Record<FunnelScoreDimension, FunnelDimensionScore>;

  checks.push(
    check(
      'stages',
      'Pipeline stages',
      draft.stages.length >= 2,
      draft.stages.length >= 2 ? `${draft.stages.length} stages` : 'Cần ít nhất 2 stages',
    ),
  );
  checks.push(
    check(
      'follow_up',
      'Automation flows',
      draft.flows.length >= 1,
      draft.flows.length >= 1 ? `${draft.flows.length} flows` : 'Cần ít nhất 1 automation flow',
    ),
  );
  const flowsWithActions = draft.flows.filter((f) => (f.actions?.length ?? 0) > 0).length;
  checks.push(
    check(
      'automation_actions',
      'Flow actions',
      flowsWithActions > 0,
      flowsWithActions > 0 ? 'Flows có actions' : 'Automation flows thiếu actions',
      { severity: 'warning' },
    ),
  );

  dimensions.automation.score = Math.min(
    DIMENSION_MAX.automation,
    (draft.flows.length >= 1 ? 6 : 0) +
      (draft.flows.length >= 2 ? 4 : 0) +
      (flowsWithActions > 0 ? 4 : 0),
  );
  dimensions.conversion.score = Math.min(
    DIMENSION_MAX.conversion,
    (draft.stages.length >= 2 ? 6 : 0) +
      (draft.stages.length >= 3 ? 6 : 0) +
      (draft.stages.some((s) => s.code === 'PURCHASED' || s.isWon) ? 2 : 0),
  );
  dimensions.capture.score = Math.min(
    DIMENSION_MAX.capture,
    (draft.stages.some((s) => s.code === 'NEW') ? 8 : 4) +
      (draft.flows.some((f) => f.triggerType === 'LEAD_CREATED') ? 4 : 0),
  );
  dimensions.followUp.score = Math.min(
    DIMENSION_MAX.followUp,
    (draft.flows.some((f) => (f.delayMinutes ?? 0) > 0) ? 8 : 0) +
      (draft.flows.length >= 2 ? 4 : 0),
  );
  dimensions.offer.score = Math.min(DIMENSION_MAX.offer, draft.summary?.trim() ? 8 : 4);
  dimensions.audience.score = Math.min(
    DIMENSION_MAX.audience,
    draft.industryHint?.trim() ? 8 : 4,
  );
  dimensions.remarketing.score = Math.min(
    DIMENSION_MAX.remarketing,
    draft.flows.some((f) => f.triggerType === 'CUSTOMER_INACTIVE' || f.triggerType === 'NO_SHOW')
      ? 8
      : 4,
  );
  dimensions.tracking.score = Math.min(
    DIMENSION_MAX.tracking,
    flowsWithActions > 0 ? 8 : draft.flows.length >= 1 ? 5 : 0,
  );

  const score = Object.values(dimensions).reduce((s, d) => s + d.score, 0);
  const blocking = checks.filter((c) => !c.passed && c.severity === 'blocking').map((c) => c.message);
  const warnings = checks.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.message);

  return {
    ready: blocking.length === 0,
    canActivate: blocking.length === 0 && score >= FUNNEL_ACTIVATE_MIN_SCORE,
    score,
    dimensions,
    checks,
    blocking,
    warnings,
  };
}

/** Rule-based explanation — no AI, no fabricated KPIs */
export function buildFunnelValidatorExplanation(result: FunnelValidatorResult): string {
  const lines: string[] = [];
  if (result.canActivate) {
    lines.push(`Funnel đạt ${result.score}/100 — sẵn sàng activate.`);
  } else {
    lines.push(`Funnel Score ${result.score}/100 — chưa đủ điều kiện activate (tối thiểu ${FUNNEL_ACTIVATE_MIN_SCORE}).`);
  }
  if (result.blocking.length) {
    lines.push('Cần sửa (blocking):');
    for (const b of result.blocking.slice(0, 6)) lines.push(`• ${b}`);
  }
  const weakDims = FUNNEL_SCORE_DIMENSIONS.filter(
    (d) => result.dimensions[d].score < result.dimensions[d].max * 0.6,
  );
  if (weakDims.length) {
    lines.push('Điểm yếu theo dimension:');
    for (const d of weakDims) {
      const dim = result.dimensions[d];
      lines.push(`• ${d}: ${dim.score}/${dim.max}${dim.issues[0] ? ` — ${dim.issues[0]}` : ''}`);
    }
  }
  lines.push('Lưu ý: Điểm số dựa trên cấu hình funnel, không phải KPI thực tế từ ads.');
  return lines.join('\n');
}

export const FUNNEL_DIMENSION_LABELS: Record<FunnelScoreDimension, string> = {
  offer: 'Offer',
  audience: 'Audience',
  capture: 'Capture',
  followUp: 'Follow-up',
  automation: 'Automation',
  conversion: 'Conversion',
  remarketing: 'Remarketing',
  tracking: 'Tracking',
};
