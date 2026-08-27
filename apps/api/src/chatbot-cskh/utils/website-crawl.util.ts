import {
  assertPublicHttpUrl,
  SsrfValidationError,
  FetchPublicError,
} from '@marketingspa/shared/dist/ssrf-fetch';

export class CrawlFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrawlFetchError';
  }
}

export class CrawlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrawlValidationError';
  }
}

export type CrawlExtractResult = {
  pageUrl: string;
  title: string;
  content: string;
};

const CHUNK_SIZE = 800;
const MAX_BYTES = 50_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

export function chunkWebsiteContent(content: string): string[] {
  const text = content.trim();
  if (!text) return [];

  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 40);
  if (paragraphs.length >= 2) return paragraphs;

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks.length ? chunks : [text];
}

function extractText(html: string, fallbackHost: string): { title: string; content: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || fallbackHost;
  const content = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BYTES);
  return { title, content };
}

/**
 * Crawl public websites with shared SSRF guard (DNS + private/link-local/metadata + redirect re-check).
 */
export async function fetchAndExtractUrl(url: string): Promise<CrawlExtractResult> {
  const raw = url.trim();
  if (!raw) throw new CrawlValidationError('URL không được để trống.');

  try {
    let current = await assertPublicHttpUrl(raw, { skipCommerceHostBlock: true });
    let redirects = 0;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MarketingAutoAZ-ChatbotCrawler/1.0)',
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          },
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof Error && e.name === 'AbortError') {
          throw new CrawlFetchError('Hết thời gian chờ khi tải trang.');
        }
        throw new CrawlFetchError(e instanceof Error ? e.message : 'Không tải được trang.');
      } finally {
        clearTimeout(timer);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const loc = response.headers.get('location');
        if (!loc) throw new CrawlFetchError('Redirect thiếu Location.');
        redirects += 1;
        if (redirects > MAX_REDIRECTS) {
          throw new CrawlFetchError('Quá nhiều lần redirect.');
        }
        const next = new URL(loc, current);
        current = await assertPublicHttpUrl(next.toString(), { skipCommerceHostBlock: true });
        continue;
      }

      if (!response.ok) {
        throw new CrawlFetchError(`HTTP ${response.status}`);
      }

      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.byteLength > MAX_BYTES * 4) {
        throw new CrawlFetchError('Phản hồi quá lớn.');
      }
      const html = buf.toString('utf8');
      const { title, content } = extractText(html, current.hostname);
      if (content.length < 10) {
        throw new CrawlFetchError('Không trích xuất được nội dung trang.');
      }
      return {
        pageUrl: current.toString().slice(0, 2000),
        title,
        content,
      };
    }
  } catch (e) {
    if (e instanceof SsrfValidationError) {
      throw new CrawlValidationError(e.message);
    }
    if (e instanceof FetchPublicError) {
      throw new CrawlFetchError(e.message);
    }
    if (e instanceof CrawlFetchError || e instanceof CrawlValidationError) throw e;
    throw new CrawlFetchError(e instanceof Error ? e.message : 'Không tải được trang.');
  }
}
