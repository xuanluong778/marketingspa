/**
 * POST /content-marketing/opinion/score-naturalness
 * Heuristic + optional AI polish — returns 0–100 and concrete tips.
 */
import type { OpenAiService } from '../openai/openai.service';
import type { OpinionScoreNaturalnessDto } from './dto/content-marketing.dto';

export type OpinionNaturalnessCriteria = {
  spokenFeel: number;
  casualTone: number;
  sentenceLength: number;
  clicheFree: number;
  repetition: number;
  naturalEmotion: number;
  cameraReadiness: number;
};

export type OpinionNaturalnessResult = {
  total: number;
  criteria: OpinionNaturalnessCriteria;
  suggestions: string[];
  source: 'heuristic' | 'ai';
};

const CLICHES =
  /hành trình|bức tranh lớn|đánh thức tiềm năng|trong thế giới ngày nay|không chỉ.*mà còn|đánh giá cao|một lần nữa nhấn mạnh|hãy cùng nhau|câu chuyện truyền cảm hứng/giu;

const SPOKEN =
  /thôi thì|thật ra|nói thật|kiểu như|à |ừ |nhỉ|đúng không|mình thấy|tôi thấy|theo tôi/giu;

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function avgSentenceLen(text: string): number {
  const parts = text
    .split(/[.!?…\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return 0;
  const words = parts.map((p) => p.split(/\s+/).filter(Boolean).length);
  return words.reduce((a, b) => a + b, 0) / words.length;
}

function mechanicalRepeatScore(text: string): { score: number; note?: string } {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 12);
  const seen = new Map<string, number>();
  for (const s of sentences) {
    const key = s.slice(0, 40);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const dup = [...seen.values()].filter((n) => n >= 2).length;
  if (dup >= 2) return { score: 45, note: 'Có câu lặp máy móc — rút gọn hoặc đổi cách nói.' };
  if (dup === 1) return { score: 70, note: 'Có một chỗ lặp — giữ nhịp tự nhiên, đừng lặp ý.' };
  return { score: 90 };
}

export function scoreOpinionNaturalnessHeuristic(
  content: string,
  opts?: { isVideoScript?: boolean },
): OpinionNaturalnessResult {
  const text = content.trim();
  const suggestions: string[] = [];
  if (!text) {
    return {
      total: 0,
      criteria: {
        spokenFeel: 0,
        casualTone: 0,
        sentenceLength: 0,
        clicheFree: 0,
        repetition: 0,
        naturalEmotion: 0,
        cameraReadiness: 0,
      },
      suggestions: ['Chưa có nội dung để chấm.'],
      source: 'heuristic',
    };
  }

  const spokenHits = (text.match(SPOKEN) || []).length;
  const spokenFeel = clamp(40 + spokenHits * 12);
  if (spokenFeel < 60) {
    suggestions.push('Thêm cách nói đời thường (thật ra, thôi thì, mình thấy…) để giống lời nói thật.');
  }

  const hasFormal = /do đó|tuy nhiên|hơn nữa|chẳng những|hơn hết/i.test(text);
  const casualTone = clamp((hasFormal ? 45 : 75) + Math.min(spokenHits * 5, 20));
  if (hasFormal) suggestions.push('Bớt từ trang trọng (do đó / tuy nhiên) — dùng từ dân dã hơn.');

  const avgLen = avgSentenceLen(text);
  const sentenceLength = clamp(avgLen <= 18 ? 90 : avgLen <= 28 ? 70 : avgLen <= 40 ? 45 : 25);
  if (avgLen > 22) {
    suggestions.push(
      `Câu hơi dài (TB ~${Math.round(avgLen)} từ). Tách thành câu ngắn dễ nói trước camera.`,
    );
  }

  const clicheCount = (text.match(CLICHES) || []).length;
  const clicheFree = clamp(100 - clicheCount * 22);
  if (clicheCount) suggestions.push('Bỏ sáo ngữ AI (hành trình, bức tranh lớn, đánh thức tiềm năng…).');

  const rep = mechanicalRepeatScore(text);
  if (rep.note) suggestions.push(rep.note);

  const emotionHits =
    (text.match(/cảm|xúc|buồn|vui|lo|sợ|thấy tiếc|bức xúc|bình tĩnh|đau/giu) || []).length;
  const naturalEmotion = clamp(35 + emotionHits * 14);
  if (naturalEmotion < 55) {
    suggestions.push('Thêm một nhịp cảm xúc tự nhiên (không kịch tính giả).');
  }

  let cameraReadiness = 70;
  if (opts?.isVideoScript) {
    const hasBreath = text.includes('/');
    const hasWelcome = /chào mừng quay trở lại kênh/i.test(text);
    cameraReadiness = clamp((hasBreath ? 85 : 40) + (hasWelcome ? -40 : 10));
    if (!hasBreath) suggestions.push('Kịch bản nên dùng dấu “/” để ngắt hơi khi đọc.');
    if (hasWelcome) suggestions.push('Bỏ câu chào kênh — vào hook thẳng.');
  } else {
    cameraReadiness = clamp(sentenceLength * 0.5 + spokenFeel * 0.5);
  }

  const criteria: OpinionNaturalnessCriteria = {
    spokenFeel,
    casualTone,
    sentenceLength,
    clicheFree,
    repetition: rep.score,
    naturalEmotion,
    cameraReadiness,
  };

  const total = clamp(
    spokenFeel * 0.18 +
      casualTone * 0.14 +
      sentenceLength * 0.16 +
      clicheFree * 0.14 +
      rep.score * 0.12 +
      naturalEmotion * 0.12 +
      cameraReadiness * 0.14,
  );

  if (total >= 80 && suggestions.length === 0) {
    suggestions.push('Độ tự nhiên ổn — có thể thu ngắn hook 5–10 giây nếu làm video.');
  }

  return { total, criteria, suggestions: suggestions.slice(0, 8), source: 'heuristic' };
}

export async function scoreOpinionNaturalness(
  dto: OpinionScoreNaturalnessDto,
  openai?: OpenAiService,
): Promise<OpinionNaturalnessResult> {
  const content = (dto.content || '').trim();
  const isVideo = dto.contentType === 'video_script';
  const base = scoreOpinionNaturalnessHeuristic(content, { isVideoScript: isVideo });

  if (!openai?.isConfigured() || content.length < 40) return base;

  try {
    const raw = await openai.chatCompletion({
      messages: [
        {
          role: 'user',
          content: `Chấm độ tự nhiên bài tiếng Việt (0–100) cho thương hiệu cá nhân.
Tiêu chí: giống lời nói thật, dân dã, câu ngắn, ít sáo ngữ, không lặp máy móc, cảm xúc tự nhiên, đọc camera.
Trả JSON: {"total":0-100,"suggestions":["sửa cụ thể 1","..."]}
Bài:
"""
${content.slice(0, 5000)}
"""`,
        },
      ],
      maxTokens: 500,
      temperature: 0.2,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
      total?: number;
      suggestions?: string[];
    };
    const aiTotal =
      typeof parsed.total === 'number' ? clamp(parsed.total) : base.total;
    const suggestions = [
      ...(Array.isArray(parsed.suggestions) ? parsed.suggestions.filter(Boolean) : []),
      ...base.suggestions,
    ].slice(0, 8);
    return {
      ...base,
      total: clamp(base.total * 0.55 + aiTotal * 0.45),
      suggestions,
      source: 'ai',
    };
  } catch {
    return base;
  }
}

export const __test = {
  scoreOpinionNaturalnessHeuristic,
  CLICHES,
};
