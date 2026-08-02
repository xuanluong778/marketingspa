/**
 * Góc nhìn & Chính kiến — analyze source story + generate opinion post.
 * Reuses OpenAiService; does not touch ad/sales flows.
 */
import type { OpenAiService } from '../openai/openai.service';
import type { GenerateContentDto } from './dto/content-marketing.dto';
import type { AnalyzeOpinionStoryDto } from './dto/content-marketing.dto';

export type OpinionStoryAnalysis = {
  summary: string;
  debateIssue: string;
  suggestedAngles: string[];
  keyPoints: string[];
  source: 'ai' | 'template';
};

const STANCE_LABEL: Record<string, string> = {
  agree: 'Đồng tình',
  disagree: 'Không đồng tình',
  neutral: 'Trung lập',
  multi: 'Nhiều chiều',
  custom: 'Quan điểm riêng',
};

const ANGLE_LABEL: Record<string, string> = {
  life: 'Cuộc sống',
  ethics: 'Đạo đức',
  community: 'Trách nhiệm cộng đồng',
  business: 'Kinh doanh',
  celebrity: 'Người nổi tiếng',
  personal_lesson: 'Bài học cá nhân',
};

const PRONOUN_LABEL: Record<string, string> = {
  toi_cac_ban: 'Tôi – các bạn',
  minh_moi_nguoi: 'Mình – mọi người',
  anh_em: 'Anh em',
  co_chu_anh_chi: 'Cô chú, anh chị',
};

const INTENSITY_LABEL: Record<string, string> = {
  gentle: 'Nhẹ nhàng',
  deep: 'Sâu sắc',
  frank: 'Thẳng thắn',
  emotional: 'Xúc động',
  motivational: 'Truyền động lực',
  strong: 'Mạnh mẽ',
};

const LENGTH_HINT: Record<string, string> = {
  '1min': 'khoảng 120–180 từ (đọc ~1 phút)',
  '3min': 'khoảng 350–500 từ (đọc ~3 phút)',
  '5min': 'khoảng 600–800 từ (đọc ~5 phút)',
  facebook: 'bài Facebook dài vừa (300–550 từ), có hook và CTA tương tác nhẹ',
};

function templateAnalyze(source: string): OpinionStoryAnalysis {
  const trimmed = source.trim().slice(0, 1200);
  const firstLine = trimmed.split(/\n/).find((l) => l.trim())?.trim() || 'Sự việc đang được bàn luận';
  return {
    summary: `Tóm tắt: ${firstLine.slice(0, 220)}${firstLine.length > 220 ? '…' : ''}`,
    debateIssue:
      'Vấn đề tranh luận: công chúng đang bất đồng về cách nhìn nhận đúng–sai / trách nhiệm trong sự việc này.',
    suggestedAngles: [
      'Cuộc sống',
      'Đạo đức',
      'Trách nhiệm cộng đồng',
      'Bài học cá nhân',
    ],
    keyPoints: [
      'Người trong cuộc bị đẩy vào ánh đèn dư luận',
      'Có nhiều góc nhìn đối lập trên mạng xã hội',
      'Cần tách sự thật và cảm xúc khi bình luận',
    ],
    source: 'template',
  };
}

export async function analyzeOpinionStory(
  dto: AnalyzeOpinionStoryDto,
  openai?: OpenAiService,
): Promise<OpinionStoryAnalysis> {
  const source = [dto.sourceUrl?.trim(), dto.sourceText?.trim()].filter(Boolean).join('\n\n');
  if (!source || source.length < 12) {
    return {
      summary: '',
      debateIssue: '',
      suggestedAngles: [],
      keyPoints: [],
      source: 'template',
    };
  }

  if (!openai?.isConfigured()) {
    return templateAnalyze(source);
  }

  const prompt = `Bạn là biên tập viên nội dung xây dựng thương hiệu cá nhân (tiếng Việt).
Phân tích nguồn tin / bài đăng / transcript dưới đây.

Nhiệm vụ:
1) Tóm tắt sự việc trung lập, ngắn gọn (2–4 câu).
2) Xác định vấn đề tranh luận cốt lõi (1–2 câu).
3) Gợi ý 3–5 góc nhìn phù hợp để viết chính kiến.
4) Liệt kê 3–5 điểm then chốt.

Trả JSON thuần:
{"summary":"...","debateIssue":"...","suggestedAngles":["..."],"keyPoints":["..."]}

Nguồn:
"""
${source.slice(0, 6000)}
"""`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 900,
      temperature: 0.3,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<OpinionStoryAnalysis>;
    const fallback = templateAnalyze(source);
    return {
      summary: (parsed.summary || fallback.summary).trim(),
      debateIssue: (parsed.debateIssue || fallback.debateIssue).trim(),
      suggestedAngles: Array.isArray(parsed.suggestedAngles)
        ? parsed.suggestedAngles.filter(Boolean).slice(0, 6)
        : fallback.suggestedAngles,
      keyPoints: Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.filter(Boolean).slice(0, 6)
        : fallback.keyPoints,
      source: 'ai',
    };
  } catch {
    return templateAnalyze(source);
  }
}

function templateGenerateOpinion(dto: GenerateContentDto): {
  content: string;
  hooks: string[];
  openers: string[];
  punchlines: string[];
  source: 'ai' | 'template';
} {
  const stance =
    dto.opinionStance === 'custom'
      ? dto.opinionStanceCustom || 'quan điểm riêng'
      : STANCE_LABEL[dto.opinionStance ?? 'multi'] || 'Nhiều chiều';
  const angle = ANGLE_LABEL[dto.opinionAngle ?? 'life'] || 'Cuộc sống';
  const pronoun = PRONOUN_LABEL[dto.opinionPronoun ?? 'toi_cac_ban'] || 'Tôi – các bạn';
  const summary = dto.opinionSummary || dto.storyIdea || 'sự việc đang được bàn luận';
  const thesis = dto.opinionThesis || dto.personalAngle || 'Cần nhìn nhận bình tĩnh hơn.';
  const debate = dto.opinionDebateIssue || 'cách chúng ta phán xét sự việc';

  const content = `${pronoun.split('–')[0]?.trim() || 'Tôi'} đọc về chuyện này và muốn chia sẻ góc nhìn ${angle.toLowerCase()}.

${summary}

Vấn đề tranh luận: ${debate}

Quan điểm của tôi: ${stance}.
${thesis}

Không phải để “thắng” ai trên mạng, mà để mỗi người tự hỏi: nếu đứng ở vị trí đó, mình sẽ xử sự thế nào?

Nếu bạn nhìn khác, cứ để lại comment — mình sẵn sàng nghe thêm chiều khác.`;

  return {
    content,
    hooks: [
      `Mọi người đang ồn ào về chuyện này — mình muốn nói thẳng một điều.`,
      `Trước khi phán xét, hãy đọc hết.`,
      `Góc nhìn ${angle.toLowerCase()}: ${thesis.slice(0, 60)}`,
    ],
    openers: [
      'Mình không định “đá xoáy” ai.',
      'Đây chỉ là chính kiến cá nhân.',
      'Có thể bạn không đồng tình — và điều đó ổn.',
    ],
    punchlines: [thesis.slice(0, 80), 'Đừng chỉ comment cảm xúc — hãy comment lý lẽ.', stance],
    source: 'template',
  };
}

export async function generateOpinionContent(
  dto: GenerateContentDto,
  openai?: OpenAiService,
): Promise<{
  content: string;
  hooks: string[];
  openers: string[];
  punchlines: string[];
  source: 'ai' | 'template';
}> {
  if (!openai?.isConfigured()) {
    return templateGenerateOpinion(dto);
  }

  const stanceLabel =
    dto.opinionStance === 'custom'
      ? `Nhập riêng: ${dto.opinionStanceCustom || ''}`
      : STANCE_LABEL[dto.opinionStance ?? 'multi'] || 'Nhiều chiều';
  const angleLabel = ANGLE_LABEL[dto.opinionAngle ?? 'life'] || 'Cuộc sống';
  const pronounLabel = PRONOUN_LABEL[dto.opinionPronoun ?? 'toi_cac_ban'] || 'Tôi – các bạn';
  const intensityLabel = INTENSITY_LABEL[dto.opinionIntensity ?? 'frank'] || 'Thẳng thắn';
  const lengthHint = LENGTH_HINT[dto.opinionLength ?? 'facebook'] || LENGTH_HINT.facebook;

  const prompt = `Bạn viết bài xây dựng thương hiệu cá nhân (tiếng Việt) theo luồng:
Nguồn → Tóm tắt sự việc → Vấn đề tranh luận → Góc nhìn → Chính kiến → Bài hoàn chỉnh.

YÊU CẦU:
- Không bán hàng / không CTA chốt đơn.
- Có chính kiến rõ, không mơ hồ.
- Tôn trọng người trong cuộc; không xúc phạm, không bịa số liệu.
- Xưng hô: ${pronounLabel}
- Mức độ: ${intensityLabel}
- Độ dài: ${lengthHint}
- Quan điểm: ${stanceLabel}
- Góc nhìn: ${angleLabel}
- Chính kiến của tác giả: ${dto.opinionThesis || dto.personalAngle || '(chưa ghi — suy luận trung lập có chiều sâu)'}

Tóm tắt sự việc:
${dto.opinionSummary || ''}

Vấn đề tranh luận:
${dto.opinionDebateIssue || ''}

Nguồn / transcript (tham khảo, không copy nguyên văn dài):
"""
${[dto.opinionSourceUrl, dto.opinionSourceText, dto.transcript].filter(Boolean).join('\n').slice(0, 4000)}
"""

Trả JSON thuần:
{"content":"...","hooks":["..."],"openers":["..."],"punchlines":["..."]}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2200,
      temperature: dto.opinionIntensity === 'strong' ? 0.88 : 0.8,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
      content?: string;
      hooks?: string[];
      openers?: string[];
      punchlines?: string[];
    };
    const fallback = templateGenerateOpinion(dto);
    return {
      content: (parsed.content || fallback.content).trim(),
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 5) : fallback.hooks,
      openers: Array.isArray(parsed.openers) ? parsed.openers.slice(0, 5) : fallback.openers,
      punchlines: Array.isArray(parsed.punchlines)
        ? parsed.punchlines.slice(0, 8)
        : fallback.punchlines,
      source: 'ai',
    };
  } catch {
    return templateGenerateOpinion(dto);
  }
}
