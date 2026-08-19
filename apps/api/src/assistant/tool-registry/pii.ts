import {
  maskEmail,
  maskPhone,
  redactSensitiveTokenLike,
  type AssistantPiiReveal,
} from '@marketingspa/shared';

/** Apply default PII mask to shallow / nested plain objects (depth-limited). */
export function maskObjectPii(value: unknown, reveal: AssistantPiiReveal, depth = 0): unknown {
  if (depth > 6) return value;
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => maskObjectPii(v, reveal, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (/token|secret|password|authorization|apikey|access_token|page_token/.test(key)) {
      out[k] = redactSensitiveTokenLike(String(v ?? ''));
      continue;
    }
    if (!reveal.phone && /phone|mobile|tel/.test(key) && typeof v === 'string') {
      out[k] = maskPhone(v);
      continue;
    }
    if (!reveal.email && /(^email$|e_mail|email_address)/.test(key) && typeof v === 'string') {
      out[k] = maskEmail(v);
      continue;
    }
    // Free-text sensitive content (inbox previews already pre-masked; belt+suspenders)
    if (
      !reveal.phone &&
      /message|content|body|transcript|preview|note/.test(key) &&
      typeof v === 'string' &&
      v.length > 0
    ) {
      // keep as-is if short placeholder; deep mask phones inside
      out[k] = v
        .replace(/\b0\d{8,11}\b/g, (m) => maskPhone(m) ?? '****')
        .replace(/[\w.+-]+@[\w.-]+\.\w+/gi, (m) => maskEmail(m) ?? '***@***');
      continue;
    }
    if (v && typeof v === 'object') {
      out[k] = maskObjectPii(v, reveal, depth + 1);
      continue;
    }
    out[k] = v;
  }
  return out;
}
