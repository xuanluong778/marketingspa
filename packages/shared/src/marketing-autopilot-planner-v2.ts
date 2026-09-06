import { z } from 'zod';
import {
  MARKETING_AUTOPILOT_DRAFT_TYPES,
  marketingAutopilotConfidenceSchema,
  marketingAutopilotPlannerEvidenceSchema,
  marketingAutopilotRiskLevelSchema,
} from './marketing-autopilot-planner';

export const MARKETING_AUTOPILOT_PLANNER_V2_LIMITS = {
  timeoutMs: 55_000,
  maxLlmRetries: 1,
  maxTokensDiagnose: 1200,
  maxTokensBuild: 5000,
  maxTokensCriticRepair: 2000,
} as const;

const section = <T extends z.ZodTypeAny>(content: T) =>
  z.object({
    content,
    recommendation: marketingAutopilotPlannerEvidenceSchema,
  });

export const marketingAutopilotDiagnoseOutputSchema = z.object({
  step: z.literal('diagnose'),
  bottlenecks: z.array(z.string().min(1).max(300)).max(8),
  strengths: z.array(z.string().min(1).max(300)).max(8),
  opportunities: z.array(z.string().min(1).max(300)).max(8),
  dataGaps: z.array(z.string().min(1).max(300)).max(8),
  priorityFocus: z.string().min(1).max(600),
  recommendation: marketingAutopilotPlannerEvidenceSchema,
});

export type MarketingAutopilotDiagnoseOutput = z.infer<typeof marketingAutopilotDiagnoseOutputSchema>;

export const marketingAutopilotPlannerV2OutputSchema = z.object({
  schemaVersion: z.literal('marketing-autopilot-planner.v2'),
  summary: z.string().min(1).max(2500),
  score: z.number().min(0).max(100),
  suggestedChannels: z.array(z.string().min(1).max(64)).min(1).max(10),
  risks: z.array(z.string().max(400)).max(12),
  nextSteps: z.array(z.string().max(400)).max(15),
  budgetSplit: z
    .array(z.object({ channel: z.string().min(1).max(64), percent: z.number().min(0).max(100) }))
    .min(1)
    .max(8),
  businessDiagnosis: section(
    z.object({
      bottlenecks: z.array(z.string().min(1).max(300)).max(8),
      strengths: z.array(z.string().min(1).max(300)).max(8),
      opportunities: z.array(z.string().min(1).max(300)).max(8),
    }),
  ),
  icpProfiles: section(
    z.object({
      profiles: z
        .array(
          z.object({
            name: z.string().min(1).max(120),
            description: z.string().min(1).max(400),
            priority: z.number().int().min(1).max(3),
          }),
        )
        .min(1)
        .max(3),
    }),
  ),
  offer: section(
    z.object({
      productName: z.string().min(1).max(160),
      productPrice: z.number().finite().min(0),
      valueProps: z.array(z.string().min(1).max(240)).min(1).max(8),
      valueProposition: z.string().min(1).max(600),
    }),
  ),
  goal: section(z.object({ primaryGoal: z.string().min(1).max(400) })),
  funnel: section(
    z.object({
      stages: z
        .array(z.object({ name: z.string().min(1).max(80), objective: z.string().min(1).max(300) }))
        .min(2)
        .max(8),
    }),
  ),
  content: section(
    z.object({
      channels: z.array(z.string().min(1).max(64)).min(1).max(8),
      themes: z.array(z.string().min(1).max(240)).min(1).max(8),
      formats: z.array(z.string().min(1).max(64)).min(1).max(10),
      pillars: z.array(z.string().min(1).max(240)).min(1).max(6),
    }),
  ),
  channelStrategy: section(
    z.object({
      channels: z
        .array(
          z.object({
            channel: z.string().min(1).max(64),
            role: z.string().min(1).max(240),
            budgetSharePercent: z.number().min(0).max(100),
          }),
        )
        .min(1)
        .max(8),
    }),
  ),
  ads: section(
    z.object({
      strategy: z.string().min(1).max(800),
      budgetSharePercent: z.number().min(0).max(100),
    }),
  ),
  crm: section(
    z.object({
      leadScoring: z.string().min(1).max(400),
      lifecycle: z.array(z.string().min(1).max(80)).min(2).max(8),
      segmentation: z.array(z.string().min(1).max(120)).min(1).max(8),
      followUpPlaybook: z.array(z.string().min(1).max(240)).min(1).max(8),
    }),
  ),
  followUp: section(
    z.object({
      cadence: z.string().min(1).max(300),
      channels: z.array(z.string().min(1).max(64)).min(1).max(6),
      playbook: z.array(z.string().min(1).max(240)).min(1).max(8),
    }),
  ),
  remarketing: section(
    z.object({
      audiences: z.array(z.string().min(1).max(200)).min(1).max(8),
      cadence: z.string().min(1).max(300),
      messageTheme: z.string().min(1).max(400),
    }),
  ),
  kpi: section(
    z.object({
      kpis: z
        .array(
          z.object({
            name: z.string().min(1).max(80),
            baseline: z.number().finite().nullable(),
            target: z.number().finite(),
            unit: z.string().min(1).max(24),
          }),
        )
        .min(1)
        .max(10),
    }),
  ),
  budget: section(
    z.object({
      monthlyBudget: z.number().finite().min(0),
      split: z
        .array(z.object({ channel: z.string().min(1).max(64), percent: z.number().min(0).max(100) }))
        .min(1)
        .max(8),
    }),
  ),
  timeline: section(
    z.object({
      days30: z.array(z.string().min(1).max(300)).min(1).max(8),
      days60: z.array(z.string().min(1).max(300)).min(1).max(8),
      days90: z.array(z.string().min(1).max(300)).min(1).max(8),
      phases: z
        .array(
          z.object({
            phase: z.string().min(1).max(80),
            focus: z.string().min(1).max(300),
            durationWeeks: z.number().int().min(1).max(12),
          }),
        )
        .min(2)
        .max(6),
    }),
  ),
  assumptions: section(
    z.object({
      items: z.array(z.string().min(1).max(400)).min(1).max(10),
    }),
  ),
  nextBestActions: z
    .array(
      z.object({
        type: z.enum(MARKETING_AUTOPILOT_DRAFT_TYPES),
        label: z.string().min(1).max(120),
        priority: z.number().int().min(1).max(5).optional(),
        title: z.string().min(1).max(160).optional(),
        whyNow: z.string().min(1).max(600).optional(),
        estimatedCost: z.number().finite().min(0).nullable().optional(),
        recommendedDraft: z.enum(MARKETING_AUTOPILOT_DRAFT_TYPES).optional(),
        recommendation: marketingAutopilotPlannerEvidenceSchema,
      }),
    )
    .min(1)
    .max(5),
  safety: z.object({ policy: z.literal('READ_ONLY') }),
  criticNotes: z.array(z.string().max(400)).max(8).optional(),
});

export type MarketingAutopilotPlannerV2Output = z.infer<typeof marketingAutopilotPlannerV2OutputSchema>;

export type PlannerV2ContextMetrics = {
  leads?: { total?: number | null; noFollowUp?: number | null; hot?: number | null };
  conversion?: { leadToBookingRate?: number | null };
  ads?: { spend?: number | null; roas?: number | null; cpl?: number | null };
};

export type PlannerV2CriticResult = {
  pass: boolean;
  issues: string[];
  adjusted?: MarketingAutopilotPlannerV2Output;
};

export function parseMarketingAutopilotDiagnoseOutput(raw: unknown): MarketingAutopilotDiagnoseOutput {
  return marketingAutopilotDiagnoseOutputSchema.parse(raw);
}

export function parseMarketingAutopilotPlannerV2Output(raw: unknown): MarketingAutopilotPlannerV2Output {
  return marketingAutopilotPlannerV2OutputSchema.parse(raw);
}

function sumPercent(items: Array<{ percent?: number; budgetSharePercent?: number }>): number {
  return items.reduce((acc, x) => acc + (x.percent ?? x.budgetSharePercent ?? 0), 0);
}

export function runPlannerV2Critic(
  plan: MarketingAutopilotPlannerV2Output,
  userMonthlyBudget: number,
  metrics?: PlannerV2ContextMetrics,
): PlannerV2CriticResult {
  const issues: string[] = [];
  const budgetSplitSum = sumPercent(plan.budgetSplit);
  const budgetContentSum = sumPercent(plan.budget.content.split);
  const channelSum = sumPercent(plan.channelStrategy.content.channels);

  if (Math.abs(budgetSplitSum - 100) > 2) {
    issues.push(`budgetSplit tổng ${budgetSplitSum}% ≠ 100%`);
  }
  if (Math.abs(budgetContentSum - 100) > 2) {
    issues.push(`budget.content.split tổng ${budgetContentSum}% ≠ 100%`);
  }
  if (Math.abs(channelSum - 100) > 2) {
    issues.push(`channelStrategy tổng ${channelSum}% ≠ 100%`);
  }
  if (userMonthlyBudget > 0 && Math.abs(plan.budget.content.monthlyBudget - userMonthlyBudget) > userMonthlyBudget * 0.05) {
    issues.push(
      `monthlyBudget ${plan.budget.content.monthlyBudget} không khớp user input ${userMonthlyBudget}`,
    );
  }

  for (const k of plan.kpi.content.kpis) {
    if (k.baseline != null && k.target < k.baseline) {
      issues.push(`KPI ${k.name}: target ${k.target} < baseline ${k.baseline}`);
    }
  }

  const noFollowUp = metrics?.leads?.noFollowUp ?? 0;
  const totalLeads = metrics?.leads?.total ?? 0;
  const convRate = metrics?.conversion?.leadToBookingRate ?? null;
  const followUpBottleneck =
    noFollowUp > 0 && (totalLeads === 0 || noFollowUp / Math.max(totalLeads, 1) >= 0.2);
  const conversionBottleneck = convRate != null && convRate > 0 && convRate < 15;

  const adsShare = plan.ads.content.budgetSharePercent;
  const adsScaleLanguage = /scale|tăng ngân sách|tang ngan sach|mở rộng ads|mo rong ads/i.test(
    plan.ads.content.strategy,
  );

  if ((followUpBottleneck || conversionBottleneck) && (adsShare > 35 || adsScaleLanguage)) {
    issues.push('Bottleneck follow-up/conversion — không nên scale Ads mạnh');
  }

  let adjusted = plan;
  if (issues.length > 0 && (followUpBottleneck || conversionBottleneck) && adsShare > 35) {
    adjusted = {
      ...plan,
      ads: {
        ...plan.ads,
        content: {
          ...plan.ads.content,
          budgetSharePercent: Math.min(adsShare, 25),
          strategy: plan.ads.content.strategy.replace(/scale|tăng ngân sách/gi, 'giữ ổn định'),
        },
        recommendation: {
          ...plan.ads.recommendation,
          reason: 'Critic: ưu tiên follow-up/conversion trước khi scale Ads',
          confidence:
            plan.ads.recommendation.confidence === 'INSUFFICIENT_DATA'
              ? 'INSUFFICIENT_DATA'
              : 'MEDIUM',
        },
      },
      criticNotes: [...(plan.criticNotes ?? []), ...issues],
    };
  }

  const critical = issues.filter((i) => !i.startsWith('Bottleneck'));
  return {
    pass: critical.length === 0,
    issues,
    adjusted: issues.length ? adjusted : plan,
  };
}
