import type {
  AutopilotFormOptions,
  AutopilotFormProduct,
  MarketingContextSnapshot,
} from '../types/marketing-autopilot';

export const CUSTOM_PRODUCT = '__custom__';
export const LOW_DATA_HINT = 'Chưa đủ dữ liệu để gợi ý';

export type SuggestionConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type ProductSuggestion = {
  id: string;
  name: string;
  price: number;
  confidence: SuggestionConfidence;
};

export type CustomerSuggestion = {
  text: string;
  confidence: SuggestionConfidence;
};

export type AudienceOption = {
  index: number;
  text: string;
};

export type AudienceOptionsResult = {
  options: AudienceOption[];
  confidence: SuggestionConfidence;
};

const STOP_PATTERNS: RegExp[] = [
  /dự án/gi,
  /du an/gi,
  /chiến dịch/gi,
  /chien dich/gi,
  /\bcampaign\b/gi,
  /\bproject\b/gi,
  /tăng lead/gi,
  /tang lead/gi,
  /tăng booking/gi,
  /tang booking/gi,
  /tăng doanh thu/gi,
  /tang doanh thu/gi,
  /khách mới/gi,
  /khach moi/gi,
  /remarketing/gi,
  /khách cũ/gi,
  /khach cu/gi,
  /ra mắt sản phẩm/gi,
  /ra mat san pham/gi,
  /nhận diện/gi,
  /nhan dien/gi,
  /\bQ[1-4]\b/gi,
  /\bT([1-9]|1[0-2])\b/gi,
  /\b(19|20)\d{2}\b/g,
  /\b(0?[1-9]|1[0-2])\/((19|20)\d{2})\b/g,
  /tháng\s+\d{1,2}/gi,
  /thang\s+\d{1,2}/gi,
];

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function extractProductFromProjectName(projectName: string): string {
  let s = projectName.trim();
  for (const re of STOP_PATTERNS) s = s.replace(re, ' ');
  return s.replace(/[\s\-–—:,/]+/g, ' ').trim();
}

function isMeaningfulProduct(name: string): boolean {
  const tokens = name.split(/\s+/).filter(Boolean);
  const letters = name.replace(/\d+/g, '').replace(/[^\p{L}]+/gu, '');
  if (tokens.length >= 2 && letters.length >= 4) return true;
  return letters.length >= 6;
}

function namesRelated(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

function matchCatalog(extracted: string, products: AutopilotFormProduct[]): AutopilotFormProduct | null {
  const e = normalize(extracted);
  if (!e) return null;
  const hits = products
    .filter((p) => {
      const n = normalize(p.name);
      if (!n || n.length < 3) return false;
      return e.includes(n) || n.includes(e);
    })
    .sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  return hits[0] ?? null;
}

export function suggestProduct(
  projectName: string,
  products: AutopilotFormProduct[] = [],
  snapshot?: MarketingContextSnapshot | null,
): ProductSuggestion | null {
  const extracted = extractProductFromProjectName(projectName);
  if (!isMeaningfulProduct(extracted)) {
    return { id: CUSTOM_PRODUCT, name: '', price: 0, confidence: 'INSUFFICIENT_DATA' };
  }

  const catalog = matchCatalog(extracted, products);
  if (catalog && namesRelated(extracted, catalog.name)) {
    return {
      id: catalog.id,
      name: extracted.length >= catalog.name.length ? extracted : catalog.name,
      price: Number(catalog.price) || 0,
      confidence: 'HIGH',
    };
  }

  const contextText = normalize(
    (snapshot?.insights ?? []).flatMap((i) => [i.title, i.summary]).join(' '),
  );
  const contextSupports = Boolean(contextText) && namesRelated(extracted, contextText);

  return {
    id: CUSTOM_PRODUCT,
    name: extracted,
    price: 0,
    confidence: contextSupports ? 'HIGH' : 'MEDIUM',
  };
}

function extractAudienceFromText(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const demo =
    raw.match(/\b(nữ|nam)\s*\d{2}\s*[–\-]\s*\d{2}(\s*tuổi)?/i) ||
    raw.match(/\b(nữ|nam)\s+\d{2,3}\s*tuổi/i) ||
    raw.match(/\bkhách\s+(nữ|nam)\s*\d{0,2}\s*[–\-]?\s*\d{0,2}/i);
  if (demo?.[0]) return demo[0].replace(/\s+/g, ' ').trim();
  return null;
}

function relatedSegment(options: AutopilotFormOptions | undefined, seed: string) {
  const seedN = normalize(seed);
  return (options?.segments ?? []).find((s) => {
    if (s.id.startsWith('crm:')) return false;
    const n = normalize(s.name);
    if (!n) return false;
    if (!seedN) return /nữ|nam|tuổi|khách/i.test(s.name);
    return n.split(' ').some((w) => w.length > 2 && seedN.includes(w)) || seedN.split(' ').some((w) => w.length > 2 && n.includes(w));
  });
}

export function suggestCustomer(input: {
  projectName: string;
  productName: string;
  area: string;
  options?: AutopilotFormOptions;
  snapshot?: MarketingContextSnapshot | null;
}): CustomerSuggestion {
  const product =
    input.productName.trim() || extractProductFromProjectName(input.projectName);
  const place = input.area.trim() || input.options?.defaultProvince?.trim() || '';
  const fromName = extractAudienceFromText(`${input.projectName} ${input.productName}`);
  const seed = `${input.projectName} ${product}`;
  const seg =
    relatedSegment(input.options, seed) ||
    (input.snapshot?.insights ?? [])
      .map((i) => ({ id: i.id, name: i.title, source: 'context' }))
      .find((s) => /khách|nữ|nam|tuổi/i.test(s.name) && product && namesRelated(s.name, product));

  const parts: string[] = [];
  if (fromName) parts.push(fromName);
  else if (seg) parts.push(seg.name);
  else if (product) parts.push(`Khách quan tâm ${product}`);

  if (product && fromName && !normalize(fromName).includes(normalize(product))) {
    parts.push(`quan tâm ${product}`);
  } else if (product && seg && !normalize(seg.name).includes(normalize(product))) {
    if (!parts.some((p) => normalize(p).includes(normalize(product)))) {
      parts.push(`quan tâm ${product}`);
    }
  }

  if (place && !parts.join(' ').toLowerCase().includes(place.toLowerCase())) {
    parts.push(`tại ${place}`);
  }

  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!product && !fromName && !seg) {
    return { text: '', confidence: 'INSUFFICIENT_DATA' };
  }
  if (!text) {
    return { text: '', confidence: 'INSUFFICIENT_DATA' };
  }

  const confidence: SuggestionConfidence = fromName || (product && (place || seg)) ? 'HIGH' : product ? 'MEDIUM' : 'LOW';
  if (confidence === 'LOW') {
    return { text: '', confidence: 'INSUFFICIENT_DATA' };
  }
  return { text, confidence };
}

function uniqueAudienceTexts(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = normalize(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function metricsHints(snapshot?: MarketingContextSnapshot | null): string[] {
  const m = snapshot?.metrics as
    | {
        leads?: { total?: number | null; hot?: number | null; noFollowUp?: number | null };
        bookings?: { total?: number | null };
        chatbot?: { leadsCaptured?: number | null };
      }
    | undefined;
  const hints: string[] = [];
  for (const b of snapshot?.bottlenecks ?? []) {
    if (b.kind === 'crm_followup') hints.push('Lead chưa follow-up (Context V2)');
    if (b.kind === 'conversion' || b.kind === 'funnel') hints.push('Khách kẹt funnel/chuyển đổi');
  }
  for (const o of snapshot?.opportunities ?? []) {
    if (o.kind === 'hot_leads') hints.push('Lead nóng sẵn sàng chốt');
    if (o.kind === 'remarketing') hints.push('Cohort lead mới 7 ngày — remarketing');
    if (o.kind === 'chatbot') hints.push('Lead từ chatbot');
  }
  if (!m) return uniqueAudienceTexts(hints);
  if ((m.leads?.noFollowUp ?? 0) > 0) hints.push('Lead chưa follow-up');
  if ((m.leads?.hot ?? 0) > 0) hints.push('Lead nóng trong CRM');
  if ((m.bookings?.total ?? 0) > 0) hints.push('Khách đã có booking');
  if ((m.chatbot?.leadsCaptured ?? 0) > 0) hints.push('Lead từ chatbot');
  return uniqueAudienceTexts(hints);
}

/**
 * Build exactly 10 audience groups from project/product/area + CRM/context.
 * No fixed presets. Only recombine known signals; thin data → LOW confidence.
 */
export function suggestAudienceOptions(input: {
  projectName: string;
  productName: string;
  area: string;
  options?: AutopilotFormOptions;
  snapshot?: MarketingContextSnapshot | null;
}): AudienceOptionsResult {
  const product =
    input.productName.trim() || extractProductFromProjectName(input.projectName);
  const place = input.area.trim() || input.options?.defaultProvince?.trim() || '';
  const fromName = extractAudienceFromText(`${input.projectName} ${input.productName}`);
  const seed = `${input.projectName} ${product}`;

  const segments = (input.options?.segments ?? [])
    .filter((s) => !s.id.startsWith('crm:') && s.name.trim())
    .map((s) => s.name.trim());
  const relatedSegs = segments.filter((name) => {
    if (!product) return /khách|nữ|nam|tuổi|segment/i.test(name);
    return namesRelated(name, seed) || /khách|nữ|nam|tuổi/i.test(name);
  });

  const insightAudiences = (input.snapshot?.insights ?? [])
    .filter((i) => /khách|lead|audience|segment|nữ|nam|tuổi|crm/i.test(`${i.title} ${i.summary}`))
    .map((i) => i.title.trim())
    .filter(Boolean);

  const metricLabels = metricsHints(input.snapshot);
  const candidates: string[] = [];

  if (fromName && product && place) candidates.push(`${fromName}, quan tâm ${product}, tại ${place}`);
  if (fromName && product) candidates.push(`${fromName}, quan tâm ${product}`);
  if (fromName && place) candidates.push(`${fromName} tại ${place}`);
  if (fromName) candidates.push(fromName);

  if (product && place) {
    candidates.push(`Khách quan tâm ${product} tại ${place}`);
    candidates.push(`Khách mới tìm ${product} tại ${place}`);
    candidates.push(`Khách đang so sánh ${product} tại ${place}`);
  }
  if (product) {
    candidates.push(`Khách quan tâm ${product}`);
    candidates.push(`Khách từng tìm hiểu ${product}`);
  }
  if (place && product) {
    candidates.push(`Khách tại ${place} cần tư vấn ${product}`);
  } else if (place) {
    candidates.push(`Khách hàng tại ${place}`);
  }

  for (const seg of relatedSegs.slice(0, 4)) {
    if (product && !normalize(seg).includes(normalize(product))) {
      candidates.push(`${seg} — quan tâm ${product}${place ? `, tại ${place}` : ''}`);
    } else {
      candidates.push(place && !seg.includes(place) ? `${seg} tại ${place}` : seg);
    }
  }

  for (const title of insightAudiences.slice(0, 3)) {
    candidates.push(
      product && !normalize(title).includes(normalize(product))
        ? `${title} liên quan ${product}`
        : title,
    );
  }

  for (const label of metricLabels) {
    if (product && place) candidates.push(`${label} quan tâm ${product} tại ${place}`);
    else if (product) candidates.push(`${label} quan tâm ${product}`);
    else if (place) candidates.push(`${label} tại ${place}`);
    else candidates.push(label);
  }

  const unique = uniqueAudienceTexts(candidates);
  const hasCore = Boolean(product || place || fromName || relatedSegs.length || insightAudiences.length || metricLabels.length);
  if (!hasCore || unique.length === 0) {
    return { options: [], confidence: 'INSUFFICIENT_DATA' };
  }

  // Pad to 10 only by recombining known atoms — never invent demographics.
  const atoms = uniqueAudienceTexts(
    [product, place, fromName, ...relatedSegs.slice(0, 2), ...metricLabels.slice(0, 2)].filter(Boolean) as string[],
  );
  const pads: string[] = [];
  if (product && place) {
    pads.push(
      `Nhóm ưu tiên: ${product} · ${place}`,
      `Khách cân nhắc mua ${product} tại ${place}`,
      `Khách hỏi thông tin ${product} tại ${place}`,
      `Khách quay lại tìm ${product} tại ${place}`,
    );
  } else if (product) {
    pads.push(
      `Nhóm ưu tiên quanh ${product}`,
      `Khách đang tìm hiểu ${product}`,
      `Khách cần tư vấn về ${product}`,
      `Khách so sánh lựa chọn ${product}`,
    );
  } else if (place) {
    pads.push(
      `Nhóm khách tại ${place}`,
      `Khách tiềm năng tại ${place}`,
      `Khách gần khu vực ${place}`,
    );
  }
  for (const a of atoms) {
    if (product && a !== product) pads.push(`${a} + ${product}`);
  }

  const filled = uniqueAudienceTexts([...unique, ...pads]).slice(0, 10);
  while (filled.length < 10 && product) {
    const n = filled.length + 1;
    filled.push(`Nhóm ${n}: khách liên quan ${product}${place ? ` tại ${place}` : ''}`);
  }
  while (filled.length < 10 && place) {
    const n = filled.length + 1;
    filled.push(`Nhóm ${n}: khách tại ${place}`);
  }

  if (filled.length < 10) {
    return {
      options: filled.map((text, i) => ({ index: i + 1, text })),
      confidence: 'LOW',
    };
  }

  const confidence: SuggestionConfidence =
    fromName || (product && place) || relatedSegs.length > 0
      ? product && place
        ? 'HIGH'
        : 'MEDIUM'
      : 'LOW';

  return {
    options: filled.slice(0, 10).map((text, i) => ({ index: i + 1, text })),
    confidence,
  };
}

export function isActionableSuggestion(confidence: SuggestionConfidence): boolean {
  return confidence === 'HIGH' || confidence === 'MEDIUM';
}
