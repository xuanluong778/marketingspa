/**
 * Gợi ý AI cho trường “Tóm tắt sự việc” / “Vấn đề tranh luận”.
 */
import type { OpenAiService } from '../openai/openai.service';
import type { OpinionSuggestFieldDto } from './dto/content-marketing.dto';

export type OpinionSuggestFieldResult = {
  options: string[];
  source: 'ai' | 'template';
};

function contextBits(dto: OpinionSuggestFieldDto): string {
  return [
    dto.themeLabel ? `Nhóm: ${dto.themeLabel}` : '',
    dto.subtopic ? `Chủ đề: ${dto.subtopic}` : '',
    dto.sourceText ? `Nguồn:\n${dto.sourceText.slice(0, 1500)}` : '',
    dto.currentSummary ? `Tóm tắt hiện có: ${dto.currentSummary.slice(0, 400)}` : '',
    dto.currentDebateIssue
      ? `Vấn đề đang có: ${dto.currentDebateIssue.slice(0, 400)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function templateSummary(dto: OpinionSuggestFieldDto): string[] {
  const sub = (dto.subtopic || '').trim() || 'một tình huống đời thường';
  const theme = (dto.themeLabel || '').trim();
  const src = (dto.sourceText || '').trim().slice(0, 120);
  const base = [
    `Có một chuyện đang được nhiều người quan tâm xoay quanh “${sub}”.`,
    `Tình huống ngắn gọn: xung quanh chủ đề “${sub}”, mỗi bên nhìn một kiểu khác nhau.`,
    theme
      ? `Trong mạch ${theme.toLowerCase()}, câu chuyện về “${sub}” đang khiến nhiều người phải nghĩ lại.`
      : `Câu chuyện về “${sub}” đang được bàn khá nhiều — phần dữ kiện còn cần nhìn bình tĩnh.`,
    src
      ? `Theo nội dung đang chia sẻ: ${src}${src.length >= 120 ? '…' : ''} — điểm đáng chú ý là cách mọi người phản ứng.`
      : `Một tình huống liên quan “${sub}” được kể lại ngắn — phần còn lại là cách nhìn của từng người.`,
    `Sự việc xoay quanh “${sub}”: không phải drama thắng-thua, mà là cách ứng xử trong đời thường.`,
  ];
  return base.slice(0, 5);
}

function templateDebate(dto: OpinionSuggestFieldDto): string[] {
  const sub = (dto.subtopic || '').trim() || 'tình huống này';
  const summary = (dto.currentSummary || '').trim();
  return [
    `Mọi người đang bất đồng về cách xử lý trong “${sub}” — nên cứng hay nên mềm?`,
    `Tranh luận nằm ở chỗ: quyền lợi cá nhân hay trách nhiệm với người xung quanh trong “${sub}”.`,
    `Có người bênh hành động, có người phản đối — điểm nóng là tiêu chuẩn đúng/sai đang dùng cho “${sub}”.`,
    summary
      ? `Từ tóm tắt đang có, dư luận phân hóa: nhìn theo cảm xúc hay theo dữ kiện trước?`
      : `Công chúng đang bất đồng: phán nhanh theo cảm xúc hay dừng lại để hiểu bối cảnh của “${sub}”?`,
    `Điều đáng bàn không phải “ai thắng”, mà là bài học ứng xử rút ra từ “${sub}”.`,
  ];
}

export function suggestOpinionFieldTemplate(
  dto: OpinionSuggestFieldDto,
): OpinionSuggestFieldResult {
  const options =
    dto.field === 'summary' ? templateSummary(dto) : templateDebate(dto);
  return { options, source: 'template' };
}

export async function suggestOpinionField(
  dto: OpinionSuggestFieldDto,
  openai?: OpenAiService,
): Promise<OpinionSuggestFieldResult> {
  const fallback = suggestOpinionFieldTemplate(dto);
  if (!openai?.isConfigured()) return fallback;

  const fieldLabel =
    dto.field === 'summary' ? 'Tóm tắt sự việc' : 'Vấn đề tranh luận';
  const rules =
    dto.field === 'summary'
      ? `Viết 5 biến thể TÓM TẮT SỰ VIỆC:
- Trung lập, 1–2 câu, dân dã.
- Không bịa dữ kiện / tên / động cơ.
- Không nghị luận, không kết luận ai đúng ai sai.
- Có thể dựa chủ đề / nguồn user cung cấp.`
      : `Viết 5 biến thể VẤN ĐỀ TRANH LUẬN:
- Nêu rõ công chúng / mọi người đang bất đồng điều gì.
- 1 câu hoặc 2 câu ngắn, dân dã.
- Không phán tuyệt đối; không kích động.
- Bám chủ đề / tóm tắt nếu có.`;

  const prompt = `Bạn hỗ trợ form “Góc nhìn & Chính kiến” (tiếng Việt).

Trường cần gợi ý: ${fieldLabel}

${rules}

Ngữ cảnh:
${contextBits(dto) || '(ít ngữ cảnh — dựa chủ đề chung đời thường)'}

Giá trị hiện tại (tham khảo, có thể cải thiện):
${(dto.currentValue || '').trim() || '(trống)'}

Trả JSON thuần: {"options":["...","...","...","...","..."]}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'Bạn viết gợi ý ngắn tiếng Việt, dân dã, trung lập. Chỉ trả JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.75,
      maxTokens: 900,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
      options?: string[];
    };
    const options = Array.isArray(parsed.options)
      ? parsed.options.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
      : [];
    if (options.length >= 3) return { options, source: 'ai' };
  } catch {
    /* fallback */
  }
  return fallback;
}
