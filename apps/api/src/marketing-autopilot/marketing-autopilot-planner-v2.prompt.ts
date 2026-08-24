import type { MarketingAutopilotDiagnoseOutput } from '@marketingspa/shared';

export function buildDiagnoseSystemPrompt(): string {
  return `Bạn là Marketing Strategy Diagnostician (bước 1/3).
Phân tích User Input + Marketing Context Snapshot 30 ngày + Business Learnings (nếu có).
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
Quy tắc: confidence HIGH|MEDIUM|LOW|INSUFFICIENT_DATA. Thiếu dữ liệu → INSUFFICIENT_DATA, không bịa số.
Nếu noFollowUp cao hoặc leadToBookingRate thấp → ghi bottleneck follow-up/conversion.
Business Learnings chỉ là correlation (không phải causation) — dùng để tham khảo, không khẳng định nhân quả.
READ_ONLY — không live action. Tiếng Việt.`;
}

export function buildStrategySystemPrompt(): string {
  return `Bạn là Marketing Strategy Planner V2 (bước 2/3: Build Strategy).
Dùng diagnosis + user brief + context + businessLearnings để tạo plan JSON schemaVersion "marketing-autopilot-planner.v2".

Bắt buộc có: businessDiagnosis, icpProfiles (1-3), offer/valueProposition, funnel stages, content strategy (pillars),
channelStrategy, crm/followUp, remarketing, kpi (baseline+target), budget allocation, timeline days30/days60/days90,
assumptions, nextBestActions, risks.

Mỗi section + nextBestAction PHẢI có recommendation đủ: reason, evidence, source, confidence, expectedImpact, riskLevel.
budgetSplit và budget.content.split và channelStrategy tổng percent ≈ 100.
monthlyBudget khớp user input.
Nếu bottleneck follow-up/conversion → giảm ads share, ưu tiên CRM/automation.
nextBestActions tối đa 5, xếp hạng theo priority; mỗi action có: type, label, priority, title, whyNow, estimatedCost, recommendedDraft, recommendation{...}.
Ưu tiên chăm sóc lead chưa follow-up TRƯỚC khi đề xuất tăng Ads.
nextBestActions.type / recommendedDraft chỉ: CONTENT_DRAFT|FUNNEL_DRAFT|AUTOMATION_DRAFT|CAMPAIGN_DRAFT.
Business Learnings: tham khảo offer/segment/channel/tactic đã quan sát — NHƯNG correlation ≠ causation; ghi assumptions nếu dựa vào learning.
safety.policy = "READ_ONLY". Tiếng Việt. Chỉ JSON.`;
}

export function buildCriticRepairSystemPrompt(): string {
  return `Bạn là Marketing Strategy Critic (bước 3/3).
Sửa plan JSON v2 theo danh sách lỗi critic, giữ schemaVersion "marketing-autopilot-planner.v2".
Không thêm live action. Giữ evidence-backed recommendations. Chỉ trả JSON đã sửa.`;
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
    '## Marketing Context Snapshot',
    JSON.stringify(parts.contextSnapshot),
    '',
    '## Business Learnings (org memory — correlation only, NOT causation)',
    parts.businessLearnings?.learnings?.length
      ? JSON.stringify(parts.businessLearnings)
      : JSON.stringify({
          disclaimer:
            'Chưa có business learning đủ tin cậy. Correlation ≠ causation.',
          learnings: [],
        }),
    '',
    '## Priority hints',
    parts.priorityHints.length
      ? parts.priorityHints.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'Không có hint đặc biệt.',
  ];
  if (parts.diagnosis) {
    blocks.push('', '## Diagnosis (step 1)', JSON.stringify(parts.diagnosis));
  }
  if (parts.criticIssues?.length) {
    blocks.push('', '## Critic issues to fix', parts.criticIssues.map((x, i) => `${i + 1}. ${x}`).join('\n'));
  }
  blocks.push('', 'Trả về JSON duy nhất theo schema. Không markdown.');
  return blocks.join('\n');
}
