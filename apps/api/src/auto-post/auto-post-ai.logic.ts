import type { AutoPostType } from '@marketingspa/database';
import type { OpenAiService } from '../openai/openai.service';
import {
  buildAutoPostPrompt,
  buildAutoPostRewritePrompt,
} from './auto-post-config';

export interface AutoPostAiResult {
  caption: string;
  hashtags: string[];
  cta: string;
}

function parseAiJson(raw: string): AutoPostAiResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { caption: trimmed, hashtags: [], cta: '' };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      caption?: string;
      hashtags?: string[] | string;
      cta?: string;
    };
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
      : typeof parsed.hashtags === 'string'
        ? parsed.hashtags.split(/\s+/).filter(Boolean)
        : [];
    return {
      caption: parsed.caption?.trim() ?? trimmed,
      hashtags,
      cta: parsed.cta?.trim() ?? '',
    };
  } catch {
    return { caption: trimmed, hashtags: [], cta: '' };
  }
}

export async function generateAutoPostContent(
  openai: OpenAiService,
  input: {
    postType: AutoPostType;
    topic: string;
    spaService?: string;
    targetAudience?: string;
    tone?: string;
    promotion?: string;
    linkUrl?: string;
    hashtags?: string;
    cta?: string;
  },
): Promise<AutoPostAiResult> {
  const prompt = buildAutoPostPrompt(input);
  const raw = await openai.chatCompletion({
    messages: [
      {
        role: 'system',
        content:
          'Bạn viết content marketing spa cho Facebook. Luôn trả JSON hợp lệ, không giải thích thêm.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.85,
    maxTokens: 1800,
  });
  return parseAiJson(raw);
}

export async function rewriteAutoPostContent(
  openai: OpenAiService,
  mode: 'rewrite' | 'shorten' | 'stronger_cta',
  caption: string,
  cta?: string,
): Promise<AutoPostAiResult> {
  const prompt = buildAutoPostRewritePrompt(mode, caption, cta);
  const raw = await openai.chatCompletion({
    messages: [
      {
        role: 'system',
        content: 'Trả JSON hợp lệ: {"caption","hashtags","cta"}. Không markdown heading.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    maxTokens: 1600,
  });
  return parseAiJson(raw);
}
