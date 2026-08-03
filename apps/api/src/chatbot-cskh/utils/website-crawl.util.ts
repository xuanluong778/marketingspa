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

export async function fetchAndExtractUrl(url: string): Promise<CrawlExtractResult> {
  const raw = url.trim();
  if (!raw) throw new CrawlValidationError('URL không được để trống.');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CrawlValidationError('URL không hợp lệ.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new CrawlValidationError('URL phải bắt đầu bằng http:// hoặc https://');
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
    throw new CrawlValidationError('Không quét URL nội bộ.');
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketingAutoAZ-ChatbotCrawler/1.0)' },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new CrawlFetchError(e instanceof Error ? e.message : 'Không tải được trang.');
  }

  if (!response.ok) {
    throw new CrawlFetchError(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || parsed.hostname;
  const content = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50_000);

  if (content.length < 10) {
    throw new CrawlFetchError('Không trích xuất được nội dung trang.');
  }

  return {
    pageUrl: parsed.toString().slice(0, 2000),
    title,
    content,
  };
}
