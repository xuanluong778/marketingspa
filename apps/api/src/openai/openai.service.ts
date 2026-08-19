import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OpenAiChatMessage {
  role: string;
  content: string | null;
  /** OpenAI tool call request (assistant message) */
  tool_calls?: OpenAiToolCall[];
  /** For role=tool */
  tool_call_id?: string;
  name?: string;
}

export interface OpenAiToolCallFunction {
  name: string;
  arguments: string;
}

export interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: OpenAiToolCallFunction;
}

export interface OpenAiFunctionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAiChatParams {
  model?: string;
  messages: OpenAiChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Abort fetch after N ms (default 20s). */
  timeoutMs?: number;
}

export interface OpenAiChatWithToolsParams extends OpenAiChatParams {
  tools?: OpenAiFunctionTool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface OpenAiChatCompletionMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenAiToolCall[];
}

export interface OpenAiChatCompletionResult {
  message: OpenAiChatCompletionMessage;
  finishReason: string | null;
  rawUsage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
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
    const result = await this.chatCompletionWithTools({
      ...params,
      tools: undefined,
      toolChoice: undefined,
    });
    return (result.message.content ?? '').trim();
  }

  /**
   * Chat completions with optional OpenAI function/tools.
   * Returns full assistant message (content + tool_calls) — used by AI Assistant orchestrator.
   * Does not log API keys or raw secrets.
   */
  async chatCompletionWithTools(
    params: OpenAiChatWithToolsParams,
  ): Promise<OpenAiChatCompletionResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY chưa được cấu hình');
    }

    const timeoutMs = params.timeoutMs ?? 20_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const body: Record<string, unknown> = {
      model: params.model || this.getDefaultModel(),
      messages: params.messages,
      max_tokens: params.maxTokens ?? 500,
      temperature: params.temperature ?? 0.4,
    };
    if (params.tools?.length) {
      body.tools = params.tools;
      body.tool_choice = params.toolChoice ?? 'auto';
    }

    let res: Response;
    try {
      res = await fetch(`${this.getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        throw new Error(`OpenAI timeout after ${timeoutMs}ms`);
      }
      throw err;
    }
    clearTimeout(timer);

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

    const data = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string | null;
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: OpenAiToolCall[];
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const choice = data.choices?.[0];
    const msg = choice?.message;
    return {
      message: {
        role: msg?.role || 'assistant',
        content: msg?.content ?? null,
        tool_calls: msg?.tool_calls,
      },
      finishReason: choice?.finish_reason ?? null,
      rawUsage: data.usage,
    };
  }

  /**
   * Multimodal chat (vision). `content` may be string or OpenAI content parts array.
   */
  async chatCompletionVision(params: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    messages: Array<{
      role: string;
      content:
        | string
        | Array<
            | { type: 'text'; text: string }
            | { type: 'image_url'; image_url: { url: string; detail?: string } }
          >;
    }>;
  }): Promise<string> {
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
        max_tokens: params.maxTokens ?? 800,
        temperature: params.temperature ?? 0.2,
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
      throw new Error(`OpenAI vision ${res.status}${detail ? `: ${detail}` : ''}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  }

  /** Whisper / gpt-4o-mini-transcribe compatible audio transcription. */
  async transcribeAudio(params: {
    buffer: Buffer;
    filename: string;
    mimeType?: string;
    language?: string;
    model?: string;
  }): Promise<{ text: string; language?: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY chưa được cấu hình');
    }

    const model =
      params.model?.trim() ||
      this.config.get<string>('OPENAI_TRANSCRIBE_MODEL')?.trim() ||
      'gpt-4o-mini-transcribe';

    const form = new FormData();
    const blob = new Blob([new Uint8Array(params.buffer)], {
      type: params.mimeType || 'application/octet-stream',
    });
    form.append('file', blob, params.filename);
    form.append('model', model);
    const lang = params.language?.trim();
    if (lang && lang !== 'auto') {
      form.append('language', lang);
    }

    const res = await fetch(`${this.getBaseUrl()}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        detail = err.error?.message ?? '';
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`OpenAI transcribe ${res.status}${detail ? `: ${detail}` : ''}`);
    }

    const data = (await res.json()) as { text?: string; language?: string };
    return {
      text: (data.text ?? '').trim(),
      language: data.language,
    };
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
