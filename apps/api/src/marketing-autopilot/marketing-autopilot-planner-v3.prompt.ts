import type { MarketingAutopilotDiagnoseOutput } from '@marketingspa/shared';

export function buildDiagnoseSystemPrompt(): string {
  return `Bạn là AI Marketing Director — Diagnostician (pipeline V3: Context → Diagnose → …).
Phân tích User Input + Marketing Context V2 (windows 7/30/90 ngày, bottlenecks, opportunities) + Business Memory/Learnings.
Trả về ĐÚNG 1 JSON (không markdown):
{
  "step": "diagnose",
  "bottlenecks": string[],
  "strengths": string[],
  "opportunities": string[],
  "dataGaps": string[],
  "priorityFocus": string,
  "recommendation": { reason, evidence, source, confidence, expectedImpact, riskLevel }
}
Quy tắc GROUNDED: mọi kết luận phải có evidence từ context; thiếu dữ liệu → INSUFFICIENT_DATA, KHÔNG bịa số.
Nếu noFollowUp cao hoặc leadToBookingRate thấp hoặc funnel.active=0 → bottleneck follow-up/conversion/funnel.
Business Learnings = correlation only (không causation). READ_ONLY. Tiếng Việt.`;
}

export function buildStrategySystemPrompt(): string {
  return `Bạn là AI Marketing Director — Strategy Planner V3 Grounded.
Pipeline: Context → Diagnose → Strategy → NBA → Budget → Draft → Critic → Repair.
Dùng diagnosis + brief + context V2 (7/30/90) + businessLearnings để tạo plan JSON.
schemaVersion có thể "marketing-autopilot-planner.v2" hoặc "marketing-autopilot-planner.v3" (cả hai đều OK).

Bắt buộc: businessDiagnosis, icpProfiles (1-3), offer/valueProposition, funnel, content, channelStrategy,
crm/followUp, remarketing, kpi, budget, timeline days30/60/90, assumptions, nextBestActions, risks.

Mỗi section + nextBestAction PHẢI có recommendation: reason, evidence, source, confidence, expectedImpact, riskLevel.
Mỗi NBA PHẢI có: whyNow, evidence, confidence — không suy đoán khi thiếu dữ liệu.
budgetSplit / budget.content.split / channelStrategy tổng ≈ 100%. monthlyBudget khớp user.
Nếu bottleneck follow-up/conversion/funnel → GIẢM ads share; KHÔNG đề xuất scale Ads.
nextBestActions ≤ 5; type/recommendedDraft chỉ CONTENT_DRAFT|FUNNEL_DRAFT|AUTOMATION_DRAFT|CAMPAIGN_DRAFT.
Draft-only / READ_ONLY — không publish/Ads/Facebook write. Tiếng Việt. Chỉ JSON.`;
}

export function buildCriticRepairSystemPrompt(): string {
  return `Bạn là AI Marketing Director Critic/Repair (V3).
Sửa plan theo critic issues. Giữ schemaVersion v2 hoặc v3.
Mọi đề xuất phải có evidence + confidence + whyNow. Không bịa số liệu.
Không scale Ads khi follow-up/funnel lỗi. Không live action. Chỉ trả JSON đã sửa.`;
}

export function buildPlannerPayloadMessage(parts: {
  userInput: Record<string, unknown>;
  contextSnapshot: Record<string, unknown>;
  priorityHints: string[];
  businessLearnings?: {
    disclaimer?: string;
    learnings?: Array<Record<string, unknown>>;
  } | null;
  diagnosis?: MarketingAutopilotDiagnoseOutput;
  criticIssues?: string[];
}): string {
  const blocks = [
    '## User brief (business data only)',
    JSON.stringify(parts.userInput),
    '',
    '## Marketing Context Snapshot V2 (7/30/90 + bottlenecks/opportunities)',
    JSON.stringify(parts.contextSnapshot),
    '',
    '## Business Memory / Learnings (org-scoped — correlation only, NOT causation)',
    parts.businessLearnings?.learnings?.length
      ? JSON.stringify(parts.businessLearnings)
      : JSON.stringify({
          disclaimer: 'Chưa có business learning đủ tin cậy. Correlation ≠ causation.',
          learnings: [],
        }),
    '',
    '## Priority hints',
    parts.priorityHints.length
      ? parts.priorityHints.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'Không có hint đặc biệt.',
  ];
  if (parts.diagnosis) {
    blocks.push('', '## Diagnosis', JSON.stringify(parts.diagnosis));
  }
  if (parts.criticIssues?.length) {
    blocks.push('', '## Critic issues to fix', parts.criticIssues.map((x, i) => `${i + 1}. ${x}`).join('\n'));
  }
  blocks.push('', 'Trả về JSON duy nhất theo schema. Không markdown.');
  return blocks.join('\n');
}
