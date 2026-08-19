import { Injectable } from '@nestjs/common';
import { ChatbotSuggestDto } from './dto/chatbot-suggest.dto';
import { defaultGreeting } from './utils/chatbot-constants';
import {
  CHATBOT_DEFAULT_SERVICES,
  CHATBOT_INDUSTRY_OPTIONS,
  servicesForIndustry,
} from './utils/chatbot-suggest-options';
import { OpenAiService } from '../openai/openai.service';
import { RagKbService } from '../rag-kb/rag-kb.service';
import { buildRagQuery } from '../rag-kb/rag-prompt.util';
import { CreditService } from '../credit/credit.service';
import { CREDIT_FEATURE_CODES } from '@marketingspa/shared';
import { randomUUID } from 'crypto';

@Injectable()
export class ChatbotSuggestService {
  constructor(
    private readonly openAi: OpenAiService,
    private readonly ragKb: RagKbService,
    private readonly credit: CreditService,
  ) {}
  getOptions(industry?: string) {
    return {
      industries: [...CHATBOT_INDUSTRY_OPTIONS],
      services: servicesForIndustry(industry),
      defaultServices: CHATBOT_DEFAULT_SERVICES,
    };
  }

  async suggest(dto: ChatbotSuggestDto, organizationId?: string) {
    if (dto.type === 'greeting') {
      const text = await this.suggestGreeting(dto, organizationId);
      return { type: 'greeting', text, suggestions: this.greetingVariants(dto) };
    }

    const services = this.suggestServices(dto);
    return {
      type: 'services',
      text: services.join('\n'),
      suggestions: services,
    };
  }

  private greetingVariants(dto: ChatbotSuggestDto): string[] {
    const botName = dto.botName || 'Chatbot';
    const business = dto.businessName || botName;
    const tones = ['friendly', 'professional', 'enthusiastic', 'concise'] as const;
    return tones.map((t) => defaultGreeting(botName, business, t));
  }

  private async suggestGreeting(
    dto: ChatbotSuggestDto,
    organizationId?: string,
  ): Promise<string> {
    const tone = dto.consultationTone || 'friendly';
    const botName = dto.botName || 'Chatbot';
    const business = dto.businessName || botName;
    const industry = dto.industry || 'dịch vụ';

    const template = defaultGreeting(botName, business, tone);
    if (!this.openAi.isConfigured() || !organizationId) return template;

    try {
      return await this.credit.runPaidFeature({
        organizationId,
        featureCode: CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
        referenceId: `chatbot.suggest:${organizationId}:${randomUUID()}`,
        reason: 'chatbot suggest greeting',
        fn: async (ctx) => {
          const kbBlock = await this.ragKb.getPromptBlock(
            organizationId,
            buildRagQuery(business, industry, dto.mainServices),
            { limit: 3, mode: 'content' },
          );
          ctx.markProviderStarted();
          const text = await this.openAi.chatCompletion({
            model: this.openAi.getDefaultModel(),
            maxTokens: 200,
            temperature: 0.7,
            messages: [
              {
                role: 'system',
                content:
                  'Viết 1 câu chào ngắn (tối đa 2 câu) cho chatbot CSKH tiếng Việt. Không dùng emoji. Không bịa giá hay cam kết. Ưu tiên sự thật từ Knowledge Base nếu có.',
              },
              ...(kbBlock ? [{ role: 'system' as const, content: kbBlock }] : []),
              {
                role: 'user',
                content: `Doanh nghiệp: ${business}. Ngành: ${industry}. Giọng điệu: ${tone}. Dịch vụ: ${dto.mainServices || 'chưa rõ'}.`,
              },
            ],
          });
          return text || template;
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Không đủ AI Credit')) throw err;
      return template;
    }
  }

  private suggestServices(dto: ChatbotSuggestDto): string[] {
    const base = servicesForIndustry(dto.industry);
    const existing = (dto.mainServices ?? '')
      .split(/[\n,;]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    const merged = [...new Set([...existing, ...base])];
    return merged.slice(0, 12);
  }
}
