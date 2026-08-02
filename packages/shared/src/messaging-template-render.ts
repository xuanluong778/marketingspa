/**
 * Render template với fallback biến thiếu.
 * Không throw — thay bằng fallback hoặc chuỗi rỗng.
 */
export function renderTemplateWithFallbacks(
  body: string,
  context: Record<string, string | undefined>,
  fallbacks: Record<string, string> = {},
): { rendered: string; missingKeys: string[] } {
  const missingKeys: string[] = [];
  const rendered = body.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const value = context[key];
    if (value != null && String(value).trim() !== '') return String(value);
    if (fallbacks[key] != null) return String(fallbacks[key]);
    missingKeys.push(key);
    return '';
  });
  return { rendered, missingKeys: [...new Set(missingKeys)] };
}

export function previewTemplateContent(params: {
  body: string;
  context?: Record<string, string>;
  fallbacks?: Record<string, string>;
  mediaUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}): {
  text: string;
  missingKeys: string[];
  mediaUrl?: string;
  cta?: { label: string; url: string };
} {
  const { rendered, missingKeys } = renderTemplateWithFallbacks(
    params.body,
    params.context ?? {},
    params.fallbacks ?? {},
  );
  return {
    text: rendered,
    missingKeys,
    ...(params.mediaUrl ? { mediaUrl: params.mediaUrl } : {}),
    ...(params.ctaLabel && params.ctaUrl
      ? { cta: { label: params.ctaLabel, url: params.ctaUrl } }
      : {}),
  };
}
