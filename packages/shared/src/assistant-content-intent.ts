/**
 * Intent routing: CONTENT_MARKETING → short guidance + CTAs (no auto-navigate).
 * Pure helpers — no ORM/env.
 */
import type { AssistantLink } from './assistant-tools';

export const CONTENT_MARKETING_INTENT = 'CONTENT_MARKETING' as const;

export type ContentMarketingVariant =
  | 'generic'
  | 'ad'
  | 'personal'
  | 'advanced'
  | 'video'
  | 'hub';

export type ContentMarketingIntentResult = {
  intent: typeof CONTENT_MARKETING_INTENT;
  variants: ContentMarketingVariant[];
  /** true = no enterprise data keywords; safe to skip data tools */
  pure: boolean;
  links: AssistantLink[];
  /** When set, orchestrator may return this instead of a long LLM essay */
  preferredReply?: string;
};

const HREF = {
  createAd: '/content?tab=create&section=ad',
  createPersonal: '/content?tab=create&section=personal',
  createAdvanced: '/content?tab=create&section=advanced',
  teleprompter: '/teleprompter',
  contentHub: '/content?tab=create',
} as const;

function link(
  label: string,
  href: string,
  entityId: string,
): AssistantLink {
  return {
    rel: 'content',
    label,
    href,
    entityType: 'content_module',
    entityId,
  };
}

function normalize(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Enterprise data / ops questions still need existing tools. */
export function hasBusinessDataIntent(message: string): boolean {
  const n = normalize(message);
  if (!n) return false;
  // Performance / CRM / work metrics (not "write an ad")
  if (
    /\b(doanh thu|don hang|order|lead|khach hang can|funnel|bao cao dieu hanh|cong viec|task|overdue|inbox|nhan vien|chi phi|roas|cpc|ctr|spend|hieu qua quang cao|campaign metrics|ket qua kinh doanh)\b/.test(
      n,
    )
  ) {
    return true;
  }
  // "quảng cáo" as ads analytics when paired with metrics words and no writing intent
  if (
    /\b(quang cao|ads)\b/.test(n) &&
    /\b(hieu qua|chi phi|doanh thu|roi|roas|click|impression|ngan sach|budget)\b/.test(n) &&
    !/\b(viet|caption|content|bai|copy|kich ban|y tuong bai)\b/.test(n)
  ) {
    return true;
  }
  return false;
}

/** Writing / brand content / scripts — not Ads metrics. */
export function hasContentMarketingIntent(message: string): boolean {
  const n = normalize(message);
  if (!n) return false;

  // Clear writing / marketing-content signals
  if (
    /\b(content marketing|content|viet content|viet bai|viet caption|caption|bai viet|bai dang|y tuong bai|copywriting|copy ads|ad copy|noi dung marketing|xay dung thuong hieu|thuong hieu ca nhan|personal brand|kich ban|kich ban quay|teleprompter|script video|quay video|bai quang cao|viet quang cao|bai ban hang|ban hang content|hook|storytelling)\b/.test(
      n,
    )
  ) {
    return true;
  }

  // "viết … (quảng cáo|bán hàng|thương hiệu|post|story)"
  if (/\bviet\b/.test(n) && /\b(quang cao|ban hang|thuong hieu|post|story|facebook|fanpage|ig|instagram|tiktok)\b/.test(n)) {
    return true;
  }

  // Generic: want content but stuck
  if (/\b(content|noi dung|bai viet)\b/.test(n) && /\b(khong biet|khong biet viet|bi tac|khong biet bat dau|bo tay)\b/.test(n)) {
    return true;
  }

  return false;
}

function detectVariants(n: string): ContentMarketingVariant[] {
  const variants = new Set<ContentMarketingVariant>();

  if (/\b(kich ban|teleprompter|quay video|script video|prompter)\b/.test(n)) {
    variants.add('video');
  }
  if (
    /\b(xay dung thuong hieu|thuong hieu ca nhan|personal brand|branding|uy tin|storytelling thuong hieu|personal post|ca nhan hoa thuong hieu)\b/.test(
      n,
    ) ||
    (/\b(thuong hieu)\b/.test(n) && /\b(viet|content|xay dung|bai)\b/.test(n))
  ) {
    variants.add('personal');
  }
  if (
    /\b(viet bai nang cao|content nang cao|bai nang cao|section advanced|seo|long form|blog)\b/.test(n) ||
    (/\bnang cao\b/.test(n) && /\b(viet|content|bai)\b/.test(n))
  ) {
    variants.add('advanced');
  }
  if (
    /\b(quang cao|ban hang|ad copy|bai ban hang|conversion|mua ngay|khuyen mai|landing|section ad|tao content)\b/.test(
      n,
    ) ||
    (/\b(viet)\b/.test(n) && /\b(quang cao|ban hang)\b/.test(n))
  ) {
    variants.add('ad');
  }

  const lost =
    /\b(khong biet|khong biet viet|bi tac|khong biet bat dau|bo tay|khong biet viet the nao|khong biet viet noi dung)\b/.test(
      n,
    ) && /\b(content|bai|noi dung|viet)\b/.test(n);

  if (lost) {
    variants.add('generic');
  }

  if (variants.size === 0) {
    variants.add('hub');
  }

  return [...variants];
}

function linksForVariants(variants: ContentMarketingVariant[]): AssistantLink[] {
  if (variants.length === 1 && variants[0] === 'hub') {
    return [
      link('Tạo Content', HREF.createAd, 'create-ad'),
      link('Xây dựng thương hiệu', HREF.createPersonal, 'create-personal'),
      link('Kịch bản quay video', HREF.teleprompter, 'teleprompter'),
    ];
  }

  if (variants.length === 1 && variants[0] === 'generic') {
    return [link('Bắt đầu tạo Content', HREF.createAd, 'start-create')];
  }

  if (variants.length === 1 && variants[0] === 'personal') {
    return [link('Xây dựng thương hiệu', HREF.createPersonal, 'create-personal')];
  }
  if (variants.length === 1 && variants[0] === 'ad') {
    return [link('Tạo Content', HREF.createAd, 'create-ad')];
  }
  if (variants.length === 1 && variants[0] === 'advanced') {
    return [link('Viết bài nâng cao', HREF.createAdvanced, 'create-advanced')];
  }
  if (variants.length === 1 && variants[0] === 'video') {
    return [link('Kịch bản quay video', HREF.teleprompter, 'teleprompter')];
  }

  const out: AssistantLink[] = [];
  const push = (l: AssistantLink) => {
    if (out.some((x) => x.href === l.href && x.label === l.label)) return;
    out.push(l);
  };

  if (variants.includes('generic')) {
    push(link('Bắt đầu tạo Content', HREF.createAd, 'start-create'));
  }
  if (variants.includes('ad')) {
    push(link('Tạo Content', HREF.createAd, 'create-ad'));
  }
  if (variants.includes('personal')) {
    push(link('Xây dựng thương hiệu', HREF.createPersonal, 'create-personal'));
  }
  if (variants.includes('advanced')) {
    push(link('Viết bài nâng cao', HREF.createAdvanced, 'create-advanced'));
  }
  if (variants.includes('video')) {
    push(link('Kịch bản quay video', HREF.teleprompter, 'teleprompter'));
  }

  return out.slice(0, 4);
}

function preferredReplyFor(variants: ContentMarketingVariant[], n: string): string | undefined {
  if (variants.includes('generic')) {
    return 'Được chứ 😄 Bạn không cần nghĩ từ đầu. Tôi có thể đưa bạn sang Content Marketing để chọn mục tiêu, chủ đề và giọng văn rồi AI viết luôn.';
  }
  if (variants.length === 1 && variants[0] === 'personal') {
    return 'Được 😄 Mục xây dựng thương hiệu sẽ giúp chọn chủ đề, góc nhìn và giọng văn rồi AI viết luôn. Bấm nút bên dưới nhé — mình không tự chuyển trang.';
  }
  if (variants.length === 1 && variants[0] === 'ad') {
    return 'Ok 😄 Sang Tạo Content (quảng cáo) chọn mục tiêu + sản phẩm, AI lo phần viết. Bấm nút khi bạn sẵn sàng.';
  }
  if (variants.length === 1 && variants[0] === 'video') {
    return 'Kịch bản video thì dùng Teleprompter cho gọn 😄 Mở studio, dán/viết script, chỉnh tốc độ rồi quay.';
  }
  if (variants.length === 1 && variants[0] === 'advanced') {
    return 'Có mục Viết bài nâng cao sẵn trong Content Marketing 😄 Bấm nút để mở đúng section — chọn chủ đề rồi để AI draft.';
  }
  if (variants[0] === 'hub' || /\bcontent\b/.test(n)) {
    return 'Làm content thì khỏi viết dông dài ở đây 😄 Chọn module phù hợp bên dưới — AI trong Content Marketing viết theo mục tiêu và giọng văn của bạn.';
  }
  return undefined;
}

/**
 * Resolve content-marketing intent from one user message.
 * Returns null when not content marketing.
 */
export function resolveContentMarketingIntent(
  message: string,
): ContentMarketingIntentResult | null {
  if (!hasContentMarketingIntent(message)) return null;

  const n = normalize(message);
  const variants = detectVariants(n);
  const pure = !hasBusinessDataIntent(message);
  const links = linksForVariants(variants);
  const preferredReply = preferredReplyFor(variants, n);

  return {
    intent: CONTENT_MARKETING_INTENT,
    variants,
    pure,
    links,
    preferredReply,
  };
}
