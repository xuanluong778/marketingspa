import type {
  OpenAiChatMessage,
  OpenAiChatParams,
  OpenAiChatWithToolsParams,
  OpenAiService,
} from '../openai/openai.service';

export type RagPromptMode = 'chat' | 'content';

export type RagPromptHit = {
  title: string;
  content: string;
  sourceType?: string;
  score?: number;
};

/** Ghép các field DTO thành query search KB. */
export function buildRagQuery(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
}

/** Format hits thành block đưa vào system/user prompt. */
export function formatRagForPrompt(
  hits: RagPromptHit[],
  mode: RagPromptMode = 'content',
): string {
  if (!hits.length) return '';
  const body = hits
    .map((h, i) => `[KB ${i + 1}: ${h.title}]\n${h.content.slice(0, 3500)}`)
    .join('\n\n')
    .slice(0, 10000);

  if (mode === 'chat') {
    return `=== AI KNOWLEDGE BASE (ưu tiên tuyệt đối) ===
Chỉ dùng sự thật từ block dưới khi trả lời khách. Không bịa giá/chính sách/cam kết.
Nếu không có thông tin liên quan trong KB, nói rõ chưa có dữ liệu / dùng fallback hiện có.

${body}`;
  }

  return `=== AI KNOWLEDGE BASE (ưu tiên sự thật doanh nghiệp) ===
Khi viết content/caption/quảng cáo/tin nhắn, ưu tiên thông tin thật từ Knowledge Base dưới đây (dịch vụ, giá, ưu đãi, chính sách, USP).
Không bịa giá, cam kết, chứng nhận hay chi tiết kỹ thuật không có trong KB.
Nếu KB không đề cập, viết chung chung và tránh khẳng định sai.

${body}`;
}

/** Chèn knowledge block vào đầu messages (system). */
export function prependKnowledgeToMessages(
  messages: OpenAiChatMessage[],
  knowledgeBlock: string,
): OpenAiChatMessage[] {
  const block = knowledgeBlock.trim();
  if (!block) return messages;
  return [{ role: 'system', content: block }, ...messages];
}

/**
 * Proxy OpenAiService: mọi chatCompletion / chatCompletionWithTools
 * tự gắn Knowledge Base — dùng cho content/auto-post mà không sửa từng logic file.
 */
export function withKnowledgeOpenAi(
  openai: OpenAiService,
  knowledgeBlock: string,
): OpenAiService {
  const block = knowledgeBlock.trim();
  if (!block) return openai;

  return new Proxy(openai, {
    get(target, prop, receiver) {
      if (prop === 'chatCompletion') {
        return async (params: OpenAiChatParams) =>
          target.chatCompletion({
            ...params,
            messages: prependKnowledgeToMessages(params.messages, block),
          });
      }
      if (prop === 'chatCompletionWithTools') {
        return async (params: OpenAiChatWithToolsParams) =>
          target.chatCompletionWithTools({
            ...params,
            messages: prependKnowledgeToMessages(params.messages, block),
          });
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as OpenAiService;
}
