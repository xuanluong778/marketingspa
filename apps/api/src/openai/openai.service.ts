import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OpenAiChatMessage {
  role: string;
  content: string;
}

export interface OpenAiChatParams {
  model?: string;
  messages: OpenAiChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface OpenAiStatus {
  configured: boolean;
  model: string;
  baseUrl: string;
  ok: boolean;
  error?: string;
}

@Injectable()
export class OpenAiService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  getApiKey(): string | undefined {
    const key = this.config.get<string>('OPENAI_API_KEY')?.trim();
    return key || undefined;
  }

  getDefaultModel(): string {
    return this.config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
  }

  getBaseUrl(): string {
    return (this.config.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(
      /\/$/,
      '',
    );
  }

  async chatCompletion(params: OpenAiChatParams): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY chưa được cấu hình');
    }

    const res = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model || this.getDefaultModel(),
        messages: params.messages,
        max_tokens: params.maxTokens ?? 500,
        temperature: params.temperature ?? 0.4,
      }),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        detail = err.error?.message ?? '';
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`OpenAI ${res.status}${detail ? `: ${detail}` : ''}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  }

  async getStatus(testConnection = false): Promise<OpenAiStatus> {
    const base: OpenAiStatus = {
      configured: this.isConfigured(),
      model: this.getDefaultModel(),
      baseUrl: this.getBaseUrl(),
      ok: false,
    };

    if (!base.configured) {
      return { ...base, error: 'OPENAI_API_KEY chưa được cấu hình trong .env' };
    }

    if (!testConnection) {
      return { ...base, ok: true };
    }

    try {
      await this.chatCompletion({
        messages: [{ role: 'user', content: 'Trả lời đúng 1 từ: ok' }],
        maxTokens: 5,
        temperature: 0,
      });
      return { ...base, ok: true };
    } catch (err) {
      return {
        ...base,
        ok: false,
        error: err instanceof Error ? err.message : 'Không kết nối được OpenAI',
      };
    }
  }
}
