/**
 * Rules-first Facebook/Meta ads policy engine.
 */
import { FACEBOOK_POLICY_BUNDLE } from './facebook-policy.config';
import { FACEBOOK_POLICY_RULES } from './facebook-policy.rules';
import type {
  FacebookPolicyCheckInput,
  FacebookPolicyFinding,
  FacebookPolicyOverallStatus,
  FacebookPolicyMeta,
  SpecialAdCategory,
} from './facebook-policy.types';

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

function fieldBlob(input: FacebookPolicyCheckInput): { text: string; field: string } {
  const parts: Array<{ field: string; v: string }> = [
    { field: 'headline', v: input.headline || '' },
    { field: 'primaryText', v: input.primaryText || '' },
    { field: 'description', v: input.description || '' },
    { field: 'cta', v: input.cta || '' },
    { field: 'audience', v: input.audience || '' },
    { field: 'productService', v: input.productService || '' },
  ];
  const nonempty = parts.filter((p) => p.v.trim());
  const text = nonempty.map((p) => p.v).join('\n');
  const field = nonempty[0]?.field || 'primaryText';
  return { text, field };
}

function excerptAround(raw: string, signal: string, max = 120): string {
  const lower = raw.toLowerCase();
  const idx = lower.indexOf(signal.toLowerCase());
  if (idx < 0) return raw.slice(0, max);
  const start = Math.max(0, idx - 40);
  return raw.slice(start, start + max).trim();
}

export function policyMeta(): FacebookPolicyMeta {
  return { ...FACEBOOK_POLICY_BUNDLE };
}

export function hasInsufficientAdCopy(input: FacebookPolicyCheckInput): boolean {
  const joined = [input.headline, input.primaryText, input.description, input.cta]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ');
  if (joined.length < 24) return true;
  // Too short headline-only
  if (!(input.primaryText || '').trim() && (input.headline || '').trim().length < 18) return true;
  return false;
}

export function runFacebookPolicyRuleEngine(
  input: FacebookPolicyCheckInput,
): FacebookPolicyFinding[] {
  const { text, field } = fieldBlob(input);
  const raw = text;
  const n = norm(raw);
  const findings: FacebookPolicyFinding[] = [];
  const sac: SpecialAdCategory = input.specialAdCategory || 'NONE';

  for (const rule of FACEBOOK_POLICY_RULES) {
    const matched: string[] = [];
    for (const sig of rule.signals) {
      const ns = norm(sig);
      if (ns && n.includes(ns)) matched.push(sig);
    }
    // Special category rule: only flag when category undeclared (NONE)
    if (rule.id === 'special-ad-housing-jobs-credit') {
      if (sac !== 'NONE') continue;
    }
    if (matched.length < rule.minSignals) continue;

    const hit = matched[0] || rule.signals[0] || '';
    const excerpt = excerptAround(raw, hit);
    findings.push({
      id: rule.id,
      field: rule.fieldHint || field,
      excerpt,
      evidence: excerpt,
      policyGroup: rule.policyGroup,
      policyCode: rule.policyCode,
      severity: rule.severity,
      reason: rule.reason,
      explanation: rule.reason,
      remediation: rule.remediation,
      suggestedReplacement: rule.suggestedReplacement,
      suggestion: rule.suggestedReplacement || rule.remediation,
      signalCount: matched.length,
      signals: matched.slice(0, 8),
      source: 'rule',
    });
  }

  return findings;
}

export function computeRiskScore(findings: FacebookPolicyFinding[]): number {
  if (!findings.length) return 8;
  let score = 12;
  for (const f of findings) {
    switch (f.severity) {
      case 'CRITICAL':
        score += 42;
        break;
      case 'HIGH':
        score += 28;
        break;
      case 'MEDIUM':
        score += 16;
        break;
      default:
        score += 8;
    }
    score += Math.min(8, Math.max(0, f.signalCount - 2) * 2);
  }
  return Math.min(100, score);
}

export function statusFromScore(
  score: number,
  findings: FacebookPolicyFinding[],
  insufficient: boolean,
): FacebookPolicyOverallStatus {
  if (insufficient) return 'INSUFFICIENT_DATA';
  if (findings.some((f) => f.severity === 'CRITICAL' || f.policyGroup === 'PROHIBITED')) {
    return 'PROHIBITED';
  }
  if (score >= 70 || findings.some((f) => f.severity === 'HIGH' && f.signalCount >= 3)) {
    return 'HIGH_RISK';
  }
  if (score >= 35 || findings.length > 0) return 'REVIEW_REQUIRED';
  return 'PASS_CANDIDATE';
}

export function buildHeuristicRewrite(
  input: FacebookPolicyCheckInput,
  findings: FacebookPolicyFinding[],
): string {
  let text =
    input.contentToRewrite?.trim() ||
    [input.headline, input.primaryText, input.description].filter(Boolean).join('\n\n');

  const replacements: Array<[RegExp, string]> = [
    [/cam kết\s*100\s*%/gi, 'hướng tới cải thiện'],
    [/100\s*%/gi, 'theo khả năng'],
    [/chữa khỏi/gi, 'hỗ trợ cải thiện'],
    [/khỏi hẳn/gi, 'cải thiện dần'],
    [/điều trị triệt để/gi, 'chăm sóc chuyên sâu'],
    [/trước\s*[-–]?\s*sau/gi, 'quá trình chăm sóc'],
    [/bạn đang bị/gi, 'nhiều khách quan tâm đến'],
  ];
  for (const [re, to] of replacements) {
    text = text.replace(re, to);
  }

  const brand = input.brandName?.trim();
  const product = input.productService?.trim();
  if (product && !text.includes(product)) text = `${product}\n\n${text}`;
  if (brand && !text.includes(brand)) text = `${text}\n\n${brand}`;

  if (!text.trim() && findings.length) {
    text = [
      product || 'Sản phẩm / dịch vụ',
      brand ? `Thương hiệu: ${brand}` : '',
      'Nội dung đã làm mềm các cam kết tuyệt đối. Kết quả có thể khác nhau tùy cơ địa.',
      'Inbox để được tư vấn phù hợp.',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return text.trim();
}
