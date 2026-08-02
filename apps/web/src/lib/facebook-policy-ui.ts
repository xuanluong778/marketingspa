/**
 * Shared Facebook / Meta Ads policy UI helpers (hashes, badges, send gates).
 * Does not call API — pure client logic.
 */

import type {
  FacebookPolicyCheckPayload,
  FacebookPolicyCheckResult,
  FacebookPolicyFinding,
  FacebookPolicyOverallStatus,
  SpecialAdCategory,
} from '@/types/content-marketing';

export type PolicyCheckMode = 'facebook_post' | 'meta_ads';

export type PolicyFindingBucket =
  | 'Text'
  | 'Image'
  | 'Video'
  | 'Audio'
  | 'Landing page'
  | 'Targeting';

export type PolicyBadgeKind =
  | 'UNCHECKED'
  | 'PASS_CANDIDATE'
  | 'REVIEW_REQUIRED'
  | 'HIGH_RISK'
  | 'PROHIBITED'
  | 'INSUFFICIENT_DATA'
  | 'STALE';

/** Snapshot persisted on history / draft / live content. */
export interface ContentPolicySnapshot {
  policyCheckId: string;
  policyStatus: FacebookPolicyOverallStatus;
  riskScore: number;
  confidence?: number;
  policyVersion: string;
  checkedAt: string;
  checkedContentHash: string;
  checkedMediaHash: string;
  checkedLandingPageHash: string;
  specialAdCategory?: SpecialAdCategory;
  needsSpecialAdCategory?: boolean;
  organizationId?: string | null;
  mode?: PolicyCheckMode;
}

export const POLICY_BADGE_LABEL: Record<PolicyBadgeKind, string> = {
  UNCHECKED: 'Chưa kiểm tra',
  PASS_CANDIDATE: 'Có khả năng phù hợp',
  REVIEW_REQUIRED: 'Cần xem lại',
  HIGH_RISK: 'Rủi ro cao',
  PROHIBITED: 'Không nên chạy quảng cáo',
  INSUFFICIENT_DATA: 'Chưa đủ dữ liệu',
  STALE: 'Nội dung đã thay đổi — cần kiểm tra lại',
};

export const POLICY_STATUS_STYLE: Record<PolicyBadgeKind, string> = {
  UNCHECKED: 'border-slate-300 bg-slate-50 text-slate-700',
  PASS_CANDIDATE: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  REVIEW_REQUIRED: 'border-amber-300 bg-amber-50 text-amber-950',
  HIGH_RISK: 'border-orange-400 bg-orange-50 text-orange-950',
  PROHIBITED: 'border-red-400 bg-red-50 text-red-950',
  INSUFFICIENT_DATA: 'border-slate-300 bg-slate-100 text-slate-800',
  STALE: 'border-violet-300 bg-violet-50 text-violet-950',
};

export const POLICY_SEVERITY_STYLE: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  MEDIUM: 'bg-amber-100 text-amber-900',
  HIGH: 'bg-orange-100 text-orange-900',
  CRITICAL: 'bg-red-100 text-red-900',
};

export const SPECIAL_AD_OPTIONS: { value: SpecialAdCategory; label: string }[] = [
  { value: 'NONE', label: 'Không thuộc nhóm đặc biệt' },
  { value: 'CREDIT', label: 'CREDIT — Tín dụng / tài chính' },
  { value: 'EMPLOYMENT', label: 'EMPLOYMENT — Việc làm' },
  { value: 'HOUSING', label: 'HOUSING — Nhà ở' },
  {
    value: 'SOCIAL_ISSUES_ELECTIONS_POLITICS',
    label: 'Chính trị / bầu cử / vấn đề xã hội',
  },
];

/** Simple stable hash for stale detection (non-crypto). */
export function hashPolicyText(input: string): string {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function contentHashFromPayload(
  p: Pick<
    FacebookPolicyCheckPayload,
    'headline' | 'primaryText' | 'description' | 'cta' | 'productService' | 'brandName'
  >,
): string {
  return hashPolicyText(
    [p.headline, p.primaryText, p.description, p.cta, p.productService, p.brandName]
      .map((x) => (x ?? '').trim())
      .join('\n'),
  );
}

export function mediaHashFromPayload(
  p: Pick<FacebookPolicyCheckPayload, 'imageOcrText' | 'transcript'>,
): string {
  return hashPolicyText([p.imageOcrText, p.transcript].map((x) => (x ?? '').trim()).join('\n'));
}

export function landingHashFromPayload(
  p: Pick<FacebookPolicyCheckPayload, 'landingPageText' | 'landingUrl'>,
): string {
  return hashPolicyText([p.landingUrl, p.landingPageText].map((x) => (x ?? '').trim()).join('\n'));
}

export function hashesFromPayload(p: FacebookPolicyCheckPayload) {
  return {
    checkedContentHash: contentHashFromPayload(p),
    checkedMediaHash: mediaHashFromPayload(p),
    checkedLandingPageHash: landingHashFromPayload(p),
  };
}

export function isPolicySnapshotStale(
  snapshot: ContentPolicySnapshot | null | undefined,
  payload: FacebookPolicyCheckPayload,
): boolean {
  if (!snapshot?.checkedAt) return false;
  const h = hashesFromPayload(payload);
  return (
    snapshot.checkedContentHash !== h.checkedContentHash ||
    snapshot.checkedMediaHash !== h.checkedMediaHash ||
    snapshot.checkedLandingPageHash !== h.checkedLandingPageHash
  );
}

export function resolvePolicyBadge(
  snapshot: ContentPolicySnapshot | null | undefined,
  payload?: FacebookPolicyCheckPayload,
): PolicyBadgeKind {
  if (!snapshot?.policyStatus) return 'UNCHECKED';
  if (payload && isPolicySnapshotStale(snapshot, payload)) return 'STALE';
  return snapshot.policyStatus;
}

export function adsUsabilityLabel(status: FacebookPolicyOverallStatus | PolicyBadgeKind): string {
  switch (status) {
    case 'PASS_CANDIDATE':
      return 'Có thể dùng cho quảng cáo (vẫn nên review thủ công).';
    case 'REVIEW_REQUIRED':
      return 'Chỉ dùng Ads sau khi xem lại và xác nhận.';
    case 'HIGH_RISK':
      return 'Không nên chạy Ads cho đến khi sửa và kiểm tra lại.';
    case 'PROHIBITED':
      return 'Không nên chạy quảng cáo.';
    case 'INSUFFICIENT_DATA':
      return 'Chưa đủ dữ liệu để đánh giá Ads.';
    case 'STALE':
      return 'Nội dung đã đổi — cần kiểm tra lại trước khi gửi Ads.';
    default:
      return 'Chưa kiểm tra chính sách.';
  }
}

export function findingBucket(finding: FacebookPolicyFinding): PolicyFindingBucket {
  const id = `${finding.id} ${finding.field}`.toLowerCase();
  if (id.includes('landing') || id.startsWith('lp:')) return 'Landing page';
  if (
    id.startsWith('img:') ||
    id.includes('image') ||
    id.includes('media-adult') ||
    id.includes('media-violence') ||
    id.includes('media-shock')
  ) {
    return 'Image';
  }
  if (id.startsWith('vid:') || id.includes('video')) return 'Video';
  if (id.startsWith('tr:') || id.includes('transcript') || id.includes('audio')) return 'Audio';
  if (
    finding.field === 'audience' ||
    finding.field === 'geoAge' ||
    finding.field === 'specialAdCategory' ||
    finding.policyGroup === 'SPECIAL_AD_CATEGORY'
  ) {
    return 'Targeting';
  }
  return 'Text';
}

export function groupFindingsByBucket(
  findings: FacebookPolicyFinding[],
): Record<PolicyFindingBucket, FacebookPolicyFinding[]> {
  const buckets: Record<PolicyFindingBucket, FacebookPolicyFinding[]> = {
    Text: [],
    Image: [],
    Video: [],
    Audio: [],
    'Landing page': [],
    Targeting: [],
  };
  for (const f of findings.filter((x) => !x.dismissedByAi)) {
    buckets[findingBucket(f)].push(f);
  }
  return buckets;
}

export function needsSpecialAdCategory(findings: FacebookPolicyFinding[]): boolean {
  return findings.some(
    (f) =>
      !f.dismissedByAi &&
      (f.policyGroup === 'SPECIAL_AD_CATEGORY' || f.id.includes('special-category')),
  );
}

export function snapshotFromCheckResult(
  result: FacebookPolicyCheckResult,
  payload: FacebookPolicyCheckPayload,
  mode: PolicyCheckMode = 'meta_ads',
): ContentPolicySnapshot {
  const hashes = hashesFromPayload(payload);
  return {
    policyCheckId: `pol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    policyStatus: result.overallStatus,
    riskScore: result.riskScore,
    confidence: result.confidence,
    policyVersion: result.policyMeta.policyVersion,
    checkedAt: new Date().toISOString(),
    ...hashes,
    specialAdCategory: payload.specialAdCategory ?? 'NONE',
    needsSpecialAdCategory: needsSpecialAdCategory(result.findings),
    organizationId: result.organizationId,
    mode,
  };
}

export type PolicyGateDecision =
  | { ok: true; level: 'allow' }
  | { ok: true; level: 'confirm'; message: string }
  | { ok: false; level: 'block'; message: string };

/** Rules for sending to Meta Ads. */
export function evaluateAdsSendGate(params: {
  snapshot?: ContentPolicySnapshot | null;
  payload?: FacebookPolicyCheckPayload;
  rewrittenPendingRecheck?: boolean;
}): PolicyGateDecision {
  const { snapshot, payload, rewrittenPendingRecheck } = params;
  if (rewrittenPendingRecheck) {
    return {
      ok: false,
      level: 'block',
      message: 'Bản rewrite chưa được kiểm tra lại — bắt buộc Check trước khi gửi Ads.',
    };
  }
  const badge = resolvePolicyBadge(snapshot, payload);
  if (badge === 'UNCHECKED') {
    return { ok: false, level: 'block', message: 'Chưa kiểm tra Content Ads — không thể gửi Ads.' };
  }
  if (badge === 'STALE') {
    return {
      ok: false,
      level: 'block',
      message: 'Nội dung đã thay đổi — cần kiểm tra lại trước khi gửi Ads.',
    };
  }
  if (snapshot?.needsSpecialAdCategory && (snapshot.specialAdCategory ?? 'NONE') === 'NONE') {
    return {
      ok: false,
      level: 'block',
      message: 'Thiếu hoặc chọn sai Special Ad Category — không thể gửi Ads.',
    };
  }
  switch (snapshot?.policyStatus) {
    case 'PASS_CANDIDATE':
      return { ok: true, level: 'allow' };
    case 'REVIEW_REQUIRED':
      return {
        ok: true,
        level: 'confirm',
        message: 'Nội dung CẦN XEM LẠI. Xác nhận vẫn muốn gửi sang Ads?',
      };
    case 'HIGH_RISK':
      return {
        ok: false,
        level: 'block',
        message: 'Rủi ro cao — chặn gửi Ads đến khi sửa và kiểm tra lại.',
      };
    case 'PROHIBITED':
      return { ok: false, level: 'block', message: 'Không nên chạy quảng cáo — đã chặn gửi Ads.' };
    case 'INSUFFICIENT_DATA':
      return {
        ok: false,
        level: 'block',
        message: 'Chưa đủ dữ liệu — bổ sung caption/OCR/transcript/landing rồi kiểm tra lại.',
      };
    default:
      return { ok: false, level: 'block', message: 'Chưa kiểm tra Content Ads.' };
  }
}

/** Rules for Auto Post (organic). Block only PROHIBITED / severe. */
export function evaluateAutoPostGate(params: {
  snapshot?: ContentPolicySnapshot | null;
  payload?: FacebookPolicyCheckPayload;
  rewrittenPendingRecheck?: boolean;
}): PolicyGateDecision {
  const { snapshot, payload, rewrittenPendingRecheck } = params;
  if (rewrittenPendingRecheck) {
    return {
      ok: true,
      level: 'confirm',
      message: 'Bản rewrite chưa check lại. Vẫn tiếp tục gửi Auto Post?',
    };
  }
  const badge = resolvePolicyBadge(snapshot, payload);
  if (badge === 'UNCHECKED') {
    return {
      ok: true,
      level: 'confirm',
      message: 'Chưa kiểm tra Content Ads. Vẫn tiếp tục gửi Auto Post?',
    };
  }
  if (badge === 'STALE') {
    return {
      ok: true,
      level: 'confirm',
      message: 'Nội dung đã đổi sau lần check. Vẫn tiếp tục gửi Auto Post?',
    };
  }
  switch (snapshot?.policyStatus) {
    case 'PASS_CANDIDATE':
      return { ok: true, level: 'allow' };
    case 'REVIEW_REQUIRED':
      return {
        ok: true,
        level: 'confirm',
        message: 'Cần xem lại theo chính sách. Xác nhận vẫn đăng Auto Post?',
      };
    case 'HIGH_RISK':
      return {
        ok: true,
        level: 'confirm',
        message:
          'CẢNH BÁO MẠNH: rủi ro cao theo Community Standards / Ads Standards. Xác nhận vẫn đăng?',
      };
    case 'PROHIBITED':
      return {
        ok: false,
        level: 'block',
        message: 'Nội dung bị cấm / vi phạm nghiêm trọng — chặn đăng Auto Post tự động.',
      };
    case 'INSUFFICIENT_DATA':
      return {
        ok: true,
        level: 'confirm',
        message: 'Chưa đủ dữ liệu kiểm tra. Vẫn tiếp tục Auto Post?',
      };
    default:
      return { ok: true, level: 'confirm', message: 'Chưa kiểm tra. Vẫn gửi Auto Post?' };
  }
}

export function payloadFromPostFields(input: {
  title?: string;
  content?: string;
  cta?: string;
  landingUrl?: string;
  productService?: string;
  imageOcrText?: string;
  transcript?: string;
  country?: string;
  ageMin?: number;
  specialAdCategory?: SpecialAdCategory;
}): FacebookPolicyCheckPayload {
  return {
    headline: (input.title ?? '').trim(),
    primaryText: (input.content ?? '').trim(),
    description: '',
    cta: (input.cta ?? '').trim(),
    productService: (input.productService ?? input.title ?? '').trim(),
    country: input.country ?? 'VN',
    ageMin: input.ageMin ?? 18,
    ageMax: 65,
    specialAdCategory: input.specialAdCategory ?? 'NONE',
    landingUrl: input.landingUrl ?? '',
    landingPageText: '',
    imageOcrText: input.imageOcrText ?? '',
    transcript: input.transcript ?? '',
  };
}

const ADS_BRIDGE_KEY = 'ms_ads_from_content_policy';

export function savePendingAdsHandoff(payload: {
  title: string;
  content: string;
  cta?: string;
  landingUrl?: string;
  policy?: ContentPolicySnapshot | null;
}): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ADS_BRIDGE_KEY, JSON.stringify({ ...payload, at: Date.now() }));
}

export function consumePendingAdsHandoff(): {
  title: string;
  content: string;
  cta?: string;
  landingUrl?: string;
  policy?: ContentPolicySnapshot | null;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ADS_BRIDGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ADS_BRIDGE_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Apply suggested replacements into payload fields (returns new object). */
export function applyFindingFixes(
  form: FacebookPolicyCheckPayload,
  findings: FacebookPolicyFinding[],
): FacebookPolicyCheckPayload {
  const next = { ...form };
  for (const f of findings) {
    const repl = (f.suggestedReplacement ?? '').trim();
    if (!repl) continue;
    const excerpt = (f.excerpt ?? '').trim();
    const field = f.field as keyof FacebookPolicyCheckPayload;
    if (
      field === 'headline' ||
      field === 'primaryText' ||
      field === 'description' ||
      field === 'cta'
    ) {
      const cur = String(next[field] ?? '');
      if (excerpt && cur.includes(excerpt)) {
        next[field] = cur.replace(excerpt, repl);
      } else if (field === 'primaryText') {
        next.primaryText = `${(next.primaryText ?? '').trim()}\n\n${repl}`.trim();
      }
    } else if (next.primaryText && excerpt && next.primaryText.includes(excerpt)) {
      next.primaryText = next.primaryText.replace(excerpt, repl);
    }
  }
  return next;
}
