import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { CrawlValidationError } from '../../chatbot-cskh/utils/website-crawl.util';
import { decryptSecret } from '../../common/utils/encryption.util';
import { assertPublicHttpUrl, fetchPublicHtmlSafe } from './facebook-policy-ssrf-fetch';
import { detectPolicyUrlKind, parseFacebookContentUrl } from './facebook-policy-url-parse';
import type {
  FacebookPolicyImportResult,
  FacebookPolicyUrlKind,
  LandingSignals,
} from './facebook-policy.types';

export function analyzeLandingSignals(html: string, text: string): LandingSignals {
  const blob = `${html}\n${text}`;
  const lower = blob.toLowerCase();

  const productHints: string[] = [];
  const productMatch = blob.match(/sản phẩm\s*[:：]?\s*([^\n<.!]{3,80})/i);
  if (productMatch?.[1]) productHints.push(productMatch[1].trim());
  const nameHints = blob.match(
    /\b([A-ZÀ-Ỹ][\wÀ-ỹ]+(?:\s+[A-ZÀ-Ỹ\wÀ-ỹ]+){0,4})\s+(Pro|Plus|Max)\b/,
  );
  if (nameHints?.[0]) productHints.push(nameHints[0].trim());

  const priceHints: string[] = [];
  const priceRe = /(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:đ|vnd|vnđ|₫)/gi;
  let m: RegExpExecArray | null;
  while ((m = priceRe.exec(blob)) && priceHints.length < 5) {
    priceHints.push(m[0]);
  }

  const ctaHints: string[] = [];
  for (const c of ['mua ngay', 'đặt hàng', 'inbox', 'liên hệ', 'đăng ký']) {
    if (lower.includes(c)) ctaHints.push(c);
  }

  const hasSensitiveForm =
    /type\s*=\s*["']password["']/i.test(html) ||
    /\bcvv\b/i.test(blob) ||
    /số\s*thẻ|so the|otp ngân hàng|otp ngan hang/i.test(blob);

  const phishingSignals: string[] = [];
  if (/otp\s*ngân\s*hàng|otp ngan hang/i.test(blob)) phishingSignals.push('otp_bank');
  if (/paypal/i.test(blob) && /xác minh|xac minh|otp/i.test(blob)) {
    phishingSignals.push('paypal_verify');
  }
  if (/nhập\s*mật\s*khẩu\s*ngân\s*hàng/i.test(blob)) phishingSignals.push('bank_password');

  return {
    productHints,
    priceHints,
    ctaHints,
    hasSensitiveForm,
    phishingSignals,
  };
}

/** Extract caption / description from Facebook public HTML (no token logging). */
export function extractFacebookCaptionFromHtml(html: string): {
  title?: string;
  text: string;
} {
  const decodeEntities = (s: string) =>
    s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();

  const decodeJsonString = (raw: string): string => {
    try {
      return JSON.parse(`"${raw}"`) as string;
    } catch {
      return decodeEntities(
        raw
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
      );
    }
  };

  const candidates: string[] = [];
  const patterns: RegExp[] = [
    /"message"\s*:\s*\{\s*"__typename"\s*:\s*"TextWithEntities"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)+)"/,
    /"message"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)+)"/,
    /"story_message"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)+)"/,
    /property=["']og:description["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+property=["']og:description["']/i,
    /name=["']description["']\s+content=["']([^"']+)["']/i,
    /<p[^>]*>([\s\S]*?)<\/p>/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const decoded = decodeEntities(decodeJsonString(m[1]).replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (decoded.length >= 8) candidates.push(decoded);
    }
  }

  candidates.sort((a, b) => b.length - a.length);
  let text = (candidates[0] || '').slice(0, 8000);

  // Reject login walls / unavailable notices as "content"
  if (
    /đăng nhập vào facebook|log in to facebook|hãy đăng nhập|bài viết này trên facebook không còn|không còn nữa vì có thể đã bị gỡ|privacy/i.test(
      text,
    )
  ) {
    text = '';
  }

  return {
    title: title && title !== 'Facebook' && !/đăng nhập|log in/i.test(title)
      ? title.slice(0, 200)
      : undefined,
    text,
  };
}

function normalizeVanity(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

async function findPostInPageFeed(params: {
  pageId: string;
  token: string;
  contentId?: string;
  sourceUrl: string;
}): Promise<{
  id: string;
  message: string;
  permalink_url?: string;
  full_picture?: string;
} | null> {
  const needle = (params.contentId || '').trim();
  if (!needle) return null;

  for (const edge of ['posts', 'published_posts'] as const) {
    let next: string | null =
      `https://graph.facebook.com/v19.0/${encodeURIComponent(params.pageId)}/${edge}` +
      `?fields=${encodeURIComponent('id,message,story,permalink_url,full_picture,created_time')}` +
      `&limit=50&access_token=${encodeURIComponent(params.token)}`;
    let pages = 0;
    while (next && pages < 10) {
      pages += 1;
      try {
        const res = await fetch(next, { signal: AbortSignal.timeout(12_000) });
        const data = (await res.json()) as {
          data?: Array<{
            id?: string;
            message?: string;
            story?: string;
            permalink_url?: string;
            full_picture?: string;
          }>;
          paging?: { next?: string };
          error?: { message?: string };
        };
        if (!res.ok || data.error) break;
        for (const row of data.data || []) {
          const per = row.permalink_url || '';
          const id = row.id || '';
          const text = (row.message || row.story || '').trim();
          if (!text) continue;
          if (
            per.includes(needle) ||
            id.includes(needle) ||
            params.sourceUrl.includes(id.split('_').pop() || '___')
          ) {
            return {
              id,
              message: text,
              permalink_url: row.permalink_url,
              full_picture: row.full_picture,
            };
          }
        }
        next = data.paging?.next || null;
      } catch {
        break;
      }
    }
  }
  return null;
}

async function detectFacebookUnavailableNotice(url: string): Promise<string | null> {
  try {
    const plugin =
      'https://www.facebook.com/plugins/post.php?href=' +
      encodeURIComponent(url) +
      '&show_text=true&width=500';
    await assertPublicHttpUrl(plugin);
    const fetched = await fetchPublicHtmlSafe(plugin, {
      timeoutMs: 10_000,
      maxBytes: 500_000,
      maxRedirects: 3,
      userAgent: 'Mozilla/5.0 (compatible; MarketingAutoAZ-PolicyImporter/1.0)',
    });
    const plain = fetched.text.replace(/\s+/g, ' ').trim();
    if (/không còn nữa|không còn tồn tại|no longer available|privacy/i.test(plain)) {
      return 'Bài viết không còn hoặc đã đổi quyền riêng tư trên Facebook.';
    }
  } catch {
    /* ignore */
  }
  return null;
}

type ImportCtx = {
  url: string;
  urlKind?: FacebookPolicyUrlKind | string;
  fanpageId?: string;
  userId: string;
  organizationId: string;
  prisma:
    | PrismaService
    | {
        autoPostFacebookPage: {
          findMany: (args: unknown) => Promise<unknown>;
        };
      };
  config: ConfigService | { get: (k: string) => string | undefined };
};

type PageToken = {
  pageId: string;
  pageName: string;
  token: string;
  scopes: string[];
};

function appAccessToken(config: ImportCtx['config']): string | null {
  const id = (config.get('META_APP_ID') || config.get('FACEBOOK_APP_ID') || '').trim();
  const secret = (config.get('META_APP_SECRET') || config.get('FACEBOOK_APP_SECRET') || '').trim();
  if (!id || !secret) return null;
  return `${id}|${secret}`;
}

async function graphJson(
  pathAndQuery: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  // Never log token
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const url = `https://graph.facebook.com/v19.0${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return null;
    if (data && typeof data === 'object' && data.error) return null;
    return data;
  } catch {
    return null;
  }
}

function textFromGraph(data: Record<string, unknown> | null): {
  primaryText: string;
  headline?: string;
  permalink?: string;
  thumbnailUrl?: string;
} {
  if (!data) return { primaryText: '' };
  const og = data.og_object as { description?: string; title?: string } | undefined;
  const primaryText = String(
    data.message || data.story || og?.description || data.description || '',
  ).trim();
  return {
    primaryText,
    headline: String(og?.title || data.name || '').trim() || undefined,
    permalink: typeof data.permalink_url === 'string' ? data.permalink_url : undefined,
    thumbnailUrl:
      typeof data.full_picture === 'string'
        ? data.full_picture
        : typeof data.picture === 'string'
          ? data.picture
          : undefined,
  };
}

async function loadOrgPages(ctx: ImportCtx): Promise<{
  pages: PageToken[];
  warnings: string[];
  hadRows: boolean;
}> {
  const warnings: string[] = [];
  const encryptionKey = ctx.config.get('ENCRYPTION_KEY') || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (ctx.prisma as any).autoPostFacebookPage.findMany({
    where: {
      connection: { organizationId: ctx.organizationId },
      ...(ctx.fanpageId ? { pageId: ctx.fanpageId } : {}),
    },
    include: { connection: true },
    take: 20,
  })) as Array<{
    pageId: string;
    pageName: string | null;
    encryptedPageAccessToken: string;
    connection?: { organizationId: string; scopes?: string[] | null };
  }>;

  const pages: PageToken[] = [];
  for (const row of rows) {
    const scopes = Array.isArray(row.connection?.scopes) ? row.connection!.scopes! : [];
    try {
      if (!encryptionKey || encryptionKey.length < 16) {
        warnings.push('ENCRYPTION_KEY chưa cấu hình — không giải mã token.');
        continue;
      }
      const token = decryptSecret(row.encryptedPageAccessToken, encryptionKey).trim();
      if (!token) continue;
      pages.push({
        pageId: row.pageId,
        pageName: row.pageName || row.pageId,
        token,
        scopes,
      });
    } catch {
      warnings.push('Không giải mã được page token (bỏ qua page).');
    }
  }
  return { pages, warnings, hadRows: rows.length > 0 };
}

async function importFacebookPublicHtml(
  url: string,
  kind: FacebookPolicyUrlKind,
  warnings: string[],
): Promise<FacebookPolicyImportResult | null> {
  try {
    await assertPublicHttpUrl(url);
    const fetched = await fetchPublicHtmlSafe(url, {
      userAgent:
        'Mozilla/5.0 (compatible; MarketingAutoAZ-PolicyImporter/1.0; +https://marketingautoaz.com)',
      timeoutMs: 14_000,
      maxBytes: 2_000_000,
      maxRedirects: 4,
    });
    const extracted = extractFacebookCaptionFromHtml(fetched.html);
    let primaryText = (extracted.text || '').trim().slice(0, 8000);
    if (
      primaryText.length < 12 &&
      fetched.text.trim().length >= 40 &&
      !/đăng nhập|log in to facebook|không còn nữa/i.test(fetched.text)
    ) {
      primaryText = fetched.text.trim().slice(0, 8000);
    }
    if (primaryText.length < 12) {
      warnings.push('HTML Facebook không chứa được caption công khai.');
      return null;
    }
    return {
      sourceType: kind,
      url,
      finalUrl: fetched.finalUrl,
      editable: true,
      headline: extracted.title || fetched.title.slice(0, 200),
      primaryText,
      warnings: [...warnings, 'Đã lấy nội dung từ trang công khai (không dùng token).'],
      insufficientData: false,
      statusHint: 'OK',
    };
  } catch (e) {
    warnings.push(
      e instanceof Error ? `Public fetch: ${e.message}` : 'Public fetch Facebook thất bại',
    );
    return null;
  }
}

async function importFacebookViaGraph(
  ctx: ImportCtx,
  kind: FacebookPolicyUrlKind,
): Promise<FacebookPolicyImportResult> {
  const warnings: string[] = [];
  const parsed = parseFacebookContentUrl(ctx.url);
  const { pages, warnings: loadWarn, hadRows } = await loadOrgPages(ctx);
  warnings.push(...loadWarn);

  const usable = pages.filter(
    (p) =>
      p.scopes.length === 0 ||
      p.scopes.some((s) => /pages_read|pages_manage|page/i.test(String(s))),
  );

  const tokens: Array<{ label: string; token: string; pageId?: string; pageName?: string }> = [];
  const appTok = appAccessToken(ctx.config);
  if (appTok) tokens.push({ label: 'app', token: appTok });

  const vanity = (parsed?.pageHint || '').toLowerCase();
  const vanityNorm = normalizeVanity(vanity);
  const ordered = [...usable].sort((a, b) => {
    const score = (p: PageToken) => {
      if (ctx.fanpageId && p.pageId === ctx.fanpageId) return 0;
      if (vanity && p.pageId === vanity) return 0;
      const nameNorm = normalizeVanity(p.pageName);
      if (vanityNorm && nameNorm === vanityNorm) return 0;
      if (vanityNorm && nameNorm.includes(vanityNorm)) return 1;
      return 5;
    };
    return score(a) - score(b);
  });
  for (const p of ordered) {
    tokens.push({ label: 'page', token: p.token, pageId: p.pageId, pageName: p.pageName });
  }

  let resolvedPageId: string | undefined;
  if (vanity && tokens.length) {
    for (const t of tokens) {
      const meta = await graphJson(
        `/${encodeURIComponent(vanity)}?fields=id,name,username`,
        t.token,
      );
      if (meta && typeof meta.id === 'string') {
        resolvedPageId = meta.id;
        break;
      }
    }
  }
  if (resolvedPageId) {
    ordered.sort((a, b) => Number(a.pageId !== resolvedPageId) - Number(b.pageId !== resolvedPageId));
  }

  // 1) Search posts/published_posts on connected Fanpage (best for pfbid + numeric)
  for (const p of ordered) {
    const hit = await findPostInPageFeed({
      pageId: p.pageId,
      token: p.token,
      contentId: parsed?.contentId,
      sourceUrl: ctx.url,
    });
    if (hit?.message) {
      return {
        sourceType: kind,
        url: ctx.url,
        finalUrl: hit.permalink_url || ctx.url,
        editable: true,
        primaryText: hit.message,
        permalink: hit.permalink_url,
        thumbnailUrl: hit.full_picture,
        pageId: p.pageId,
        pageName: p.pageName,
        warnings,
        insufficientData: false,
        statusHint: 'OK',
      };
    }
  }

  // 2) Direct Graph object for numeric ids
  const objectCandidates = [
    parsed?.contentId && /^\d+$/.test(parsed.contentId) ? parsed.contentId : undefined,
    resolvedPageId && parsed?.contentId && /^\d+$/.test(parsed.contentId)
      ? `${resolvedPageId}_${parsed.contentId}`
      : undefined,
    ordered[0]?.pageId && parsed?.contentId && /^\d+$/.test(parsed.contentId)
      ? `${ordered[0].pageId}_${parsed.contentId}`
      : undefined,
  ].filter(Boolean) as string[];

  for (const objectId of objectCandidates) {
    for (const t of tokens) {
      const data = await graphJson(
        `/${encodeURIComponent(objectId)}?fields=${encodeURIComponent(
          'message,story,permalink_url,full_picture,name',
        )}`,
        t.token,
      );
      const extracted = textFromGraph(data);
      if (extracted.primaryText.length >= 8) {
        return {
          sourceType: kind,
          url: ctx.url,
          finalUrl: extracted.permalink || ctx.url,
          editable: true,
          headline: extracted.headline,
          primaryText: extracted.primaryText,
          permalink: extracted.permalink,
          thumbnailUrl: extracted.thumbnailUrl,
          pageId: t.pageId || resolvedPageId,
          pageName: t.pageName,
          warnings,
          insufficientData: false,
          statusHint: 'OK',
        };
      }
    }
  }

  // 3) Public HTML fallback
  const publicHit = await importFacebookPublicHtml(ctx.url, kind, warnings);
  if (publicHit) return publicHit;

  const unavailable = await detectFacebookUnavailableNotice(ctx.url);
  if (unavailable) warnings.push(unavailable);

  if (!hadRows) {
    return {
      sourceType: kind,
      url: ctx.url,
      editable: true,
      warnings: [
        ...warnings,
        'Chưa kết nối Fanpage OAuth — kết nối đúng Fanpage của bài hoặc dán caption thủ công.',
      ],
      insufficientData: true,
      statusHint: 'PERMISSION_REQUIRED',
      message: 'PERMISSION_REQUIRED: thiếu Fanpage OAuth / token',
    };
  }

  if (!usable.length) {
    return {
      sourceType: kind,
      url: ctx.url,
      editable: true,
      warnings: [
        ...warnings,
        'Fanpage có bản ghi nhưng thiếu token hợp lệ / scope — dán caption thủ công.',
      ],
      insufficientData: true,
      statusHint: 'PERMISSION_REQUIRED',
      message: 'PERMISSION_REQUIRED: token Fanpage không dùng được',
    };
  }

  return {
    sourceType: kind,
    url: ctx.url,
    editable: true,
    pageId: ordered[0]?.pageId || resolvedPageId,
    pageName: ordered[0]?.pageName,
    warnings: [
      ...warnings,
      resolvedPageId
        ? `Đã khớp Fanpage (${resolvedPageId}) nhưng không tìm thấy bài trong posts đã xuất bản (URL/pfbid có thể đã gỡ hoặc đổi quyền riêng tư).`
        : 'Không tìm thấy bài trên Fanpage đã kết nối.',
      'Hãy dán caption vào “Nội dung chính”, hoặc dùng permalink dạng /posts/<số> của bài còn hiển thị trên Fanpage.',
    ],
    insufficientData: true,
    statusHint: 'INSUFFICIENT_DATA',
    message:
      unavailable ||
      'INSUFFICIENT_DATA: không lấy được nội dung Facebook từ URL — dán caption thủ công',
  };
}

export async function importPolicyUrl(ctx: ImportCtx): Promise<FacebookPolicyImportResult> {
  const kind = detectPolicyUrlKind(ctx.url, ctx.urlKind);

  if (kind.startsWith('facebook_')) {
    return importFacebookViaGraph(ctx, kind);
  }

  try {
    await assertPublicHttpUrl(ctx.url);
    const fetched = await fetchPublicHtmlSafe(ctx.url);
    const landing = analyzeLandingSignals(fetched.html, fetched.text);
    const primaryText = fetched.text.slice(0, 6000);
    return {
      sourceType: kind === 'landing_page' ? 'landing_page' : 'website',
      url: ctx.url,
      finalUrl: fetched.finalUrl,
      editable: true,
      headline: fetched.title.slice(0, 200),
      primaryText,
      warnings: primaryText.length < 40 ? ['Nội dung trang khá ngắn.'] : [],
      insufficientData: primaryText.length < 40,
      statusHint: primaryText.length < 40 ? 'INSUFFICIENT_DATA' : 'OK',
      message:
        primaryText.length < 40
          ? 'INSUFFICIENT_DATA: trang không đủ nội dung công khai'
          : undefined,
      landing,
    };
  } catch (e) {
    if (e instanceof CrawlValidationError) throw e;
    return {
      sourceType: kind,
      url: ctx.url,
      editable: true,
      warnings: [e instanceof Error ? e.message : 'Import thất bại'],
      insufficientData: true,
      statusHint: 'INSUFFICIENT_DATA',
      message: 'INSUFFICIENT_DATA: không import được URL',
    };
  }
}
