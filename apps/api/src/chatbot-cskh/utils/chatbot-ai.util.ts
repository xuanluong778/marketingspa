import type { ChatbotBot, ChatbotKnowledgeSource } from '@marketingspa/database';
import {
  AI_FRIENDLY_ERROR,
  CREDIT_EXHAUSTED_MESSAGE,
  LEAD_KEYWORDS,
  NO_DATA_REPLY,
  defaultGreeting,
} from './chatbot-constants';

export interface KnowledgeChunk {
  sourceId: string;
  title: string;
  sourceType: string;
  content: string;
  score: number;
}

export interface AiReplyResult {
  reply: string;
  usedAi: boolean;
  showLead: boolean;
  noData: boolean;
  blockedCode?: string;
}

export interface OrgSettings {
  model: string;
  temperature: number;
  systemPrompt?: string | null;
  fallbackReply?: string | null;
}

/** Fanpage / kênh đang trả lời — tách brand khỏi bot dùng chung nhiều page. */
export interface ChannelContext {
  pageId?: string;
  pageName?: string;
  channel?: string;
}

function foldBrand(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeSpaBrand(s: string): boolean {
  return /suong\s*spa|\bspa\b|tham my|massage|nail|goi dau/.test(foldBrand(s));
}

function looksLikeDigiBrand(s: string): boolean {
  return /the\s*gioi\s*digi|thegioidigi|\bdigi\b|seo coaching|digital marketing/.test(
    foldBrand(s),
  );
}

/**
 * Brand identity theo Fanpage + KB — không để bot "Sương Spa" ghi đè page Digi.
 */
export function resolveChannelBrand(params: {
  bot: ChatbotBot;
  channel?: ChannelContext | null;
  ragChunks?: Array<KnowledgeChunk & { knowledgeBaseName?: string }>;
}): {
  businessName: string;
  industry: string;
  suppressConflictingBotProfile: boolean;
  /** Chặn nội dung spa lẫn vào Fanpage/KB Digi */
  blockSpaBleed: boolean;
} {
  const pageName = (params.channel?.pageName || '').replace(/\s+/g, ' ').trim();
  const kbName = (
    params.ragChunks?.find((c) => c.knowledgeBaseName)?.knowledgeBaseName ||
    params.ragChunks?.[0]?.title?.split('·')[0] ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim();

  const pageIsDigi = looksLikeDigiBrand(pageName) || looksLikeDigiBrand(kbName);
  const botIsSpa = looksLikeSpaBrand(params.bot.businessName || '') || looksLikeSpaBrand(params.bot.botName || '');
  const suppress = pageIsDigi && botIsSpa;

  const businessName = suppress
    ? pageName || kbName || 'Thế Giới DIGI'
    : pageName || params.bot.businessName || params.bot.botName || 'doanh nghiệp';

  let industry = (params.bot.industry || '').trim();
  if (suppress || (looksLikeSpaBrand(industry) && pageIsDigi)) {
    industry = 'digital marketing / SEO / website';
  }
  if (!industry) industry = 'dịch vụ';

  return {
    businessName,
    industry,
    suppressConflictingBotProfile: suppress,
    blockSpaBleed: pageIsDigi,
  };
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function searchKnowledge(
  sources: ChatbotKnowledgeSource[],
  query: string,
  limit = 5,
): KnowledgeChunk[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const scored: Array<{ score: number; row: ChatbotKnowledgeSource }> = [];
  for (const row of sources) {
    if (!['ready', 'active'].includes(row.status)) continue;
    const hay = `${row.title} ${row.content ?? ''} ${row.url ?? ''}`.toLowerCase();
    const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
    if (score > 0) scored.push({ score, row });
  }

  scored.sort((a, b) => b.score - a.score || (b.row.content?.length ?? 0) - (a.row.content?.length ?? 0));

  return scored.slice(0, limit).map(({ score, row }) => ({
    sourceId: row.id,
    title: row.title,
    sourceType: row.sourceType,
    content: (row.content ?? '').slice(0, 4000),
    score,
  }));
}

function botProfileContext(
  bot: ChatbotBot,
  brand?: { businessName: string; industry: string; suppressConflictingBotProfile: boolean },
  channel?: ChannelContext | null,
): string {
  const parts: string[] = [];
  const business = brand?.businessName || bot.businessName || bot.botName;
  if (business) parts.push(`Tên doanh nghiệp: ${business}`);
  if (channel?.pageName) parts.push(`Fanpage đang trả lời: ${channel.pageName.replace(/\s+/g, ' ').trim()}`);
  const industry = brand?.industry || bot.industry;
  if (industry) parts.push(`Ngành nghề: ${industry}`);

  // Khi Fanpage/KB Digi khác brand bot Spa — không inject profile Spa (tránh trả lời nhầm tenant/brand)
  if (brand?.suppressConflictingBotProfile) {
    return parts.join('\n');
  }

  if (bot.hotline) parts.push(`Hotline: ${bot.hotline}`);
  if (bot.mainServices) parts.push(`Dịch vụ chính: ${bot.mainServices}`);
  if (bot.websiteUrl) parts.push(`Website: ${bot.websiteUrl}`);
  return parts.join('\n');
}

function isGreetingOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40) return false;
  return /^(xin\s*chào|chào|hello|hi|hey)\b/i.test(t);
}

function profileMatchesQuery(profileText: string, query: string): boolean {
  if (!profileText.trim()) return false;
  const qlow = query.toLowerCase();
  const hints = ['liên hệ', 'hotline', 'gọi', 'sđt', 'sdt', 'zalo', 'dịch vụ', 'làm gì', 'cung cấp', 'website'];
  if (hints.some((h) => qlow.includes(h))) return true;
  const tokens = tokenize(query);
  const low = profileText.toLowerCase();
  return tokens.some((t) => low.includes(t));
}

function shouldShowLead(userText: string, reply: string): boolean {
  if (reply.includes(NO_DATA_REPLY)) return true;
  const low = `${userText} ${reply}`.toLowerCase();
  return LEAD_KEYWORDS.some((k) => low.includes(k));
}

function knowledgeContext(chunks: KnowledgeChunk[]): string {
  if (!chunks.length) return '';
  return chunks
    .map((ch, i) => {
      const tag = ch.sourceType === 'RAG_KB' ? 'KB' : ch.sourceType;
      return `[Nguồn ${i + 1} · ${tag}: ${ch.title}]\n${ch.content}`;
    })
    .join('\n\n')
    .slice(0, 12000);
}

function mergeKnowledgeChunks(
  preferred: KnowledgeChunk[],
  secondary: KnowledgeChunk[],
  limit = 8,
): KnowledgeChunk[] {
  const seen = new Set<string>();
  const out: KnowledgeChunk[] = [];
  for (const ch of [...preferred, ...secondary]) {
    const key = `${ch.sourceId}:${ch.content.slice(0, 64)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ch);
    if (out.length >= limit) break;
  }
  return out;
}

function buildSystemPrompt(
  knowledgeText: string,
  profileText: string,
  customPrompt: string,
  hasKbHits: boolean,
  brand: { businessName: string; industry: string; suppressConflictingBotProfile: boolean },
): string {
  const business = brand.businessName.trim() || 'doanh nghiệp';
  const industry = brand.industry.trim() || 'dịch vụ';
  const dataBlock =
    [profileText && `=== THÔNG TIN DOANH NGHIỆP ===\n${profileText}`, knowledgeText && `=== NGUỒN DỮ LIỆU (ưu tiên KB) ===\n${knowledgeText}`]
      .filter(Boolean)
      .join('\n\n') || '(Chưa có dữ liệu)';

  const kbRule = hasKbHits
    ? `Hệ thống ĐÃ tìm thấy Knowledge Base liên quan của ĐÚNG Fanpage/thương hiệu đang trả lời.
BẮT BUỘC trả lời dựa trên khối NGUỒN DỮ LIỆU (liệt kê dịch vụ / thông tin có trong KB).
KHÔNG được trả lời câu «${NO_DATA_REPLY}» khi đã có NGUỒN DỮ LIỆU.
KHÔNG dùng kiến thức hay thương hiệu khác (ví dụ spa/thẩm mỹ nếu Fanpage là digital marketing).
Nếu KB chỉ có một phần thông tin, trả lời phần có và mời để lại SĐT để tư vấn thêm.`
    : `Chỉ khi khối NGUỒN DỮ LIỆU trống hoặc hoàn toàn không liên quan, trả lời chính xác: «${NO_DATA_REPLY}»`;

  let base = `Bạn là nhân viên CSKH của ${business}.
Trả lời ngắn gọn, tối đa 4-6 câu, chỉ dựa trên dữ liệu bên dưới.
Ưu tiên tuyệt đối nội dung Knowledge Base (nhãn KB) của thương hiệu ${business}. Không dùng kiến thức bên ngoài.
${kbRule}
Không bịa giá, chính sách, cam kết hay chi tiết kỹ thuật không có trong dữ liệu. Chủ đề: ${industry}.

DỮ LIỆU:
${dataBlock}`;

  if (customPrompt?.trim() && !brand.suppressConflictingBotProfile) {
    base += `\n\nHƯỚNG DẪN BỔ SUNG:\n${customPrompt.slice(0, 2000)}`;
  }
  return base;
}

function looksLikeServiceItem(line: string): boolean {
  const l = line.trim();
  if (l.length < 4 || l.length > 100) return false;
  if (/\?$|là gì|như thế nào|bao nhiêu|ở đâu/i.test(l)) return false;
  return /^(dịch vụ|thiết kế|chăm sóc|đào tạo|seo\b|facebook ads|entity|backlink|content|quảng cáo)/i.test(
    l,
  );
}

function extractServiceList(text: string): string[] {
  const numbered = [
    ...text.matchAll(/(?:^|\n)\s*\d+\.\s*([^\n\d][^\n]{2,80}?)(?=(?:\n\s*\d+\.)|$)/g),
  ]
    .map((m) => (m[1] || '').replace(/\s+/g, ' ').trim())
    .filter(looksLikeServiceItem);
  if (numbered.length >= 2) return numbered.slice(0, 8);

  const inline = [...text.matchAll(/\d+\.\s*([^0-9\n][^0-9]{2,60}?)(?=\s*\d+\.|$)/g)]
    .map((m) => (m[1] || '').replace(/\s+/g, ' ').trim())
    .filter(looksLikeServiceItem);
  if (inline.length >= 2) return inline.slice(0, 8);
  return [];
}

function fallbackReplyFromKnowledge(chunks: KnowledgeChunk[], profileText: string): string {
  const ranked = [...chunks].sort((a, b) => {
    const score = (c: KnowledgeChunk) => {
      const h = c.content.toLowerCase();
      let s = c.score || 0;
      if (/dịch vụ seo|thiết kế website|đào tạo|facebook ads/.test(h)) s += 10;
      if ((c.content.match(/\d\./g) || []).length >= 3) s += 8;
      if (/tên fanpage|facebook\.com\//i.test(h)) s -= 8;
      if (c.sourceType === 'RAG_KB') s += 2;
      return s;
    };
    return score(b) - score(a);
  });

  for (const chunk of ranked) {
    const services = extractServiceList(chunk.content);
    if (services.length >= 2) {
      const list = services.map((l) => `• ${l}`).join('\n');
      return `Bên mình có các dịch vụ chính:\n${list}\n\nAnh/chị muốn tư vấn gói nào, để lại số điện thoại để được hỗ trợ chi tiết nhé!`;
    }
  }

  const top = ranked[0];
  if (top) {
    const cleaned = top.content
      .replace(/\*\*/g, '')
      .replace(/^\s*[-#>]+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/^tên fanpage|^url:/i.test(cleaned) && cleaned.length > 40) {
      const excerpt = cleaned.slice(0, 380);
      return `${excerpt}${cleaned.length > 380 ? '…' : ''}\n\nBạn cần tư vấn thêm, vui lòng để lại số điện thoại nhé!`;
    }
  }
  if (profileText.includes('Hotline:')) {
    const line = profileText.split('\n').find((l) => l.startsWith('Hotline:'));
    if (line) {
      return `${line.replace('Hotline:', 'Bạn có thể gọi hotline').trim()} hoặc để lại SĐT để được tư vấn chi tiết.`;
    }
  }
  if (profileText.includes('Dịch vụ chính:')) {
    const line = profileText.split('\n').find((l) => l.startsWith('Dịch vụ chính:'));
    if (line) {
      return `${line.replace('Dịch vụ chính:', 'Bên mình đang cung cấp').trim()}. Anh/chị để lại SĐT để được tư vấn chi tiết nhé!`;
    }
  }
  return NO_DATA_REPLY;
}

export async function generateAiReply(params: {
  bot: ChatbotBot;
  userText: string;
  sources: ChatbotKnowledgeSource[];
  /** Chunks từ AI Knowledge Base (org-scoped) — ưu tiên hơn knowledge bot. */
  ragChunks?: Array<KnowledgeChunk & { knowledgeBaseName?: string }>;
  /** Fanpage/channel đang chat — brand identity theo page, không theo bot dùng chung. */
  channel?: ChannelContext | null;
  history: Array<{ role: string; message: string }>;
  settings: OrgSettings;
  usageAllowed: boolean;
  exhaustedMessage?: string;
  openAiChat?: (input: {
    model: string;
    systemPrompt: string;
    history: Array<{ role: string; content: string }>;
    userText: string;
    temperature: number;
  }) => Promise<string>;
  /** Số lần retry OpenAI sau lần đầu (0–2). */
  maxRetries?: number;
}): Promise<AiReplyResult> {
  const { bot, userText, sources, history, settings, usageAllowed, openAiChat } = params;
  const ragChunks = params.ragChunks ?? [];
  const channel = params.channel ?? null;
  const maxRetries = Math.min(2, Math.max(0, params.maxRetries ?? 0));
  const text = userText.trim();

  const brand = resolveChannelBrand({ bot, channel, ragChunks });

  if (isGreetingOnly(text)) {
    const greet =
      (!brand.suppressConflictingBotProfile && bot.greeting?.trim()) ||
      defaultGreeting(bot.botName, brand.businessName, bot.consultationTone);
    return { reply: greet, usedAi: false, showLead: false, noData: false };
  }

  const profileText = botProfileContext(bot, brand, channel);
  // Khi brand page/KB xung đột với bot Spa — bỏ knowledge nguồn bot (tránh lẫn)
  const safeSources = brand.suppressConflictingBotProfile
    ? sources.filter(
        (s) => !looksLikeSpaBrand(`${s.title} ${s.content || ''}`),
      )
    : sources;
  const botChunks = searchKnowledge(safeSources, text);
  // Ưu tiên KB org trước, sau đó knowledge gắn bot
  const chunks = mergeKnowledgeChunks(ragChunks, botChunks, 8);
  const hasKbHits = ragChunks.length > 0 || chunks.some((c) => c.sourceType === 'RAG_KB');
  const hasContext = chunks.length > 0 || profileMatchesQuery(profileText, text);

  if (!hasContext) {
    return { reply: NO_DATA_REPLY, usedAi: false, showLead: true, noData: true };
  }

  if (!usageAllowed) {
    return {
      reply: params.exhaustedMessage || CREDIT_EXHAUSTED_MESSAGE,
      usedAi: false,
      showLead: true,
      noData: false,
      blockedCode: 'limit_exceeded',
    };
  }

  const knowledgeText = knowledgeContext(chunks);
  const systemPrompt = buildSystemPrompt(
    knowledgeText,
    profileText,
    settings.systemPrompt ?? '',
    hasKbHits,
    brand,
  );

  if (openAiChat) {
    const hist = history.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.message,
    }));
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const reply = await openAiChat({
          model: settings.model || 'gpt-4o-mini',
          systemPrompt,
          history: hist,
          userText: text,
          temperature: settings.temperature ?? 0.4,
        });
        if (reply) {
          // Có KB hits mà model vẫn trả fallback → ép dùng dữ liệu KB
          if (hasKbHits && reply.includes(NO_DATA_REPLY)) {
            const forced = fallbackReplyFromKnowledge(chunks, profileText);
            return {
              reply: forced === NO_DATA_REPLY ? reply : forced,
              usedAi: false,
              showLead: true,
              noData: forced === NO_DATA_REPLY,
              blockedCode: 'kb_override_nodata',
            };
          }
          // Digi page/KB: chặn reply lẫn brand spa/thẩm mỹ
          if (brand.blockSpaBleed && looksLikeSpaBrand(reply)) {
            const forced = fallbackReplyFromKnowledge(chunks, profileText);
            return {
              reply: forced === NO_DATA_REPLY ? reply : forced,
              usedAi: false,
              showLead: true,
              noData: forced === NO_DATA_REPLY,
              blockedCode: 'kb_override_cross_brand',
            };
          }
          return {
            reply,
            usedAi: true,
            showLead: shouldShowLead(text, reply),
            noData: reply.includes(NO_DATA_REPLY),
          };
        }
      } catch (err) {
        lastErr = err as Error;
        const code = (err as { code?: string })?.code;
        if (code === 'INSUFFICIENT_CREDITS' || lastErr.message.includes('Không đủ AI Credit')) {
          return {
            reply: 'Không đủ AI Credit',
            usedAi: false,
            showLead: true,
            noData: false,
            blockedCode: 'insufficient_credits',
          };
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
      }
    }
    const reply = fallbackReplyFromKnowledge(chunks, profileText) || AI_FRIENDLY_ERROR;
    return {
      reply,
      usedAi: false,
      showLead: true,
      noData: reply === NO_DATA_REPLY,
      blockedCode: lastErr ? 'ai_error' : 'llm_empty',
    };
  }

  try {
    const reply = fallbackReplyFromKnowledge(chunks, profileText);
    return {
      reply,
      usedAi: false,
      showLead: shouldShowLead(text, reply),
      noData: reply === NO_DATA_REPLY,
      blockedCode: 'llm_unavailable',
    };
  } catch {
    const reply = fallbackReplyFromKnowledge(chunks, profileText) || AI_FRIENDLY_ERROR;
    return {
      reply,
      usedAi: false,
      showLead: true,
      noData: false,
      blockedCode: 'ai_error',
    };
  }
}
