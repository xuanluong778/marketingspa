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

function botProfileContext(bot: ChatbotBot): string {
  const parts: string[] = [];
  if (bot.businessName) parts.push(`Tên doanh nghiệp: ${bot.businessName}`);
  if (bot.industry) parts.push(`Ngành nghề: ${bot.industry}`);
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
    .map((ch, i) => `[Nguồn ${i + 1}: ${ch.title}]\n${ch.content}`)
    .join('\n\n')
    .slice(0, 12000);
}

function buildSystemPrompt(
  bot: ChatbotBot,
  knowledgeText: string,
  profileText: string,
  customPrompt: string,
): string {
  const business = (bot.businessName || bot.botName || 'doanh nghiệp').trim();
  const industry = (bot.industry || 'dịch vụ spa/thẩm mỹ').trim();
  const dataBlock =
    [profileText && `=== THÔNG TIN DOANH NGHIỆP ===\n${profileText}`, knowledgeText && `=== NGUỒN DỮ LIỆU ===\n${knowledgeText}`]
      .filter(Boolean)
      .join('\n\n') || '(Chưa có dữ liệu)';

  let base = `Bạn là nhân viên CSKH của ${business}.
Trả lời ngắn gọn, tối đa 4-6 câu, chỉ dựa trên dữ liệu bên dưới.
Nếu không có thông tin, trả lời chính xác: «${NO_DATA_REPLY}»
Không bịa giá, chính sách hay cam kết. Chủ đề: ${industry}.

DỮ LIỆU:
${dataBlock}`;

  if (customPrompt?.trim()) {
    base += `\n\nHƯỚNG DẪN BỔ SUNG:\n${customPrompt.slice(0, 2000)}`;
  }
  return base;
}

function fallbackReplyFromKnowledge(chunks: KnowledgeChunk[], profileText: string): string {
  const top = chunks[0];
  if (top) {
    const excerpt = top.content.slice(0, 400).trim();
    if (excerpt) {
      return `${excerpt}${top.content.length > 400 ? '…' : ''}\n\nBạn cần tư vấn thêm, vui lòng để lại số điện thoại nhé!`;
    }
  }
  if (profileText.includes('Hotline:')) {
    const line = profileText.split('\n').find((l) => l.startsWith('Hotline:'));
    if (line) return `${line.replace('Hotline:', 'Bạn có thể gọi hotline').trim()} hoặc để lại SĐT để được tư vấn chi tiết.`;
  }
  return NO_DATA_REPLY;
}

export async function generateAiReply(params: {
  bot: ChatbotBot;
  userText: string;
  sources: ChatbotKnowledgeSource[];
  history: Array<{ role: string; message: string }>;
  settings: OrgSettings;
  usageAllowed: boolean;
  openAiChat?: (input: {
    model: string;
    systemPrompt: string;
    history: Array<{ role: string; content: string }>;
    userText: string;
    temperature: number;
  }) => Promise<string>;
}): Promise<AiReplyResult> {
  const { bot, userText, sources, history, settings, usageAllowed, openAiChat } = params;
  const text = userText.trim();

  if (isGreetingOnly(text)) {
    const greet =
      bot.greeting?.trim() ||
      defaultGreeting(bot.botName, bot.businessName ?? '', bot.consultationTone);
    return { reply: greet, usedAi: false, showLead: false, noData: false };
  }

  const profileText = botProfileContext(bot);
  const chunks = searchKnowledge(sources, text);
  const hasContext = chunks.length > 0 || profileMatchesQuery(profileText, text);

  if (!hasContext) {
    return { reply: NO_DATA_REPLY, usedAi: false, showLead: true, noData: true };
  }

  if (!usageAllowed) {
    return {
      reply: CREDIT_EXHAUSTED_MESSAGE,
      usedAi: false,
      showLead: true,
      noData: false,
      blockedCode: 'limit_exceeded',
    };
  }

  const knowledgeText = knowledgeContext(chunks);
  const systemPrompt = buildSystemPrompt(bot, knowledgeText, profileText, settings.systemPrompt ?? '');

  try {
    if (openAiChat) {
      const hist = history.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.message,
      }));
      const reply = await openAiChat({
        model: settings.model || 'gpt-4o-mini',
        systemPrompt,
        history: hist,
        userText: text,
        temperature: settings.temperature ?? 0.4,
      });
      if (reply) {
        return {
          reply,
          usedAi: true,
          showLead: shouldShowLead(text, reply),
          noData: reply.includes(NO_DATA_REPLY),
        };
      }
    }

    const reply = fallbackReplyFromKnowledge(chunks, profileText);
    return {
      reply,
      usedAi: false,
      showLead: shouldShowLead(text, reply),
      noData: reply === NO_DATA_REPLY,
      blockedCode: openAiChat ? undefined : 'llm_unavailable',
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
