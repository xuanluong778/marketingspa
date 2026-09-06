/**
 * Planner V3 Grounded — Context → Diagnose → Strategy → NBA → Budget → Draft → Critic → Repair
 * Reuses V2 Zod schemas for LLM JSON; tags schemaVersion as v3 when grounded.
 */
import { z } from 'zod';
import {
  MARKETING_AUTOPILOT_PLANNER_V2_LIMITS,
  marketingAutopilotDiagnoseOutputSchema,
  marketingAutopilotPlannerV2OutputSchema,
  parseMarketingAutopilotDiagnoseOutput,
  parseMarketingAutopilotPlannerV2Output,
  runPlannerV2Critic,
  type MarketingAutopilotDiagnoseOutput,
  type MarketingAutopilotPlannerV2Output,
} from './marketing-autopilot-planner-v2';
import {
  marketingAutopilotConfidenceSchema,
  marketingAutopilotPlannerEvidenceSchema,
} from './marketing-autopilot-planner';

export const MARKETING_AUTOPILOT_PLANNER_V3_LIMITS = {
  ...MARKETING_AUTOPILOT_PLANNER_V2_LIMITS,
  timeoutMs: 60_000,
  maxTokensDiagnose: 1400,
  maxTokensBuild: 5500,
  maxTokensCriticRepair: 2200,
} as const;

export const PLANNER_V3_STEPS = [
  'context',
  'diagnose',
  'strategy',
  'nba',
  'budget',
  'draft',
  'critic',
  'repair',
] as const;

export type PlannerV3Step = (typeof PLANNER_V3_STEPS)[number];

/** V3 accepts v2 LLM payload or tagged v3; normalize to v2 shape for mapping. */
export const marketingAutopilotPlannerV3OutputSchema = marketingAutopilotPlannerV2OutputSchema
  .omit({ schemaVersion: true })
  .extend({
    schemaVersion: z.enum(['marketing-autopilot-planner.v2', 'marketing-autopilot-planner.v3']),
  });

export type MarketingAutopilotPlannerV3Output = z.infer<typeof marketingAutopilotPlannerV3OutputSchema>;

export function parseMarketingAutopilotPlannerV3Output(raw: unknown): MarketingAutopilotPlannerV3Output {
  const parsed = marketingAutopilotPlannerV3OutputSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Fallback: parse as V2 then retag
  const v2 = parseMarketingAutopilotPlannerV2Output(raw);
  return { ...v2, schemaVersion: 'marketing-autopilot-planner.v3' };
}

export function tagPlannerOutputAsV3(
  output: MarketingAutopilotPlannerV2Output | MarketingAutopilotPlannerV3Output,
): MarketingAutopilotPlannerV3Output {
  return { ...output, schemaVersion: 'marketing-autopilot-planner.v3' };
}

/**
 * Grounded critic: reject proposals that invent metrics or lack evidence/whyNow/confidence.
 */
export function runPlannerV3GroundedCritic(
  plan: MarketingAutopilotPlannerV3Output | MarketingAutopilotPlannerV2Output,
  userMonthlyBudget: number,
  metrics?: {
    leads?: { total?: number | null; noFollowUp?: number | null };
    conversion?: { leadToBookingRate?: number | null };
    ads?: { spend?: number | null; cpl?: number | null };
  } | null,
): { pass: boolean; issues: string[]; adjusted?: MarketingAutopilotPlannerV2Output } {
  let base: { pass: boolean; issues: string[]; adjusted?: MarketingAutopilotPlannerV2Output } = {
    pass: true,
    issues: [],
  };
  try {
    base = runPlannerV2Critic(
      plan as MarketingAutopilotPlannerV2Output,
      userMonthlyBudget,
      metrics ?? undefined,
    );
  } catch {
    base = { pass: false, issues: ['Plan structure incomplete for V2 critic'] };
  }
  const issues = [...base.issues];

  for (const action of plan.nextBestActions ?? []) {
    const rec = action.recommendation;
    if (!rec?.evidence?.trim()) issues.push(`NBA "${action.title ?? action.label}" thiếu evidence`);
    if (!action.whyNow?.trim() && !rec?.reason?.trim()) {
      issues.push(`NBA "${action.title ?? action.label}" thiếu whyNow`);
    }
    if (!rec?.confidence) issues.push(`NBA "${action.title ?? action.label}" thiếu confidence`);
  }

  const leads = metrics?.leads?.total ?? null;
  const spend = metrics?.ads?.spend ?? null;
  if ((leads == null || leads === 0) && (spend == null || spend === 0)) {
    const summary = plan.summary.toLowerCase();
    if (/roas\s*[=>]\s*\d|cpl\s*[=>]\s*\d|tăng\s+\d+%\s+booking/.test(summary)) {
      issues.push('Không được suy đoán số liệu ROAS/CPL/booking khi Context thiếu dữ liệu');
    }
  }

  const noFollowUp = metrics?.leads?.noFollowUp ?? 0;
  const total = metrics?.leads?.total ?? 0;
  const followUpBroken = noFollowUp > 0 && (total === 0 || noFollowUp / Math.max(total, 1) >= 0.2);
  const convLow =
    metrics?.conversion?.leadToBookingRate != null &&
    metrics.conversion.leadToBookingRate > 0 &&
    metrics.conversion.leadToBookingRate < 15;

  if (followUpBroken || convLow) {
    for (const action of plan.nextBestActions ?? []) {
      const text = `${action.title ?? ''} ${action.whyNow ?? ''} ${action.recommendation?.reason ?? ''}`.toLowerCase();
      if (/(scale|tăng)\s*ads|tăng ngân sách ads|boost ads/.test(text)) {
        issues.push('Không đề xuất scale Ads khi follow-up/funnel đang lỗi');
      }
    }
  }

  return {
    pass: issues.length === 0,
    issues: issues.slice(0, 12),
    adjusted: base.adjusted,
  };
}

export const groundedEvidenceSchema = marketingAutopilotPlannerEvidenceSchema.extend({
  whyNow: z.string().min(1).max(600).optional(),
  confidence: marketingAutopilotConfidenceSchema,
});

export {
  marketingAutopilotDiagnoseOutputSchema,
  parseMarketingAutopilotDiagnoseOutput,
  type MarketingAutopilotDiagnoseOutput,
};
