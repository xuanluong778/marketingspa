import { z } from 'zod';

export const MARKETING_AUTOPILOT_PLANNER_LIMITS = {
  timeoutMs: 45_000,
  maxLlmRetries: 1,
  maxUserFieldLength: 2000,
  maxTokens: 4000,
} as const;

export const MARKETING_AUTOPILOT_DRAFT_TYPES = [
  'CONTENT_DRAFT',
  'FUNNEL_DRAFT',
  'AUTOMATION_DRAFT',
  'CAMPAIGN_DRAFT',
] as const;

export const marketingAutopilotConfidenceSchema = z.enum([
  'HIGH',
  'MEDIUM',
  'LOW',
  'INSUFFICIENT_DATA',
]);

export const marketingAutopilotRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

/** Evidence-backed recommendation — required on every section and nextBestAction. */
export const marketingAutopilotPlannerEvidenceSchema = z.object({
  reason: z.string().min(1).max(600),
  evidence: z.string().min(1).max(600),
  source: z.string().min(1).max(128),
  confidence: marketingAutopilotConfidenceSchema,
  expectedImpact: z.string().min(1).max(400),
  riskLevel: marketingAutopilotRiskLevelSchema,
});

export type MarketingAutopilotPlannerEvidence = z.infer<
  typeof marketingAutopilotPlannerEvidenceSchema
>;

const section = <T extends z.ZodTypeAny>(content: T) =>
  z.object({
    content: content,
    recommendation: marketingAutopilotPlannerEvidenceSchema,
  });

export const marketingAutopilotPlannerOutputSchema = z.object({
  schemaVersion: z.literal('marketing-autopilot-planner.v1'),
  summary: z.string().min(1).max(2000),
  score: z.number().min(0).max(100),
  suggestedChannels: z.array(z.string().min(1).max(64)).min(1).max(10),
  risks: z.array(z.string().max(400)).max(12),
  nextSteps: z.array(z.string().max(400)).max(15),
  budgetSplit: z
    .array(
      z.object({
        channel: z.string().min(1).max(64),
        percent: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(8),
  goal: section(
    z.object({
      primaryGoal: z.string().min(1).max(400),
    }),
  ),
  icp: section(
    z.object({
      targetProfile: z.string().min(1).max(600),
      personas: z.array(z.string().min(1).max(200)).min(1).max(6),
      targetArea: z.string().min(1).max(300),
    }),
  ),
  offer: section(
    z.object({
      productName: z.string().min(1).max(160),
      productPrice: z.number().finite().min(0),
      valueProps: z.array(z.string().min(1).max(240)).min(1).max(8),
    }),
  ),
  funnel: section(
    z.object({
      stages: z
        .array(
          z.object({
            name: z.string().min(1).max(80),
            objective: z.string().min(1).max(300),
          }),
        )
        .min(2)
        .max(8),
    }),
  ),
  content: section(
    z.object({
      channels: z.array(z.string().min(1).max(64)).min(1).max(8),
      themes: z.array(z.string().min(1).max(240)).min(1).max(8),
      formats: z.array(z.string().min(1).max(64)).min(1).max(10),
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
    }),
  ),
  chatbot: section(
    z.object({
      purpose: z.string().min(1).max(400),
      keyFlows: z.array(z.string().min(1).max(240)).min(1).max(8),
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
            target: z.number().finite(),
            unit: z.string().min(1).max(24),
          }),
        )
        .min(1)
        .max(8),
    }),
  ),
  budget: section(
    z.object({
      monthlyBudget: z.number().finite().min(0),
      split: z
        .array(
          z.object({
            channel: z.string().min(1).max(64),
            percent: z.number().min(0).max(100),
          }),
        )
        .min(1)
        .max(8),
    }),
  ),
  timeline: section(
    z.object({
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
  nextBestActions: z
    .array(
      z.object({
        type: z.enum(MARKETING_AUTOPILOT_DRAFT_TYPES),
        label: z.string().min(1).max(120),
        recommendation: marketingAutopilotPlannerEvidenceSchema,
      }),
    )
    .min(1)
    .max(6),
  safety: z.object({
    policy: z.literal('READ_ONLY'),
  }),
});

export type MarketingAutopilotPlannerOutput = z.infer<
  typeof marketingAutopilotPlannerOutputSchema
>;

export function parseMarketingAutopilotPlannerOutput(raw: unknown): MarketingAutopilotPlannerOutput {
  return marketingAutopilotPlannerOutputSchema.parse(raw);
}

/** Strip prompt-injection patterns from user brief fields before LLM. */
export function sanitizeMarketingAutopilotUserText(input: string, max = 2000): string {
  let s = String(input ?? '').slice(0, max);
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(
    /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+instructions?\b/gi,
    '[redacted]',
  );
  s = s.replace(/\b(system|developer|assistant)\s*:/gi, '');
  s = s.replace(/jailbreak|bypass\s+schema|override\s+schema/gi, '[redacted]');
  s = s.replace(/"schemaVersion"\s*:/gi, '"_ignored":');
  s = s.replace(/\b(SEND_EMAIL|FACEBOOK_PUBLISH|ENABLE_ADS|DELETE_DATA|ACCESS_TOKEN)\b/gi, '[blocked-action]');
  s = s.replace(/mode\s*[:=]\s*["']?(live|published|active)["']?/gi, 'mode draft');
  return s.replace(/\s+/g, ' ').trim();
}

export function sanitizeMarketingAutopilotUserInput(input: {
  projectName?: string;
  productName: string;
  productPrice: number;
  customerProfile: string;
  targetArea: string;
  monthlyBudget: number;
  primaryGoal: string;
}) {
  return {
    projectName: input.projectName
      ? sanitizeMarketingAutopilotUserText(input.projectName, 120)
      : undefined,
    productName: sanitizeMarketingAutopilotUserText(input.productName, 160),
    productPrice: Number(input.productPrice) || 0,
    customerProfile: sanitizeMarketingAutopilotUserText(input.customerProfile, 600),
    targetArea: sanitizeMarketingAutopilotUserText(input.targetArea, 300),
    monthlyBudget: Number(input.monthlyBudget) || 0,
    primaryGoal: sanitizeMarketingAutopilotUserText(input.primaryGoal, 400),
  };
}

export function extractMarketingAutopilotPlannerJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error('AI response is not JSON');
}
