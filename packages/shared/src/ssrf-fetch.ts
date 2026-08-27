/**
 * SSRF-safe public HTTP(S) fetch for ad URL analyze.
 * Blocks private/link-local/metadata IPs, dangerous schemes, oversized bodies.
 */
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import {
  AD_URL_ANALYZE_LIMITS,
  detectUnsupportedCommerceHost,
} from './ad-url-analyze';

export class SsrfValidationError extends Error {
  code: string;
  constructor(message: string, code = 'SSRF_BLOCKED') {
    super(message);
    this.name = 'SsrfValidationError';
    this.code = code;
  }
}

export class FetchPublicError extends Error {
  code: string;
  constructor(message: string, code = 'FETCH_FAILED') {
    super(message);
    this.name = 'FetchPublicError';
    this.code = code;
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    const ranges: Array<[number, number]> = [
      [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
      [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
      [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
      [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
      [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
      [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
      [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')],
      [ipv4ToInt('192.0.0.0'), ipv4ToInt('192.0.0.255')],
      [ipv4ToInt('192.0.2.0'), ipv4ToInt('192.0.2.255')],
      [ipv4ToInt('198.18.0.0'), ipv4ToInt('198.19.255.255')],
      [ipv4ToInt('198.51.100.0'), ipv4ToInt('198.51.100.255')],
      [ipv4ToInt('203.0.113.0'), ipv4ToInt('203.0.113.255')],
      [ipv4ToInt('224.0.0.0'), ipv4ToInt('255.255.255.255')],
    ];
    return ranges.some(([a, b]) => n >= a && n <= b);
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('ff')) return true; // multicast
    // IPv4-mapped
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }
  return true;
}

export type AssertPublicHttpUrlOptions = {
  /** Skip marketplace/social crawl blocklist (Facebook/TikTok/etc.). */
  skipCommerceHostBlock?: boolean;
  /** When set, hostname must pass this allowlist (after localhost/metadata checks). */
  allowHost?: (hostname: string) => boolean;
};

export async function assertPublicHttpUrl(
  raw: string,
  opts?: AssertPublicHttpUrlOptions,
): Promise<URL> {
  const trimmed = raw.trim();
  if (!trimmed) throw new SsrfValidationError('URL không được để trống.', 'EMPTY_URL');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SsrfValidationError('URL không hợp lệ.', 'INVALID_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfValidationError('Chỉ chấp nhận http:// hoặc https://.', 'BAD_SCHEME');
  }
  if (parsed.username || parsed.password) {
    throw new SsrfValidationError('URL không được chứa thông tin đăng nhập.', 'USERINFO');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new SsrfValidationError('Không cho phép localhost / tên nội bộ.', 'LOCALHOST');
  }
  if (host === 'metadata.google.internal' || host.endsWith('.internal')) {
    throw new SsrfValidationError('Không cho phép host metadata / internal.', 'METADATA');
  }

  if (opts?.allowHost && !opts.allowHost(host)) {
    throw new SsrfValidationError('Host không nằm trong danh sách được phép.', 'UNSUPPORTED_HOST');
  }

  if (!opts?.skipCommerceHostBlock) {
    const unsupported = detectUnsupportedCommerceHost(host);
    if (unsupported) {
      throw new SsrfValidationError(unsupported, 'UNSUPPORTED_HOST');
    }
  }

  // Normalize IPv6 host forms (URL may yield "::1" or occasionally bracketed).
  const ipHost = host.replace(/^\[|\]$/g, '');
  if (isIP(ipHost)) {
    if (isPrivateOrReservedIp(ipHost)) {
      throw new SsrfValidationError('Không cho phép IP nội bộ / đặc biệt.', 'PRIVATE_IP');
    }
  } else {
    let records: Array<{ address: string }>;
    try {
      records = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new SsrfValidationError('Không phân giải được tên miền.', 'DNS_FAILED');
    }
    if (!records.length) {
      throw new SsrfValidationError('Không phân giải được tên miền.', 'DNS_FAILED');
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new SsrfValidationError(
          'Tên miền trỏ tới IP nội bộ / metadata — bị chặn (SSRF).',
          'PRIVATE_IP',
        );
      }
    }
  }

  return parsed;
}

function stripHtml(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] || '')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

export type PublicHtmlFetchResult = {
  finalUrl: string;
  title: string;
  text: string;
  contentType: string;
};

/**
 * Fetch public HTML with redirect + size + timeout limits.
 * Re-validates each redirect target against SSRF rules.
 */
export async function fetchPublicHtmlSafe(
  rawUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number },
): Promise<PublicHtmlFetchResult> {
  const timeoutMs = opts?.timeoutMs ?? AD_URL_ANALYZE_LIMITS.fetchTimeoutMs;
  const maxBytes = opts?.maxBytes ?? AD_URL_ANALYZE_LIMITS.maxHtmlBytes;
  const maxRedirects = opts?.maxRedirects ?? AD_URL_ANALYZE_LIMITS.maxRedirects;

  let current = await assertPublicHttpUrl(rawUrl);
  let redirects = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarketingAutoAZ-AdUrlAnalyzer/1.0)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof Error && e.name === 'AbortError') {
        throw new FetchPublicError('Hết thời gian chờ khi tải trang.', 'TIMEOUT');
      }
      throw new FetchPublicError(
        e instanceof Error ? e.message : 'Không tải được trang.',
        'FETCH_FAILED',
      );
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const loc = response.headers.get('location');
      if (!loc) throw new FetchPublicError('Redirect thiếu Location.', 'BAD_REDIRECT');
      redirects += 1;
      if (redirects > maxRedirects) {
        throw new FetchPublicError('Quá nhiều lần redirect.', 'TOO_MANY_REDIRECTS');
      }
      const next = new URL(loc, current);
      current = await assertPublicHttpUrl(next.toString());
      continue;
    }

    if (!response.ok) {
      throw new FetchPublicError(`Máy chủ trả HTTP ${response.status}.`, 'HTTP_ERROR');
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml') &&
      !contentType.includes('text/plain')
    ) {
      throw new FetchPublicError(
        'URL không phải trang HTML công khai (ví dụ file/PDF/media).',
        'UNSUPPORTED_CONTENT',
      );
    }

    const cl = response.headers.get('content-length');
    if (cl && Number(cl) > maxBytes) {
      throw new FetchPublicError('Trang quá lớn để phân tích.', 'TOO_LARGE');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new FetchPublicError('Không đọc được nội dung trang.', 'EMPTY_BODY');

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          throw new FetchPublicError('Trang quá lớn để phân tích.', 'TOO_LARGE');
        }
        chunks.push(value);
      }
    }

    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    const { title, text } = stripHtml(html);
    if (text.length < 40) {
      throw new FetchPublicError(
        'Không trích xuất được đủ nội dung công khai từ trang (có thể bị chặn hoặc trang trống).',
        'INSUFFICIENT_CONTENT',
      );
    }

    return {
      finalUrl: current.toString(),
      title: title || current.hostname,
      text: text.slice(0, AD_URL_ANALYZE_LIMITS.maxExtractChars),
      contentType,
    };
  }
}
