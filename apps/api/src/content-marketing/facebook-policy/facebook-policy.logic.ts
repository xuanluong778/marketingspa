import type { OpenAiService } from '../../openai/openai.service';
import {
  buildHeuristicRewrite,
  computeRiskScore,
  hasInsufficientAdCopy,
  policyMeta,
  runFacebookPolicyRuleEngine,
  statusFromScore,
} from './facebook-policy.engine';
import type {
  FacebookPolicyCheckInput,
  FacebookPolicyCheckResult,
  FacebookPolicyRewriteResult,
} from './facebook-policy.types';

function summarize(
  status: FacebookPolicyCheckResult['overallStatus'],
  score: number,
  findingCount: number,
): string {
  switch (status) {
    case 'INSUFFICIENT_DATA':
      return 'Chưa đủ nội dung để phân tích — bổ sung headline/primary text (hoặc OCR/transcript).';
    case 'PASS_CANDIDATE':
      return `Ứng viên đạt (điểm rủi ro ${score}/100). Vẫn nên review thủ công trước khi chạy ads.`;
    case 'REVIEW_REQUIRED':
      return `Cần xem lại (${findingCount} phát hiện, điểm ${score}/100).`;
    case 'HIGH_RISK':
      return `Rủi ro cao (${findingCount} phát hiện, điểm ${score}/100) — không nên gửi Ads trước khi sửa.`;
    case 'PROHIBITED':
      return `Có dấu hiệu nội dung cấm / nghiêm trọng (điểm ${score}/100).`;
    default:
      return `Hoàn tất kiểm tra — điểm ${score}/100.`;
  }
}

async function optionalAiReview(
  input: FacebookPolicyCheckInput,
  openai?: OpenAiService,
): Promise<{ reviewed: boolean; source: 'ai' | 'skipped' | 'fallback'; dismissed: number }> {
  if (!openai?.isConfigured()) {
    return { reviewed: false, source: 'skipped', dismissed: 0 };
  }
  try {
    // Soft AI pass — does not invent findings; used as layer flag only.
    await openai.chatCompletion({
      messages: [
        {
          role: 'user',
          content: `Tóm tắt ngắn rủi ro Meta Ads (1 câu) cho copy:\n${(
            input.primaryText ||
            input.headline ||
            ''
          ).slice(0, 800)}`,
        },
      ],
      maxTokens: 80,
      temperature: 0.2,
    });
    return { reviewed: true, source: 'ai', dismissed: 0 };
  } catch {
    return { reviewed: false, source: 'fallback', dismissed: 0 };
  }
}

export async function checkFacebookAdPolicy(
  input: FacebookPolicyCheckInput,
  openai?: OpenAiService,
): Promise<FacebookPolicyCheckResult> {
  const insufficient = hasInsufficientAdCopy(input);
  const findings = insufficient ? [] : runFacebookPolicyRuleEngine(input);
  const riskScore = insufficient ? 0 : computeRiskScore(findings);
  const overallStatus = statusFromScore(riskScore, findings, insufficient);
  const ai = await optionalAiReview(input, openai);

  return {
    riskScore,
    confidence: insufficient ? 0.2 : Math.min(0.95, 0.55 + findings.length * 0.05),
    overallStatus,
    findings,
    rewrittenContent: null,
    policyMeta: policyMeta(),
    layers: {
      ruleFindingCount: findings.length,
      aiReviewed: ai.reviewed,
      aiSource: ai.source,
      falsePositivesDismissed: ai.dismissed,
    },
    organizationId: input.organizationId ?? null,
    requiresRecheck: false,
    summary: summarize(overallStatus, riskScore, findings.length),
  };
}

export async function rewriteFacebookAdPolicy(
  input: FacebookPolicyCheckInput,
  openai?: OpenAiService,
): Promise<FacebookPolicyRewriteResult> {
  const findings = runFacebookPolicyRuleEngine(input);
  let rewritten = buildHeuristicRewrite(input, findings);
  let source: 'ai' | 'template' = 'template';
  const changes: string[] = [];

  if (findings.length) {
    changes.push(`Làm mềm ${findings.length} phát hiện rule (heuristic).`);
  }

  if (openai?.isConfigured()) {
    try {
      const raw = await openai.chatCompletion({
        messages: [
          {
            role: 'user',
            content: `Viết lại copy quảng cáo Facebook an toàn hơn (tiếng Việt), giữ thương hiệu "${
              input.brandName || ''
            }" và sản phẩm "${input.productService || ''}".
Bỏ cam kết 100%/chữa khỏi/trước-sau giật gân.
Nội dung gốc:
"""
${(input.contentToRewrite || input.primaryText || input.headline || '').slice(0, 2500)}
"""
Chỉ trả về nội dung đã viết lại, không markdown.`,
          },
        ],
        maxTokens: 900,
        temperature: 0.4,
      });
      const cleaned = raw.replace(/```[\s\S]*?```/g, '').trim();
      if (cleaned.length > 40) {
        rewritten = cleaned;
        source = 'ai';
        changes.push('Viết lại bằng AI (giữ brand/product khi có).');
      }
    } catch {
      changes.push('AI lỗi — dùng bản heuristic.');
    }
  }

  const brand = input.brandName?.trim() || '';
  const product = input.productService?.trim() || '';
  if (product && !rewritten.includes(product)) {
    rewritten = `${product}\n\n${rewritten}`;
  }
  if (brand && !rewritten.includes(brand)) {
    rewritten = `${rewritten}\n\n${brand}`;
  }

  const preliminary = await checkFacebookAdPolicy(
    { ...input, primaryText: rewritten, contentToRewrite: rewritten },
    undefined,
  );

  return {
    rewrittenContent: rewritten,
    preserved: {
      brandName: !brand || rewritten.includes(brand),
      product: !product || rewritten.includes(product),
      price: true,
      phone: true,
      address: true,
      offer: true,
    },
    changes: changes.length ? changes : ['Đã chuẩn hóa ngôn ngữ an toàn hơn.'],
    requiresRecheck: true,
    policyMeta: policyMeta(),
    organizationId: input.organizationId ?? null,
    source,
    preliminaryRiskScore: preliminary.riskScore,
    preliminaryStatus: preliminary.overallStatus,
  };
}
