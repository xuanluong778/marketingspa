import { Injectable } from '@nestjs/common';
import { ChatbotSuggestDto } from './dto/chatbot-suggest.dto';
import { defaultGreeting } from './utils/chatbot-constants';
import {
  CHATBOT_DEFAULT_SERVICES,
  CHATBOT_INDUSTRY_OPTIONS,
  servicesForIndustry,
} from './utils/chatbot-suggest-options';
import { OpenAiService } from '../openai/openai.service';

@Injectable()
export class ChatbotSuggestService {
  constructor(private readonly openAi: OpenAiService) {}
  getOptions(industry?: string) {
    return {
      industries: [...CHATBOT_INDUSTRY_OPTIONS],
      services: servicesForIndustry(industry),
      defaultServices: CHATBOT_DEFAULT_SERVICES,
    };
  }

  async suggest(dto: ChatbotSuggestDto) {
    if (dto.type === 'greeting') {
      const text = await this.suggestGreeting(dto);
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

  private async suggestGreeting(dto: ChatbotSuggestDto): Promise<string> {
    const tone = dto.consultationTone || 'friendly';
    const botName = dto.botName || 'Chatbot';
    const business = dto.businessName || botName;
    const industry = dto.industry || 'dịch vụ';

    const template = defaultGreeting(botName, business, tone);
    if (!this.openAi.isConfigured()) return template;

    try {
      const text = await this.openAi.chatCompletion({
        model: this.openAi.getDefaultModel(),
        maxTokens: 200,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              'Viết 1 câu chào ngắn (tối đa 2 câu) cho chatbot CSKH tiếng Việt. Không dùng emoji. Không bịa giá hay cam kết.',
          },
          {
            role: 'user',
            content: `Doanh nghiệp: ${business}. Ngành: ${industry}. Giọng điệu: ${tone}. Dịch vụ: ${dto.mainServices || 'chưa rõ'}.`,
          },
        ],
      });
      return text || template;
    } catch {
      return template;
    }  }

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
