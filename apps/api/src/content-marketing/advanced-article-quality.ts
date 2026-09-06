/**
 * Quality gates for advanced article channel variants.
 * Fail → caller regenerates that channel only.
 */

export type AdvancedChannel = 'main' | 'facebook' | 'website' | 'ads';

export interface ChannelQualityResult {
  ok: boolean;
  reasons: string[];
}

function wordCount(text: string): number {
  return (text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeForCompare(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard similarity on word sets — 1 = identical */
export function textSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeForCompare(a).split(' ').filter((w) => w.length > 2));
  const wb = new Set(normalizeForCompare(b).split(' ').filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

const PAIN_HINTS = [
  /bạn có|đang gặp|nỗi|khó chịu|mệt|lo|sợ|stress|không hài lòng|vấn đề|đau|xỉn|mụn|nám|bận/i,
];
const BENEFIT_HINTS = [
  /lợi ích|bạn sẽ|giúp|cải thiện|tự tin|nhẹ nhõm|hiệu quả|kết quả|trải nghiệm|thay đổi/i,
];
const OFFER_HINTS = [
  /ưu đãi|combo|quà|giá|chỉ từ|khuyến mãi|deadline|hạn|suất|gói|offer/i,
];
const CTA_HINTS = [
  /inbox|comment|nhắn|gọi|đặt lịch|liên hệ|hotline|zalo|đăng ký|giữ chỗ|tư vấn/i,
];

export function evaluateFacebookChannel(
  facebook: string,
  mainArticle?: string,
): ChannelQualityResult {
  const reasons: string[] = [];
  const words = wordCount(facebook);
  if (words < 180) reasons.push(`facebook quá ngắn (${words} từ, cần ≥180)`);
  if (!hasAny(facebook, PAIN_HINTS)) reasons.push('facebook thiếu mở pain');
  if (!hasAny(facebook, BENEFIT_HINTS)) reasons.push('facebook thiếu lợi ích');
  if (!hasAny(facebook, OFFER_HINTS) && !hasAny(facebook, CTA_HINTS)) {
    reasons.push('facebook thiếu offer/CTA');
  }
  if (!hasAny(facebook, CTA_HINTS)) reasons.push('facebook thiếu CTA rõ');
  if (/^#{1,3}\s/m.test(facebook) || /\n##\s/.test(facebook)) {
    reasons.push('facebook không được dùng heading markdown');
  }
  if (mainArticle && textSimilarity(facebook, mainArticle) > 0.82) {
    reasons.push('facebook trùng bài chính quá nhiều');
  }
  return { ok: reasons.length === 0, reasons };
}

export function evaluateWebsiteChannel(
  website: string,
  mainArticle?: string,
  facebook?: string,
): ChannelQualityResult {
  const reasons: string[] = [];
  const words = wordCount(website);
  if (words < 450) reasons.push(`website quá ngắn (${words} từ, cần ≥450)`);

  const h1 = (website.match(/^#\s+.+/gm) || []).length;
  const h2 = (website.match(/^##\s+.+/gm) || []).length;
  const h3 = (website.match(/^###\s+.+/gm) || []).length;
  if (h1 < 1 && h2 < 2) reasons.push('website thiếu H1/H2');
  if (h2 + h3 < 3) reasons.push('website thiếu đủ section heading');

  const hasFaq =
    /faq|câu hỏi thường gặp|hỏi đáp/i.test(website) ||
    (website.match(/\?\s*$/gm) || []).length >= 2;
  if (!hasFaq) reasons.push('website thiếu FAQ');

  if (!hasAny(website, CTA_HINTS)) reasons.push('website thiếu CTA');
  if (!/quy trình|các bước|bước 1|process|làm thế nào/i.test(website)) {
    reasons.push('website thiếu mục quy trình');
  }
  if (mainArticle && textSimilarity(website, mainArticle) > 0.75) {
    reasons.push('website trùng bài chính quá nhiều');
  }
  if (facebook && textSimilarity(website, facebook) > 0.7) {
    reasons.push('website trùng facebook quá nhiều');
  }
  return { ok: reasons.length === 0, reasons };
}

export function evaluateAdsChannel(ads: string): ChannelQualityResult {
  const reasons: string[] = [];
  if (!ads?.trim()) {
    return { ok: false, reasons: ['ads trống'] };
  }

  const primaryCount = (ads.match(/primary\s*text/gi) || []).length;
  const headlineCount = (ads.match(/headline/gi) || []).length;
  const descCount = (ads.match(/description/gi) || []).length;
  const angleCount = (ads.match(/(^|\n)##?\s*góc\s*\d+/gi) || []).length
    || (ads.match(/angle\s*\d+/gi) || []).length
    || primaryCount;

  if (primaryCount < 3) reasons.push(`ads cần ≥3 primaryText (có ${primaryCount})`);
  if (headlineCount < 3) reasons.push(`ads cần ≥3 headline (có ${headlineCount})`);
  if (descCount < 3) reasons.push(`ads cần ≥3 description (có ${descCount})`);
  if (angleCount < 3) reasons.push(`ads cần ≥3 góc (có ${angleCount})`);

  const words = wordCount(ads);
  // Ads pack can be medium length but must not be a long blog
  const longParas = (ads.split(/\n\n+/).filter((p) => wordCount(p) > 120) || []).length;
  if (longParas >= 3) reasons.push('ads viết như blog (đoạn quá dài)');
  if (words < 80) reasons.push('ads quá sơ sài');

  return { ok: reasons.length === 0, reasons };
}

export function evaluateMainArticle(article: string, minWords = 280): ChannelQualityResult {
  const reasons: string[] = [];
  const words = wordCount(article);
  if (words < minWords) reasons.push(`bài chính quá ngắn (${words} từ)`);
  if (!hasAny(article, CTA_HINTS)) reasons.push('bài chính thiếu CTA');
  return { ok: reasons.length === 0, reasons };
}

export interface AdsAnglePack {
  angle: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
}

export function formatAdsPackToDisplay(angles: AdsAnglePack[]): string {
  return angles
    .map(
      (a, i) =>
        `## Góc ${i + 1}: ${a.angle}\n\n**Primary text:** ${a.primaryText}\n\n**Headline:** ${a.headline}\n\n**Description:** ${a.description}\n\n**CTA:** ${a.cta}`,
    )
    .join('\n\n');
}

export function parseAdsPackFromDisplay(ads: string): AdsAnglePack[] {
  if (!ads?.trim()) return [];
  const blocks = ads.split(/(?=##\s*Góc\s*\d+)/i).filter((b) => b.trim());
  const out: AdsAnglePack[] = [];
  for (const block of blocks) {
    const angle =
      block.match(/##\s*Góc\s*\d+\s*:\s*(.+)/i)?.[1]?.trim() ||
      block.match(/Angle\s*:\s*(.+)/i)?.[1]?.trim() ||
      'Ads angle';
    const primaryText =
      block.match(/\*\*Primary text:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i)?.[1]?.trim() ||
      block.match(/Primary text:\s*([\s\S]*?)(?=\n(?:Headline|Description|CTA)|\n\n|$)/i)?.[1]?.trim() ||
      '';
    const headline =
      block.match(/\*\*Headline:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i)?.[1]?.trim() ||
      block.match(/Headline:\s*([\s\S]*?)(?=\n(?:Description|CTA|Primary)|\n\n|$)/i)?.[1]?.trim() ||
      '';
    const description =
      block.match(/\*\*Description:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i)?.[1]?.trim() ||
      block.match(/Description:\s*([\s\S]*?)(?=\n(?:CTA|Primary|Headline)|\n\n|$)/i)?.[1]?.trim() ||
      '';
    const cta =
      block.match(/\*\*CTA:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i)?.[1]?.trim() ||
      block.match(/CTA:\s*([\s\S]*?)(?=\n##|$)/i)?.[1]?.trim() ||
      '';
    if (primaryText || headline) {
      out.push({ angle, primaryText, headline, description, cta });
    }
  }
  return out;
}
