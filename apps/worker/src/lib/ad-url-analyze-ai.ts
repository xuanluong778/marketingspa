/**
 * Map crawled public page text → ad form suggestion (product/service).
 * Never invent price/offer/warranty/proof/results when absent from source.
 */
import type {
  AdUrlAnalyzeProductFields,
  AdUrlAnalyzeServiceFields,
  AdUrlAnalyzeSuggestion,
} from '@marketingspa/shared';

function openaiBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
}

function nonempty(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** Sensitive claims must have literal evidence in source text (no invention). */
const EVIDENCE_REQUIRED_KEYS = new Set([
  'price',
  'offer',
  'warranty',
  'proof',
  'duration',
  'location',
  'experts',
]);

function hasSourceEvidence(source: string, value: string): boolean {
  const hay = source.toLowerCase();
  const needle = value.trim().toLowerCase();
  if (needle.length < 2) return false;
  if (hay.includes(needle)) return true;
  // Allow short numeric/currency fragments (e.g. "890.000") if digits appear
  const digits = needle.replace(/[^\d]/g, '');
  if (digits.length >= 3 && hay.replace(/[^\d]/g, '').includes(digits)) return true;
  return false;
}

function evidenceGate(
  fields: Record<string, string | undefined>,
  source: string,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...fields };
  for (const key of Object.keys(out)) {
    if (!EVIDENCE_REQUIRED_KEYS.has(key)) continue;
    const v = out[key];
    if (v && !hasSourceEvidence(source, v)) {
      out[key] = undefined;
    }
  }
  return out;
}

function pickPresent(
  obj: Record<string, string | undefined>,
  prefix: string,
): { fields: Record<string, string>; present: string[]; omitted: string[] } {
  const fields: Record<string, string> = {};
  const present: string[] = [];
  const omitted: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}.${k}`;
    if (v) {
      fields[k] = v;
      present.push(key);
    } else {
      omitted.push(key);
    }
  }
  return { fields, present, omitted };
}

function templateMap(input: {
  adPostKind: 'product' | 'service';
  title: string;
  text: string;
  finalUrl: string;
  brandName?: string;
}): AdUrlAnalyzeSuggestion {
  const snippet = input.text.slice(0, 400);
  const name = input.title.slice(0, 120) || undefined;
  const warnings = [
    'Phân tích template (không có OpenAI) — chỉ điền tên/tiêu đề an toàn; không bịa giá/ưu đãi/bảo hành.',
  ];

  if (input.adPostKind === 'product') {
    const product: AdUrlAnalyzeProductFields = {
      name,
      features: undefined,
      benefits: undefined,
      differentiators: undefined,
      price: undefined,
      warranty: undefined,
      proof: undefined,
      offer: undefined,
      category: undefined,
    };
    const picked = pickPresent(product as Record<string, string | undefined>, 'product');
    return {
      adPostKind: 'product',
      brandName: nonempty(input.brandName),
      product: picked.fields,
      presentFields: picked.present,
      omittedFields: [
        ...picked.omitted,
        'targetAudience',
        'painPoints',
        'benefits',
        'offer',
      ],
      warnings,
      pageTitle: input.title,
      finalUrl: input.finalUrl,
      confidence: 0.2,
    };
  }

  const service: AdUrlAnalyzeServiceFields = {
    name,
    suitableCustomers: undefined,
    problems: undefined,
    process: undefined,
    highlights: undefined,
    expectedBenefits: undefined,
    duration: undefined,
    location: undefined,
    experts: undefined,
    proof: undefined,
    offer: undefined,
  };
  const picked = pickPresent(service as Record<string, string | undefined>, 'service');
  return {
    adPostKind: 'service',
    brandName: nonempty(input.brandName),
    service: picked.fields,
    presentFields: picked.present,
    omittedFields: picked.omitted,
    warnings: [...warnings, `Đoạn trích: ${snippet.slice(0, 120)}…`],
    pageTitle: input.title,
    finalUrl: input.finalUrl,
    confidence: 0.2,
  };
}

export async function analyzeAdUrlContent(input: {
  adPostKind: 'product' | 'service';
  title: string;
  text: string;
  finalUrl: string;
  brandName?: string;
}): Promise<AdUrlAnalyzeSuggestion> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return templateMap(input);

  const kind = input.adPostKind;
  const prompt =
    kind === 'product'
      ? `Bạn là trợ lý điền form quảng cáo sản phẩm. Chỉ lấy thông tin CÓ trong nguồn.
CẤM bịa: giá, ưu đãi, bảo hành, chứng nhận, số liệu kết quả nếu nguồn không nêu rõ.
Nếu không chắc → để null và ghi vào omittedFields.

Nguồn URL: ${input.finalUrl}
Tiêu đề: ${input.title}
Thương hiệu gợi ý sẵn: ${input.brandName || ''}
Nội dung:
"""
${input.text.slice(0, 10000)}
"""

Trả JSON thuần:
{
  "brandName": string|null,
  "targetAudience": string|null,
  "painPoints": string|null,
  "benefits": string|null,
  "offer": string|null,
  "product": {
    "name": string|null,
    "category": string|null,
    "features": string|null,
    "benefits": string|null,
    "differentiators": string|null,
    "price": string|null,
    "warranty": string|null,
    "proof": string|null,
    "offer": string|null
  },
  "presentFields": ["product.name", ...],
  "omittedFields": [...],
  "warnings": ["..."],
  "confidence": 0.0
}`
      : `Bạn là trợ lý điền form quảng cáo dịch vụ. Chỉ lấy thông tin CÓ trong nguồn.
CẤM bịa: giá, ưu đãi, chứng nhận, thời gian, địa điểm, chuyên gia, kết quả nếu nguồn không nêu rõ.
Nếu không chắc → để null và ghi vào omittedFields.

Nguồn URL: ${input.finalUrl}
Tiêu đề: ${input.title}
Thương hiệu gợi ý sẵn: ${input.brandName || ''}
Nội dung:
"""
${input.text.slice(0, 10000)}
"""

Trả JSON thuần:
{
  "brandName": string|null,
  "targetAudience": string|null,
  "painPoints": string|null,
  "benefits": string|null,
  "offer": string|null,
  "service": {
    "name": string|null,
    "suitableCustomers": string|null,
    "problems": string|null,
    "process": string|null,
    "highlights": string|null,
    "expectedBenefits": string|null,
    "duration": string|null,
    "location": string|null,
    "experts": string|null,
    "proof": string|null,
    "offer": string|null
  },
  "presentFields": ["service.name", ...],
  "omittedFields": [...],
  "warnings": ["..."],
  "confidence": 0.0
}`;

  try {
    const res = await fetch(`${openaiBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return {
        ...templateMap(input),
        warnings: [
          ...templateMap(input).warnings,
          `AI lỗi HTTP ${res.status} — dùng fallback an toàn (không bịa giá/ưu đãi).`,
        ],
      };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Record<string, unknown>;

    const sourceBlob = `${input.title}\n${input.text}`;

    if (kind === 'product') {
      const p = (parsed.product || {}) as Record<string, unknown>;
      const productRaw: AdUrlAnalyzeProductFields = {
        name: nonempty(p.name) || nonempty(input.title),
        category: nonempty(p.category),
        features: nonempty(p.features),
        benefits: nonempty(p.benefits),
        differentiators: nonempty(p.differentiators),
        price: nonempty(p.price),
        warranty: nonempty(p.warranty),
        proof: nonempty(p.proof),
        offer: nonempty(p.offer),
      };
      const product = evidenceGate(
        productRaw as Record<string, string | undefined>,
        sourceBlob,
      ) as AdUrlAnalyzeProductFields;
      const picked = pickPresent(product as Record<string, string | undefined>, 'product');
      const topOffer = nonempty(parsed.offer);
      const gatedOffer =
        topOffer && hasSourceEvidence(sourceBlob, topOffer) ? topOffer : product.offer;
      return {
        adPostKind: 'product',
        brandName: nonempty(parsed.brandName) || nonempty(input.brandName),
        targetAudience: nonempty(parsed.targetAudience),
        painPoints: nonempty(parsed.painPoints),
        benefits: nonempty(parsed.benefits) || product.benefits,
        offer: gatedOffer,
        product: picked.fields,
        presentFields: picked.present,
        omittedFields: picked.omitted,
        warnings: [
          ...(Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : []),
          'Đã lọc giá/ưu đãi/bảo hành/chứng nhận nếu không có bằng chứng trong nguồn.',
        ],
        pageTitle: input.title,
        finalUrl: input.finalUrl,
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
      };
    }

    const s = (parsed.service || {}) as Record<string, unknown>;
    const serviceRaw: AdUrlAnalyzeServiceFields = {
      name: nonempty(s.name) || nonempty(input.title),
      suitableCustomers: nonempty(s.suitableCustomers),
      problems: nonempty(s.problems),
      process: nonempty(s.process),
      highlights: nonempty(s.highlights),
      expectedBenefits: nonempty(s.expectedBenefits),
      duration: nonempty(s.duration),
      location: nonempty(s.location),
      experts: nonempty(s.experts),
      proof: nonempty(s.proof),
      offer: nonempty(s.offer),
    };
    const service = evidenceGate(
      serviceRaw as Record<string, string | undefined>,
      sourceBlob,
    ) as AdUrlAnalyzeServiceFields;
    const picked = pickPresent(service as Record<string, string | undefined>, 'service');
    const topOffer = nonempty(parsed.offer);
    const gatedOffer =
      topOffer && hasSourceEvidence(sourceBlob, topOffer) ? topOffer : service.offer;
    return {
      adPostKind: 'service',
      brandName: nonempty(parsed.brandName) || nonempty(input.brandName),
      targetAudience: nonempty(parsed.targetAudience) || service.suitableCustomers,
      painPoints: nonempty(parsed.painPoints) || service.problems,
      benefits: nonempty(parsed.benefits) || service.expectedBenefits,
      offer: gatedOffer,
      service: picked.fields,
      presentFields: picked.present,
      omittedFields: picked.omitted,
      warnings: [
        ...(Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : []),
        'Đã lọc ưu đãi/chứng nhận/thời gian/địa điểm nếu không có bằng chứng trong nguồn.',
      ],
      pageTitle: input.title,
      finalUrl: input.finalUrl,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
    };
  } catch {
    return templateMap(input);
  }
}
