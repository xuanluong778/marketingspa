import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiService } from '../openai/openai.service';
import {
  MARKETING_AUTOPILOT_PLANNER_V3_LIMITS,
  extractMarketingAutopilotPlannerJson,
  parseMarketingAutopilotDiagnoseOutput,
  parseMarketingAutopilotPlannerV3Output,
  rankNextBestActionsV3,
  runPlannerV3GroundedCritic,
  sanitizeMarketingAutopilotUserInput,
  pickBudgetSimSource,
  simulateBudgetScenarios,
  tagPlannerOutputAsV3,
  type MarketingAutopilotPlannerV3Output,
} from '@marketingspa/shared';
import type { CreateMarketingAutopilotProjectDto } from './dto/marketing-autopilot.dto';
import { redactMarketingContextSnapshot } from './context/marketing-context-redaction.util';
import type { MarketingContextSnapshotPayload } from './context/marketing-context.types';
import type { AutopilotAnalysis } from './marketing-autopilot.types';
import { buildContextPriorityHints } from './marketing-autopilot-planner.prompt';
import {
  buildCriticRepairSystemPrompt,
  buildDiagnoseSystemPrompt,
  buildPlannerPayloadMessage,
  buildStrategySystemPrompt,
} from './marketing-autopilot-planner-v3.prompt';

export type PlannerResult = {
  analysis: AutopilotAnalysis;
  engine: 'strategy-planner-v3' | 'strategy-planner-v2' | 'heuristic-orchestrator';
};

@Injectable()
export class MarketingAutopilotPlannerService {
  private readonly logger = new Logger(MarketingAutopilotPlannerService.name);

  constructor(
    private readonly openai: OpenAiService,
    private readonly config: ConfigService,
  ) {}

  getPlannerModel(): string {
    return (
      this.config.get<string>('MARKETING_AUTOPILOT_PLANNER_MODEL')?.trim() ||
      this.openai.getDefaultModel()
    );
  }

  async plan(
    input: CreateMarketingAutopilotProjectDto,
    context: {
      snapshot: MarketingContextSnapshotPayload;
      snapshotId?: string | null;
      businessLearnings?: {
        disclaimer?: string;
        learnings?: Array<Record<string, unknown>>;
      } | null;
    },
    heuristicFallback: () => AutopilotAnalysis,
  ): Promise<PlannerResult> {
    const started = Date.now();
    const contextUsed = this.buildContextUsed(context);
    const model = this.getPlannerModel();

    if (!this.openai.isConfigured()) {
      return {
        analysis: {
          ...heuristicFallback(),
          contextUsed,
          plannerMeta: {
            engine: 'heuristic-orchestrator',
            usedLlm: false,
            model: null,
            fallbackReason: 'OPENAI_NOT_CONFIGURED',
            latencyMs: Date.now() - started,
            plannerSteps: [],
            criticPassed: null,
          },
        },
        engine: 'heuristic-orchestrator',
      };
    }

    try {
      const { output, criticPassed, steps } = await this.runStrategyPlannerV3(
        input,
        context.snapshot,
        context.businessLearnings ?? null,
      );
      const safeInput = sanitizeMarketingAutopilotUserInput(input);
      const analysis = this.toAutopilotAnalysisV3(
        output,
        contextUsed,
        {
          engine: 'strategy-planner-v3',
          usedLlm: true,
          model,
          schemaVersion: output.schemaVersion,
          latencyMs: Date.now() - started,
          plannerSteps: steps,
          criticPassed,
        },
        {
          targetArea: safeInput.targetArea,
          metrics: context.snapshot.metrics,
          insights: context.snapshot.insights,
          bottlenecks: context.snapshot.bottlenecks,
          opportunities: context.snapshot.opportunities,
          timeRange: context.snapshot.timeRange,
          windows: context.snapshot.windows,
          organizationId: context.snapshot.organizationId,
          monthlyBudget: Number(safeInput.monthlyBudget) || output.budget.content.monthlyBudget,
          productPrice: Number(safeInput.productPrice) || output.offer.content.productPrice,
          primaryGoal: safeInput.primaryGoal || output.goal.content.primaryGoal,
        },
      );
      return { analysis, engine: 'strategy-planner-v3' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Strategy Planner V3 failed, falling back to heuristic: ${message}`);
      return {
        analysis: {
          ...heuristicFallback(),
          contextUsed,
          plannerMeta: {
            engine: 'heuristic-orchestrator',
            usedLlm: false,
            model,
            fallbackReason: message.slice(0, 240),
            latencyMs: Date.now() - started,
            plannerSteps: [],
            criticPassed: false,
          },
        },
        engine: 'heuristic-orchestrator',
      };
    }
  }

  /** @deprecated use toAutopilotAnalysisV3 — kept for legacy tests */
  toAutopilotAnalysis(
    output: MarketingAutopilotPlannerV3Output,
    contextUsed: AutopilotAnalysis['contextUsed'],
    plannerMeta: NonNullable<AutopilotAnalysis['plannerMeta']>,
  ): AutopilotAnalysis {
    return this.toAutopilotAnalysisV3(output, contextUsed, plannerMeta, {});
  }

  /** @deprecated alias */
  toAutopilotAnalysisV2(
    output: MarketingAutopilotPlannerV3Output,
    contextUsed: AutopilotAnalysis['contextUsed'],
    plannerMeta: NonNullable<AutopilotAnalysis['plannerMeta']>,
    opts: Parameters<MarketingAutopilotPlannerService['toAutopilotAnalysisV3']>[3] = {},
  ): AutopilotAnalysis {
    return this.toAutopilotAnalysisV3(output, contextUsed, plannerMeta, opts);
  }

  toAutopilotAnalysisV3(
    output: MarketingAutopilotPlannerV3Output,
    contextUsed: AutopilotAnalysis['contextUsed'],
    plannerMeta: NonNullable<AutopilotAnalysis['plannerMeta']>,
    opts: {
      targetArea?: string;
      metrics?: MarketingContextSnapshotPayload['metrics'];
      insights?: MarketingContextSnapshotPayload['insights'];
      bottlenecks?: MarketingContextSnapshotPayload['bottlenecks'];
      opportunities?: MarketingContextSnapshotPayload['opportunities'];
      timeRange?: MarketingContextSnapshotPayload['timeRange'] | null;
      windows?: MarketingContextSnapshotPayload['windows'];
      organizationId?: string;
      monthlyBudget?: number;
      productPrice?: number;
      primaryGoal?: string;
    } = {},
  ): AutopilotAnalysis {
    const targetArea = opts.targetArea ?? '';
    const primaryIcp =
      [...output.icpProfiles.content.profiles].sort((a, b) => a.priority - b.priority)[0] ??
      output.icpProfiles.content.profiles[0] ?? {
        name: 'Khách mục tiêu',
        description: output.goal.content.primaryGoal,
        priority: 1,
      };
    const playbook = output.followUp.content.playbook;
    const comms = {
      email: playbook.filter((p) => /email/i.test(p)).slice(0, 3),
      messenger: playbook.filter((p) => /messenger|zalo/i.test(p)).slice(0, 3),
      zalo: playbook.filter((p) => /zalo/i.test(p)).slice(0, 3),
    };
    if (!comms.email.length) comms.email = ['Chuỗi email chăm sóc theo followUp playbook'];
    if (!comms.messenger.length) comms.messenger = ['Kịch bản Messenger theo followUp'];
    if (!comms.zalo.length) comms.zalo = ['Chuỗi Zalo theo followUp'];

    const rankedNba = rankNextBestActionsV3({
      organizationId: opts.organizationId,
      metrics: opts.metrics,
      insights: opts.insights,
      bottlenecks: opts.bottlenecks,
      opportunities: opts.opportunities,
      timeRange: opts.timeRange ?? null,
      monthlyBudget: opts.monthlyBudget ?? output.budget.content.monthlyBudget,
      primaryGoal: opts.primaryGoal ?? output.goal.content.primaryGoal,
      safety: { draftOnly: true },
      candidates: output.nextBestActions.map((a) => ({
        type: a.type,
        label: a.label,
        title: a.title ?? a.label,
        whyNow: a.whyNow ?? a.recommendation.reason,
        evidence: a.recommendation.evidence,
        confidence: a.recommendation.confidence,
        expectedImpact: a.recommendation.expectedImpact,
        estimatedCost: a.estimatedCost ?? null,
        riskLevel: a.recommendation.riskLevel,
        recommendedDraft: a.recommendedDraft ?? a.type,
        priority: a.priority,
        rationale: a.recommendation.reason,
      })),
    });

    const productPrice = opts.productPrice ?? output.offer.content.productPrice;
    const simSource = pickBudgetSimSource({
      metrics: opts.metrics,
      timeRange: opts.timeRange ?? null,
      windows: opts.windows,
      productPrice,
    });
    const budgetScenarios = simulateBudgetScenarios({
      metrics: simSource.metrics,
      productPrice,
      customBudget: opts.monthlyBudget ?? output.budget.content.monthlyBudget,
      timeRange: simSource.timeRange ?? null,
    });

    return {
      summary: output.summary,
      score: output.score,
      suggestedChannels: output.suggestedChannels,
      risks: output.risks,
      nextSteps: output.nextSteps,
      budgetSplit: output.budgetSplit,
      plan: {
        customersTarget: {
          targetProfile: primaryIcp.description,
          personas: output.icpProfiles.content.profiles.map((p) => p.name),
          targetArea: targetArea || primaryIcp.description,
        },
        customerProfile: primaryIcp.description,
        offer: {
          productName: output.offer.content.productName,
          productPrice: output.offer.content.productPrice,
          primaryGoal: output.goal.content.primaryGoal,
          valueProps: output.offer.content.valueProps,
        },
        funnel: { stages: output.funnel.content.stages },
        content: {
          channels: output.content.content.channels,
          themes: output.content.content.themes,
          formats: output.content.content.formats,
        },
        ads: {
          strategy: output.ads.content.strategy,
          budgetSharePercent: output.ads.content.budgetSharePercent,
        },
        crm: {
          leadScoring: output.crm.content.leadScoring,
          lifecycle: output.crm.content.lifecycle,
          segmentation: output.crm.content.segmentation,
        },
        chatbot: {
          purpose: 'Tư vấn & thu lead',
          keyFlows: (output.crm.content.followUpPlaybook ?? playbook).slice(0, 4),
        },
        communications: comms,
        emailMessengerZalo: comms,
        remarketing: {
          audiences: output.remarketing.content.audiences,
          cadence: output.remarketing.content.cadence,
          messageTheme: output.remarketing.content.messageTheme,
        },
        kpi: {
          kpis: output.kpi.content.kpis.map((k) => ({
            name: k.name,
            target: k.target,
            unit: k.unit,
          })),
        },
        budget: {
          monthlyBudget: output.budget.content.monthlyBudget,
          split: output.budget.content.split,
        },
        timeline: { phases: output.timeline.content.phases },
        businessDiagnosis: output.businessDiagnosis.content,
        icpProfiles: output.icpProfiles.content.profiles,
        channelStrategy: output.channelStrategy.content.channels,
        valueProposition: output.offer.content.valueProposition,
        timeline306090: {
          days30: output.timeline.content.days30,
          days60: output.timeline.content.days60,
          days90: output.timeline.content.days90,
        },
      },
      nextBestActions: rankedNba.map((a) => ({
        type: a.type,
        label: a.label ?? a.title,
        rationale: a.whyNow,
        evidence: {
          reason: a.whyNow,
          evidence: a.evidence,
          source: 'nba-engine-v3',
          confidence: a.confidence,
          expectedImpact: a.expectedImpact,
          riskLevel: a.riskLevel,
        },
        priority: a.priority,
        title: a.title,
        whyNow: a.whyNow,
        confidence: a.confidence,
        expectedImpact: a.expectedImpact,
        estimatedCost: a.estimatedCost,
        riskLevel: a.riskLevel,
        recommendedDraft: a.recommendedDraft,
        evidenceText: a.evidence,
      })),
      budgetScenarios,
      nbaEngine: {
        version: 'v3',
        rankedAt: new Date().toISOString(),
        maxActions: 5,
      },
      sectionRecommendations: {
        goal: output.goal.recommendation,
        icp: output.icpProfiles.recommendation,
        offer: output.offer.recommendation,
        funnel: output.funnel.recommendation,
        content: output.content.recommendation,
        ads: output.ads.recommendation,
        crm: output.crm.recommendation,
        followUp: output.followUp.recommendation,
        remarketing: output.remarketing.recommendation,
        kpi: output.kpi.recommendation,
        budget: output.budget.recommendation,
        timeline: output.timeline.recommendation,
        businessDiagnosis: output.businessDiagnosis.recommendation,
        icpProfiles: output.icpProfiles.recommendation,
        channelStrategy: output.channelStrategy.recommendation,
        assumptions: output.assumptions.recommendation,
      },
      strategyV2: {
        businessDiagnosis: output.businessDiagnosis.content,
        icpProfiles: output.icpProfiles.content.profiles,
        channelStrategy: output.channelStrategy.content.channels,
        assumptions: output.assumptions.content.items,
        timeline306090: {
          days30: output.timeline.content.days30,
          days60: output.timeline.content.days60,
          days90: output.timeline.content.days90,
        },
      },
      contextUsed,
      plannerMeta,
      safety: {
        policy: 'READ_ONLY',
        highRiskActionSuggestionsBlocked: [],
      },
    };
  }

  private buildContextUsed(context: {
    snapshot: MarketingContextSnapshotPayload;
    snapshotId?: string | null;
  }): AutopilotAnalysis['contextUsed'] {
    const ctx = context.snapshot;
    return {
      snapshotId: context.snapshotId ?? null,
      generatedAt: ctx.generatedAt,
      insightCount: ctx.insights.length,
      topInsights: ctx.insights.slice(0, 5).map((i) => ({
        title: i.title,
        evidence: i.evidence,
        confidence: i.confidence,
      })),
    };
  }

  private async runStrategyPlannerV3(
    input: CreateMarketingAutopilotProjectDto,
    snapshot: MarketingContextSnapshotPayload,
    businessLearnings?: {
      disclaimer?: string;
      learnings?: Array<Record<string, unknown>>;
    } | null,
  ): Promise<{
    output: MarketingAutopilotPlannerV3Output;
    criticPassed: boolean;
    steps: Array<'context' | 'diagnose' | 'strategy' | 'nba' | 'budget' | 'draft' | 'critic' | 'repair'>;
  }> {
    const safeInput = sanitizeMarketingAutopilotUserInput(input);
    const safeContext = redactMarketingContextSnapshot(snapshot) as MarketingContextSnapshotPayload;
    const priorityHints = buildContextPriorityHints(safeContext);
    const steps: Array<'context' | 'diagnose' | 'strategy' | 'nba' | 'budget' | 'draft' | 'critic' | 'repair'> = [
      'context',
    ];
    const payloadBase = {
      userInput: safeInput as Record<string, unknown>,
      contextSnapshot: {
        organizationId: safeContext.organizationId,
        generatedAt: safeContext.generatedAt,
        engineVersion: safeContext.engineVersion,
        timeRange: safeContext.timeRange,
        metrics: safeContext.metrics,
        insights: safeContext.insights,
        sources: safeContext.sources,
        windows: safeContext.windows?.map((w) => ({
          days: w.days,
          timeRange: w.timeRange,
          metrics: w.metrics,
        })),
        bottlenecks: safeContext.bottlenecks ?? [],
        opportunities: safeContext.opportunities ?? [],
      },
      priorityHints,
      businessLearnings: businessLearnings ?? null,
    };

    const diagnosis = await this.callJsonStep(
      buildDiagnoseSystemPrompt(),
      buildPlannerPayloadMessage(payloadBase),
      MARKETING_AUTOPILOT_PLANNER_V3_LIMITS.maxTokensDiagnose,
      parseMarketingAutopilotDiagnoseOutput,
    );
    steps.push('diagnose');

    let plan = tagPlannerOutputAsV3(
      await this.callJsonStep(
        buildStrategySystemPrompt(),
        buildPlannerPayloadMessage({ ...payloadBase, diagnosis }),
        MARKETING_AUTOPILOT_PLANNER_V3_LIMITS.maxTokensBuild,
        parseMarketingAutopilotPlannerV3Output,
      ),
    );
    steps.push('strategy', 'nba', 'budget', 'draft');

    let critic = runPlannerV3GroundedCritic(plan, safeInput.monthlyBudget, safeContext.metrics);

    if (!critic.pass && critic.issues.length) {
      steps.push('critic', 'repair');
      try {
        plan = tagPlannerOutputAsV3(
          await this.callJsonStep(
            buildCriticRepairSystemPrompt(),
            buildPlannerPayloadMessage({
              ...payloadBase,
              diagnosis,
              criticIssues: critic.issues,
            }) + `\n\n## Current plan JSON\n${JSON.stringify(critic.adjusted ?? plan)}`,
            MARKETING_AUTOPILOT_PLANNER_V3_LIMITS.maxTokensCriticRepair,
            parseMarketingAutopilotPlannerV3Output,
          ),
        );
        critic = runPlannerV3GroundedCritic(plan, safeInput.monthlyBudget, safeContext.metrics);
      } catch (repairErr) {
        if (critic.adjusted) {
          plan = tagPlannerOutputAsV3(critic.adjusted);
          critic = runPlannerV3GroundedCritic(plan, safeInput.monthlyBudget, safeContext.metrics);
        } else {
          throw repairErr;
        }
      }
    } else {
      steps.push('critic');
      if (critic.adjusted) plan = tagPlannerOutputAsV3(critic.adjusted);
    }

    if (!critic.pass) {
      throw new Error(`Critic validation failed: ${critic.issues.join('; ')}`);
    }

    return { output: plan, criticPassed: true, steps };
  }

  private async callJsonStep<T>(
    system: string,
    user: string,
    maxTokens: number,
    parser: (raw: unknown) => T,
  ): Promise<T> {
    const attempts = 1 + MARKETING_AUTOPILOT_PLANNER_V3_LIMITS.maxLlmRetries;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const raw = await this.openai.chatCompletion({
          model: this.getPlannerModel(),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.3,
          maxTokens,
          timeoutMs: MARKETING_AUTOPILOT_PLANNER_V3_LIMITS.timeoutMs,
        });
        const jsonText = extractMarketingAutopilotPlannerJson(raw);
        return parser(JSON.parse(jsonText) as unknown);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = /timeout|429|5\d\d|ECONN|fetch|JSON/i.test(msg);
        if (!retryable || i === attempts - 1) throw err;
      }
    }
    throw lastErr;
  }
}
