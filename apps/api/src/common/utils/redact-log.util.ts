/** Strip credentials from log lines — never print tokens/passwords/DB URLs. */
export function redactLogText(input: unknown): string {
  const raw = typeof input === 'string' ? input : input instanceof Error ? input.message : String(input ?? '');
  return raw
    .replace(/postgres(?:ql)?:\/\/[^@\s'"]+@/gi, 'postgresql://***@')
    .replace(/redis:\/\/[^@\s'"]+@/gi, 'redis://***@')
    .replace(
      /(password|passwd|secret|token|authorization|api[_-]?key|access[_-]?key|credential)(["']?\s*[:=]\s*)([^\s&"',;]+)/gi,
      '$1$2***',
    )
    .replace(/Bearer\s+[A-Za-z0-9._\-+=/]+/gi, 'Bearer ***');
}
