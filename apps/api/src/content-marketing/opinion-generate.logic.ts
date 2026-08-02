/**
 * POST /content-marketing/opinion/generate
 * POST /content-marketing/opinion/rewrite
 * Facebook post + camera script — spoken, natural Vietnamese; no invented personal stories.
 */
import type { OpenAiService } from '../openai/openai.service';
import type {
  OpinionGenerateDto,
  OpinionRewriteDto,
  OpinionRewriteMode,
} from './dto/content-marketing.dto';
import {
  SAFETY_PROMPT_BLOCK,
  anonymizeNames,
  extractLikelyNames,
  scanOpinionSafety,
} from './opinion-safety.logic';
import {
  CLIP_LIFE_STRUCTURE,
  CLIP_LIFE_STYLE_HINTS,
  CLIP_LIFE_VOICE_BLOCK,
  LIFE_STORY_STRUCTURE,
  LIFE_STORY_STYLE_HINTS,
  LIFE_STORY_VOICE_BLOCK,
  isClipLifeTheme,
  isLifeStoryTheme,
} from './opinion-topic-themes';

export type OpinionGenerateResult = {
  facebookPost: string;
  videoScript: string;
  videoHook: string;
  warnings: string[];
  source: 'ai' | 'template';
  rewriteMode?: OpinionRewriteMode;
  safetyRisk?: 'low' | 'medium' | 'high';
  /** Metadata tách riêng — tuyệt đối không chèn vào nội dung bài */
  meta?: {
    themeId?: string;
    subtopic?: string;
    selectedAngle?: string;
    length?: string;
  };
};

export const OPINION_REWRITE_MODES = [
  'more_casual',
  'more_natural',
  'more_spoken',
  'less_preachy',
  'more_frank',
  'more_deep',
  'shorten',
  'shorten_1min',
  'rewrite_all',
] as const;

/** Chuỗi nhãn dàn ý cấm xuất hiện trong bài */
export const FORBIDDEN_OUTLINE_STRINGS = [
  'Tình huống tôi muốn bàn:',
  'Góc nhìn:',
  'Vấn đề đáng nói:',
  'Bài học cuộc sống:',
  'Kết luận:',
] as const;

const ANGLE_LABEL: Record<string, string> = {
  life: 'Cuộc sống',
  ethics: 'Đạo đức',
  community: 'Trách nhiệm cộng đồng',
  business: 'Kinh doanh',
  celebrity: 'Người nổi tiếng',
  personal_lesson: 'Bài học cá nhân',
};

const PRONOUN: Record<string, { self: string; audience: string }> = {
  toi_cac_ban: { self: 'Tôi', audience: 'các bạn' },
  minh_moi_nguoi: { self: 'Mình', audience: 'mọi người' },
  anh_em: { self: 'Anh', audience: 'anh em' },
  co_chu_anh_chi: { self: 'Tôi', audience: 'cô chú anh chị' },
};

const INTENSITY_HINT: Record<string, string> = {
  gentle: 'nhẹ nhàng, không gay gắt',
  deep: 'sâu sắc, có lớp suy nghĩ, không giảng đạo',
  frank: 'thẳng thắn, nói rõ quan điểm',
  emotional: 'xúc động, chân thật, không sến sáo',
  motivational: 'truyền động lực nhẹ, không hô hào sáo',
  strong: 'mạnh, dứt khoát nhưng không xúc phạm',
};

const LENGTH_HINT: Record<string, string> = {
  '1min': 'bài nói ~1 phút (khoảng 130–180 từ tiếng Việt)',
  '3min': 'bài nói ~3 phút (khoảng 350–500 từ)',
  '5min': 'bài nói ~5 phút (khoảng 650–850 từ)',
  facebook: 'bài Facebook vừa (khoảng 280–450 từ)',
};

const REWRITE_HINT: Record<string, string> = {
  more_casual: 'Dân dã hơn: từ đời thường, bớt trang trọng, vẫn rõ ý.',
  more_natural: 'Tự nhiên hơn: giống nói chuyện thật, ngắt nhịp thoải mái, bớt “bài văn”.',
  more_spoken: 'Giống lời nói hơn: câu ngắn, có hơi ngập ngừng nhẹ, dễ đọc Teleprompter.',
  less_preachy: 'Bớt giảng đạo: bỏ giọng khuyên răn, nói nhẹ như tâm sự.',
  more_frank: 'Thẳng thắn hơn: nói rõ chính kiến, không vòng vo, vẫn tôn trọng.',
  more_deep: 'Sâu sắc hơn: thêm lớp suy nghĩ, không sáo ngữ, không diễn văn.',
  shorten: 'Rút ngắn: giữ ý chính, hook, chính kiến và câu hỏi cuối; bỏ phần lan man.',
  shorten_1min: 'Rút còn khoảng 1 phút đọc (~130–180 từ). Giữ hook + chính kiến + câu hỏi cuối.',
  rewrite_all: 'Viết lại toàn bộ từ đầu: cùng ý, cách diễn đạt mới, liền mạch, không nhãn mục.',
};

const STYLE_RULES = `VĂN PHONG ĐẦU RA (bắt buộc):
- Chỉ trả NỘI DUNG BÀI NÓI / BÀI ĐĂNG hoàn chỉnh. Không dàn ý, không nhãn mục, không ghi chú, không giải thích meta.
- CẤM các chuỗi/nhãn: “Tình huống tôi muốn bàn:”, “Góc nhìn:”, “Vấn đề đáng nói:”, “Bài học cuộc sống:”, “Kết luận:”, “Phân tích:”, “Chủ đề đang bàn:”.
- Viết liền mạch như người đang tâm sự và đưa lời khuyên nhẹ.
- Câu ngắn, từ đời thường, dễ đọc thành tiếng.
- Chuyển ý tự nhiên — không liệt kê bằng gạch đầu dòng.
- Không lặp máy móc “theo quan điểm của tôi”, “tôi nhận ra rằng”.
- Có thể dùng: “nói thật”, “tôi nghĩ”, “nhưng ngẫm lại”, “có một điều”, “thực ra”, “đôi khi”.
- Cho phép lặp/ngập ngừng nhẹ, không lan man.
- Mở đầu đi thẳng vào chuyện, không chào hỏi dài / không “chào mừng quay lại kênh”.
- Kết bằng suy nghĩ hoặc câu hỏi nhẹ để khán giả bình luận.
- Không nghị luận, diễn văn, giảng đạo, sáo ngữ AI (“hành trình”, “bức tranh lớn”…).
- KHÔNG bịa trải nghiệm cá nhân nếu user chưa cung cấp.
- Không bịa số liệu / phát ngôn / động cơ. Không kết luận như tòa án.`;

const HIDDEN_FLOW = `MẠCH ẨN (tự triển khai, KHÔNG hiện thành tiêu đề trong bài):
Mở câu chuyện → tình huống đời thường → điều đáng suy nghĩ → chính kiến cá nhân → nhìn thêm các phía liên quan (vd. cha mẹ & con cái nếu đúng chủ đề) → lời khuyên thực tế → thông điệp cuối → câu hỏi tương tác.`;

const VIDEO_RULES = `KỊCH BẢN VIDEO (videoScript):
- Một bài nói hoàn chỉnh, không heading.
- Hook 5–10 giây ở đầu (videoHook = câu mở ngắn).
- Dùng dấu "/" để ngắt hơi khi đọc Teleprompter.
- Không chào kênh. Không nhãn mục.`;

const OUTPUT_JSON_RULES = `Trả JSON thuần (không markdown):
{"facebookPost":"...","videoScript":"...","videoHook":"...","warnings":["..."]}
- facebookPost: bài đăng hoàn chỉnh, không nhãn.
- videoScript: bài nói hoàn chỉnh cho Teleprompter, không nhãn.
- warnings: cảnh báo an toàn / thiếu dữ kiện (nếu có) — KHÔNG nhét warnings vào facebookPost hay videoScript.`;

function resolvePronoun(code?: string): { self: string; audience: string } {
  return PRONOUN[code || 'toi_cac_ban'] ?? PRONOUN.toi_cac_ban!;
}

function resolveAngle(dto: OpinionGenerateDto): string {
  if (dto.quickAngleLabel?.trim()) return dto.quickAngleLabel.trim();
  if (dto.selectedAngle?.trim()) return dto.selectedAngle.trim();
  if (dto.subtopic?.trim()) return dto.subtopic.trim();
  return ANGLE_LABEL[dto.angle || ''] || 'Cuộc sống';
}

function factsBlock(dto: OpinionGenerateDto): string {
  const facts = (dto.confirmedFacts || []).map((x) => x.trim()).filter(Boolean);
  const claims = (dto.unverifiedClaims || []).map((x) => x.trim()).filter(Boolean);
  return [
    facts.length ? `Dữ kiện đã xác nhận:\n- ${facts.join('\n- ')}` : 'Dữ kiện đã xác nhận: (chưa có)',
    claims.length
      ? `Thông tin chưa xác minh:\n- ${claims.join('\n- ')}`
      : 'Thông tin chưa xác minh: (chưa có)',
  ].join('\n');
}

function voiceBlock(dto: OpinionGenerateDto): string {
  const preferred = [
    ...(dto.preferredWords || []),
    ...(dto.commonPhrases || []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  const avoid = (dto.avoidWords || []).map((s) => s.trim()).filter(Boolean);
  const openings = (dto.openingPhrases || []).map((s) => s.trim()).filter(Boolean);
  const closings = (dto.closingPhrases || []).map((s) => s.trim()).filter(Boolean);
  const sample = (dto.sampleParagraph || '').trim();
  return `GIỌNG NÓI CÁ NHÂN HÓA:
- Học cách diễn đạt từ cấu hình dưới đây; KHÔNG sao chép nguyên văn đoạn mẫu.
- Từ thường dùng (ưu tiên nhẹ): ${preferred.length ? preferred.join(' · ') : '(không có)'}
- Từ tránh dùng: ${avoid.length ? avoid.join(' · ') : '(không có)'}
- Câu mở quen (tham khảo phong cách, không copy y): ${openings.length ? openings.join(' | ') : '(không có)'}
- Câu kết quen (tham khảo): ${closings.length ? closings.join(' | ') : '(không có)'}
- Đoạn mẫu (chỉ học nhịp/giọng): ${sample ? sample.slice(0, 800) : '(không có)'}`;
}

function prepareDto(dto: OpinionGenerateDto): OpinionGenerateDto {
  if (!dto.hideNames) return dto;
  const blob = [
    dto.sourceSummary,
    ...(dto.confirmedFacts || []),
    ...(dto.unverifiedClaims || []),
    dto.userViewpoint,
  ]
    .filter(Boolean)
    .join('\n');
  const names = extractLikelyNames(blob);
  if (!names.length) {
    return {
      ...dto,
      sourceSummary: anonymizeNames(
        (dto.sourceSummary || '').replace(/\b[A-ZÀ-Ỹ][\p{L}']+\b/gu, 'nhân vật A') ||
          'Theo thông tin đang được chia sẻ, có một sự việc đang gây tranh luận.',
        [],
      ),
    };
  }
  return {
    ...dto,
    sourceSummary: anonymizeNames(dto.sourceSummary || '', names),
    confirmedFacts: (dto.confirmedFacts || []).map((f) => anonymizeNames(f, names)),
    unverifiedClaims: (dto.unverifiedClaims || []).map((f) => anonymizeNames(f, names)),
    userViewpoint: anonymizeNames(dto.userViewpoint || '', names),
  };
}

function finalizeResult(
  result: OpinionGenerateResult,
  dto: OpinionGenerateDto,
): OpinionGenerateResult {
  let facebookPost = result.facebookPost;
  let videoScript = result.videoScript;
  let videoHook = result.videoHook;

  if (dto.hideNames) {
    const names = extractLikelyNames(
      [dto.sourceSummary, ...(dto.confirmedFacts || []), facebookPost, videoScript].join('\n'),
    );
    // Also anonymize leftover proper names in output
    const more = extractLikelyNames(facebookPost + '\n' + videoScript);
    const all = [...new Set([...names, ...more])].filter(
      (n) => !/^nhân vật/i.test(n) && n.length > 1,
    );
    facebookPost = anonymizeNames(facebookPost, all);
    videoScript = anonymizeNames(videoScript, all);
    videoHook = anonymizeNames(videoHook, all);
  }

  // Soft-hedge unverified claims if missing
  if ((dto.unverifiedClaims?.length || 0) > 0) {
    const hedge = 'theo thông tin đang được chia sẻ';
    if (!facebookPost.toLowerCase().includes(hedge) && !facebookPost.includes('chưa đủ dữ kiện')) {
      facebookPost =
        facebookPost +
        '\n\nLưu ý: đây là theo thông tin đang được chia sẻ — hiện chưa đủ dữ kiện để kết luận.';
    }
  }

  const safety = scanOpinionSafety({
    facebookPost,
    videoScript,
    unverifiedClaims: dto.unverifiedClaims,
    confirmedFacts: dto.confirmedFacts,
    userViewpoint: dto.userViewpoint,
    hideNames: dto.hideNames,
  });

  const warnings = [...new Set([...(result.warnings || []), ...safety.warnings])].slice(0, 12);
  if (dto.hideNames && !warnings.some((w) => /ẩn tên/i.test(w))) {
    warnings.push('Đã bật ẩn tên nhân vật — dùng nhân vật A/B thay tên thật.');
  }

  facebookPost = stripOutlineLabels(facebookPost);
  videoScript = stripOutlineLabels(videoScript);
  videoHook = stripOutlineLabels(videoHook);

  return {
    ...result,
    facebookPost,
    videoScript,
    videoHook,
    warnings,
    safetyRisk: safety.riskLevel,
    meta: result.meta || {
      themeId: dto.themeId,
      subtopic: dto.subtopic,
      selectedAngle: resolveAngle(dto),
      length: dto.length || 'facebook',
    },
  };
}

function hasPersonalExperience(dto: OpinionGenerateDto): boolean {
  const thesis = (dto.userViewpoint || '').trim();
  if (!thesis) return false;
  return /(tôi từng|mình từng|hôm qua|năm ngoái|lần trước tôi|kinh nghiệm của tôi|tôi đã gặp|mình đã gặp)/i.test(
    thesis,
  );
}

function emptyWarnings(dto: OpinionGenerateDto): string[] {
  const w: string[] = [];
  if (!(dto.sourceSummary || '').trim()) w.push('Thiếu tóm tắt sự việc — bài dựa trên thông tin tối thiểu.');
  if (!(dto.userViewpoint || '').trim())
    w.push('Chưa có quan điểm riêng — chỉ nêu góc nhìn trung lập, không bịa trải nghiệm.');
  if (!hasPersonalExperience(dto))
    w.push('Không dùng trải nghiệm cá nhân bịa đặt vì user chưa cung cấp.');
  return w;
}

function stripOutlineLabels(text: string): string {
  let out = text;
  const patterns: RegExp[] = [
    /^\s*Tình huống\s+(tôi|mình|anh)?\s*muốn bàn\s*:\s*/gim,
    /^\s*Tình huống\s*:\s*/gim,
    /^\s*Góc nhìn\s*:\s*/gim,
    /^\s*Vấn đề đáng nói\s*:\s*/gim,
    /^\s*Vấn đề\s*:\s*/gim,
    /^\s*Bài học cuộc sống\s*:\s*/gim,
    /^\s*Bài học\s*:\s*/gim,
    /^\s*Kết luận\s*:\s*/gim,
    /^\s*Phân tích\s*:\s*/gim,
    /^\s*Chủ đề đang bàn\s*:\s*/gim,
    /^\s*Chủ đề\s*:\s*/gim,
    /^\s*Phần dữ kiện[^\n:]*:\s*/gim,
    /Tình huống tôi muốn bàn:\s*/gi,
    /Góc nhìn:\s*/gi,
    /Vấn đề đáng nói:\s*/gi,
    /Bài học cuộc sống:\s*/gi,
    /Kết luận:\s*/gi,
  ];
  for (const re of patterns) out = out.replace(re, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function assertNoForbiddenLabels(text: string): boolean {
  const lower = text.toLowerCase();
  return !FORBIDDEN_OUTLINE_STRINGS.some((s) => lower.includes(s.toLowerCase()));
}

function breathify(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([,.?!…])\s*/g, '$1 / ')
    .replace(/\s*\/\s*\/+/g, ' / ')
    .replace(/\s+\/\s*$/g, '')
    .trim();
}

function intensityFlavor(
  p: { self: string; audience: string },
  intensity: string | undefined,
): string {
  switch (intensity) {
    case 'gentle':
      return `${p.self} nói nhẹ thôi.`;
    case 'deep':
      return `Có một điều ${p.self.toLowerCase()} muốn nghĩ kỹ hơn một chút.`;
    case 'emotional':
      return `Nói thật, chuyện này khiến ${p.self.toLowerCase()} hơi nặng lòng.`;
    case 'motivational':
      return `${p.self} muốn nhắc nhẹ một câu — không hô hào.`;
    case 'strong':
      return `${p.self} nói thẳng một chút — nhưng không công kích ai.`;
    default:
      return `Nói thật lòng.`;
  }
}

function templateGenerate(dto: OpinionGenerateDto): OpinionGenerateResult {
  const p = resolvePronoun(dto.pronoun);
  const angle = resolveAngle(dto);
  const clip = isClipLifeTheme(dto.themeId);
  const life = isLifeStoryTheme(dto.themeId);
  const summary =
    (dto.sourceSummary || '').trim() ||
    (clip
      ? 'có một đoạn clip đang được nhiều người bàn'
      : life
        ? (dto.subtopic || '').trim() || 'một chuyện đời thường đang khiến nhiều người phải nghĩ'
        : 'một sự việc đang được bàn khá nhiều trên mạng');
  const viewpoint =
    (dto.userViewpoint || '').trim() ||
    (life
      ? 'nên nhìn nhiều phía, đừng vội phán tuyệt đối'
      : 'nên nhìn bình tĩnh hơn, tách dữ kiện và cảm xúc');
  const facts = (dto.confirmedFacts || []).filter(Boolean).slice(0, 3);
  const claims = (dto.unverifiedClaims || []).filter(Boolean).slice(0, 3);
  const phrases = (dto.commonPhrases || []).filter(Boolean).slice(0, 2);
  const phraseBit = phrases.length ? ` ${phrases[0]}` : '';

  const factBit =
    facts.length > 0
      ? facts.join(' ')
      : life
        ? 'Đây chỉ là suy nghĩ quanh một chuyện đời thường — không phải bản án.'
        : 'Những gì đang được đưa ra chủ yếu đến từ một phía.';
  const claimBit =
    claims.length > 0
      ? `Có ý kiến kiểu “${claims[0]}”. Nếu đúng thì đáng bàn — nhưng hiện chưa đủ để kết luận.`
      : life
        ? 'Mỗi người đứng một góc khác nhau, nên đừng kết luận cứng.'
        : 'Phần lời qua tiếng lại trên mạng cứ để ở mức nghi vấn.';

  const flavor = intensityFlavor(p, dto.intensity);

  const open =
    (dto.openingPhrases || []).map((s) => s.trim()).filter(Boolean)[0] ||
    (clip
      ? `Mấy hôm nay ${p.self.toLowerCase()} thấy một đoạn video.${phraseBit}`
      : life
        ? `Nói thật, chuyện này khiến ${p.self.toLowerCase()} phải nghĩ.${phraseBit}`
        : `${p.self} thấy chuyện này đang ồn quá.${phraseBit}`);

  const close =
    (dto.closingPhrases || []).map((s) => s.trim()).filter(Boolean)[0] ||
    `${p.audience.charAt(0).toUpperCase()}${p.audience.slice(1)} nghĩ sao? Comment cho ${p.self.toLowerCase()} biết góc nhìn của mình.`;

  let facebookPost: string;
  if (clip) {
    facebookPost = [
      open,
      ``,
      `Nói thật với ${p.audience}, xem xong ${p.self.toLowerCase()} cứ nghĩ mãi.`,
      `Clip kể ngắn vậy: ${summary}`,
      `Điều ${p.self.toLowerCase()} quan tâm không phải ai thắng ai thua. Mà là cách mình nhìn chuyện — liên quan ${angle.toLowerCase()}.`,
      ``,
      `${flavor} ${p.self} nghĩ: ${viewpoint}`,
      `${factBit}`,
      claimBit,
      ``,
      `Nhưng ngẫm lại, người trong cuộc cũng đang chịu áp lực. Người xem thì dễ phán nhanh vì chỉ thấy một đoạn.`,
      `Thực ra dễ nhất là comment. Khó nhất là giữ đầu lạnh.`,
      `Có một điều ${p.self.toLowerCase()} muốn nhắc nhẹ: dữ kiện trước, cảm xúc sau.`,
      ``,
      close,
    ].join('\n');
  } else if (life) {
    facebookPost = [
      open,
      ``,
      `Chuyện đời thường thôi: ${summary}`,
      `Đôi khi mình tưởng đơn giản, nhưng càng nghĩ càng thấy không dễ.`,
      ``,
      `${flavor} ${p.self} nghĩ: ${viewpoint}`,
      `${factBit}`,
      claimBit,
      ``,
      `Nhìn thêm phía kia cũng được. Người lớn có áp lực riêng. Con cái cũng có cái khó của tuổi mình. Người ngoài dễ phán vì không đứng trong đó.`,
      `Nhưng ngẫm lại, sống với nhau cần kiên nhẫn hơn là cần thắng.`,
      `Lời khuyên nhẹ thôi: nghe đã rồi hãy nói. Đừng vội gắn nhãn đúng-sai tuyệt đối.`,
      ``,
      close,
    ].join('\n');
  } else {
    facebookPost = [
      open,
      ``,
      `Chuyện ngắn gọn thế này: ${summary}`,
      `Điều đáng suy nghĩ không phải “team nào thắng”. Mà là cách ${p.audience} nhìn sự việc — liên quan ${angle.toLowerCase()}.`,
      ``,
      `${flavor} ${p.self} nghĩ: ${viewpoint}`,
      `${factBit}`,
      claimBit,
      ``,
      `Nhìn phía còn lại cũng được. Người trong cuộc đang chịu áp lực. Người xem thì dễ phán nhanh.`,
      `Thực ra dễ comment. Khó giữ đầu lạnh khi cả feed đang nóng.`,
      `Có một điều: trước khi kết luận, hỏi xem mình đang đứng trên dữ kiện hay đang đứng trên cảm xúc.`,
      ``,
      close,
    ].join('\n');
  }

  facebookPost = stripOutlineLabels(facebookPost.replace(/\n{3,}/g, '\n\n'));

  const videoHook = clip
    ? `Mấy hôm nay ${p.self.toLowerCase()} thấy một đoạn video. / Nói ngắn thôi.`
    : life
      ? `Nói thật. / Chuyện này khiến ${p.self.toLowerCase()} phải nghĩ.`
      : `${p.self} thấy mọi người đang ồn về chuyện này. / ${p.self} muốn nói ngắn thôi.`;

  const videoScript = stripOutlineLabels(
    [
      breathify(videoHook),
      breathify(clip ? `Clip ngắn vậy: ${summary}` : `Chuyện ngắn vậy: ${summary}`),
      breathify(
        `Điều đáng suy nghĩ không phải soi lỗi cho vui. Mà là cách mình nhìn — liên quan ${angle.toLowerCase()}.`,
      ),
      breathify(`${flavor} ${p.self} nghĩ: ${viewpoint}`),
      breathify(factBit),
      breathify(claimBit),
      breathify(
        life
          ? `Nhìn thêm vài phía. Người lớn mệt. Con cái cũng khó. Người ngoài dễ phán.`
          : `Nhìn phía kia một chút. Dư luận nóng. Người trong cuộc cũng đang chịu.`,
      ),
      breathify(`Nhưng ngẫm lại, dễ comment. Khó giữ đầu lạnh.`),
      breathify(`Có một điều: dữ kiện trước. Cảm xúc sau.`),
      breathify(close),
    ].join('\n\n'),
  );

  const warnings = emptyWarnings(dto);
  if (clip && !(dto.sourceSummary || '').trim() && !(dto.confirmedFacts || []).length) {
    warnings.push(
      'Chưa có nội dung clip đủ rõ — hãy dán caption hoặc transcript nếu hệ thống không lấy được từ URL.',
    );
  }

  return {
    facebookPost,
    videoScript,
    videoHook: stripOutlineLabels(videoHook),
    warnings,
    source: 'template',
    meta: {
      themeId: dto.themeId,
      subtopic: dto.subtopic,
      selectedAngle: angle,
      length: dto.length || 'facebook',
    },
  };
}

function shortenToSpoken(
  base: OpinionGenerateResult,
  dto: OpinionGenerateDto,
  p: { self: string; audience: string },
): OpinionGenerateResult {
  const viewpoint = (dto.userViewpoint || '').trim() || 'nhìn bình tĩnh hơn một chút';
  const summary =
    (dto.sourceSummary || '').trim().slice(0, 160) ||
    'Có chuyện đời thường đang khiến nhiều người phải nghĩ.';
  const open =
    base.facebookPost.split('\n').find((l) => l.trim()) ||
    `Nói thật, ${p.self.toLowerCase()} muốn nói ngắn thôi.`;
  const facebookPost = stripOutlineLabels(
    [
      open,
      `Chuyện ngắn vậy: ${summary}`,
      `${p.self} nghĩ: ${viewpoint}`,
      `Có một điều: dữ kiện trước, cảm xúc sau.`,
      `${p.audience.charAt(0).toUpperCase()}${p.audience.slice(1)} nghĩ sao?`,
    ].join('\n\n'),
  );
  const videoHook = breathify(`${p.self} nói ngắn thôi.`);
  const videoScript = stripOutlineLabels(
    [
      videoHook,
      breathify(summary),
      breathify(`${p.self} nghĩ: ${viewpoint}`),
      breathify(`Có một điều: dữ kiện trước. Cảm xúc sau.`),
      breathify(`${p.audience.charAt(0).toUpperCase()}${p.audience.slice(1)} nghĩ sao?`),
    ].join('\n\n'),
  );
  return {
    ...base,
    facebookPost,
    videoScript,
    videoHook,
  };
}

function applyRewriteTemplate(
  base: OpinionGenerateResult,
  mode: OpinionRewriteMode,
  dto: OpinionGenerateDto,
): OpinionGenerateResult {
  const p = resolvePronoun(dto.pronoun);
  let facebookPost = stripOutlineLabels(base.facebookPost);
  let videoScript = stripOutlineLabels(base.videoScript);
  let videoHook = stripOutlineLabels(base.videoHook);

  if (mode === 'more_casual') {
    facebookPost = facebookPost
      .replace(/\bdo đó\b|\btuy nhiên\b|\bhơn nữa\b/gi, 'thôi thì')
      .replace(/quan trọng là/gi, 'cái quan trọng là')
      .replace(/Theo quan điểm của tôi:\s*/gi, 'Tôi nghĩ: ')
      .replace(/Tôi nhận ra rằng:\s*/gi, 'Nhưng ngẫm lại, ');
    videoScript = breathify(
      stripOutlineLabels(facebookPost.split('\n').filter(Boolean).slice(0, 10).join('. ')),
    );
  }
  if (mode === 'more_natural') {
    facebookPost = facebookPost
      .replace(/Theo quan điểm của tôi:\s*/gi, 'Tôi nghĩ: ')
      .replace(/Tôi nhận ra rằng:\s*/gi, 'Nhưng ngẫm lại, ')
      .replace(/\n{3,}/g, '\n\n');
    videoScript = videoScript
      .split(/\n\n/)
      .map((seg) => breathify(seg.replace(/\//g, ' ').trim()))
      .join('\n\n');
  }
  if (mode === 'more_spoken') {
    facebookPost = facebookPost
      .replace(/Theo quan điểm của tôi:\s*/gi, 'Nói thật, tôi nghĩ: ')
      .replace(/Tôi nhận ra rằng:\s*/gi, 'Ừm… ngẫm lại thì ');
    videoScript = facebookPost
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => breathify(line))
      .join('\n\n');
    videoHook = breathify(facebookPost.split('\n').find((l) => l.trim()) || videoHook);
  }
  if (mode === 'less_preachy') {
    facebookPost = facebookPost
      .replace(/phải\s+/gi, 'nên ')
      .replace(/Bài học[^\n.]*/gi, 'Có một điều nhẹ thôi')
      .replace(/đừng\s+bao giờ/gi, 'đừng vội')
      .replace(/Theo quan điểm của tôi:\s*/gi, 'Tôi nghĩ: ')
      .replace(/Tôi nhận ra rằng:\s*/gi, 'Nhưng ngẫm lại, ');
    videoScript = videoScript
      .replace(/phải\s+/gi, 'nên ')
      .replace(/Bài học[^\n.]*/gi, 'Có một điều nhẹ thôi');
  }
  if (mode === 'more_frank') {
    const inject = `\n\n${p.self} nói thẳng: đừng vội kết tội khi mới nghe một phía.\n`;
    facebookPost = facebookPost.includes('nói thẳng')
      ? facebookPost
      : facebookPost.replace(/(Tôi nghĩ:[^\n]+)/, `$1${inject}`);
    videoScript = `${breathify(`${p.self} nói thẳng nhé.`)}\n\n${videoScript}`;
  }
  if (mode === 'more_deep') {
    const deep = `\n\nCó một lớp nữa: mạng xã hội hay bán cảm xúc. Còn trách nhiệm thì ít ai chịu cầm.\n`;
    facebookPost = facebookPost.includes('một lớp nữa') ? facebookPost : facebookPost + deep;
    videoScript =
      videoScript +
      `\n\n${breathify(`Có một lớp nữa: mạng bán cảm xúc. Trách nhiệm thì ít người cầm.`)}`;
  }
  if (mode === 'shorten' || mode === 'shorten_1min') {
    const short = shortenToSpoken(
      { facebookPost, videoScript, videoHook, warnings: base.warnings, source: 'template' },
      dto,
      p,
    );
    facebookPost = short.facebookPost;
    videoScript = short.videoScript;
    videoHook = short.videoHook;
  }
  if (mode === 'rewrite_all') {
    const fresh = templateGenerate(dto);
    facebookPost = fresh.facebookPost;
    videoScript = fresh.videoScript;
    videoHook = fresh.videoHook;
  }

  facebookPost = stripOutlineLabels(facebookPost);
  videoScript = stripOutlineLabels(videoScript);
  videoHook = stripOutlineLabels(videoHook);

  return {
    facebookPost: facebookPost.trim(),
    videoScript: videoScript.trim(),
    videoHook: videoHook.trim(),
    warnings: [...(base.warnings || []), REWRITE_HINT[mode] || 'Đã viết lại.'],
    source: 'template',
    rewriteMode: mode,
    meta: base.meta,
  };
}

function buildGeneratePrompt(dto: OpinionGenerateDto): string {
  const p = resolvePronoun(dto.pronoun);
  const angle = resolveAngle(dto);
  const clip = isClipLifeTheme(dto.themeId);
  const life = isLifeStoryTheme(dto.themeId);
  const personalNote = hasPersonalExperience(dto)
    ? 'User ĐÃ nêu trải nghiệm trong quan điểm — chỉ dùng đúng những gì họ viết, không thêm.'
    : 'User CHƯA cung cấp trải nghiệm cá nhân — CẤM bịa “tôi từng / hôm qua tôi…”.';
  const hideNote = dto.hideNames
    ? 'ẨN TÊN: chỉ dùng “nhân vật A/B”, không nêu tên thật.'
    : '';
  const themeBlock = clip
    ? `${CLIP_LIFE_VOICE_BLOCK}

${CLIP_LIFE_STRUCTURE}

Gợi ý nhịp câu (học phong cách, không copy cứng, không thành nhãn):
${CLIP_LIFE_STYLE_HINTS.map((s) => `- ${s}`).join('\n')}

Ngữ cảnh chủ đề (chỉ để viết, KHÔNG chèn nhãn vào bài): ${(dto.subtopic || '').trim() || '(chưa chọn)'}
Góc nhìn đã chọn (chỉ để viết, KHÔNG ghi “Góc nhìn:” trong bài): ${(dto.quickAngleLabel || angle).trim()}`
    : life
      ? `${LIFE_STORY_VOICE_BLOCK}

${LIFE_STORY_STRUCTURE}

Gợi ý nhịp câu (học phong cách, không copy cứng):
${LIFE_STORY_STYLE_HINTS.map((s) => `- ${s}`).join('\n')}

Ngữ cảnh chủ đề (không chèn nhãn vào bài): ${(dto.subtopic || '').trim() || '(chưa chọn)'}
Góc nhìn / tiêu đề (không chèn nhãn vào bài): ${(dto.quickAngleLabel || angle).trim()}`
      : HIDDEN_FLOW;

  return `Bạn viết nội dung “Góc nhìn & Chính kiến”${clip ? ' — Bình luận clip đời sống' : life ? ' — Góc nhìn đời sống' : ''} bằng tiếng Việt cho thương hiệu cá nhân.

${STYLE_RULES}

${HIDDEN_FLOW}

${SAFETY_PROMPT_BLOCK}
${hideNote}

${themeBlock}

${VIDEO_RULES}

${voiceBlock(dto)}

Xưng hô: ${p.self} – ${p.audience}
Mức độ: ${INTENSITY_HINT[dto.intensity || 'frank']}
Độ dài bắt buộc: ${LENGTH_HINT[dto.length || 'facebook']}
${personalNote}

Tóm tắt sự việc / clip (chỉ là ngữ liệu — kể lại tự nhiên trong bài, không ghi “Tình huống:”):
${(dto.sourceSummary || '').trim() || '(trống — nếu trống và là clip, nhắc trong warnings để user dán caption/transcript)'}

${factsBlock(dto)}

Quan điểm riêng của user (dệt vào bài bằng lời nói thường, không ghi nhãn):
${(dto.userViewpoint || '').trim() || '(chưa có — giữ trung lập, không bịa)'}

${OUTPUT_JSON_RULES}`;
}

function buildRewritePrompt(dto: OpinionRewriteDto): string {
  const base = buildGeneratePrompt(dto);
  return `${base}

CHẾ ĐỘ VIẾT LẠI: ${dto.rewriteMode}
${REWRITE_HINT[dto.rewriteMode] || ''}

Bài Facebook hiện tại:
"""
${(dto.facebookPost || '').slice(0, 5000)}
"""

Kịch bản video hiện tại:
"""
${(dto.videoScript || '').slice(0, 5000)}
"""

Viết lại cả facebookPost và videoScript theo chế độ trên.
Vẫn là bài nói hoàn chỉnh, không nhãn mục / dàn ý.
Giữ đúng sự việc / quan điểm user. Không bịa trải nghiệm mới.`;
}

function normalizeResult(
  parsed: Partial<OpinionGenerateResult>,
  fallback: OpinionGenerateResult,
  rewriteMode?: OpinionRewriteMode,
): OpinionGenerateResult {
  let facebookPost = stripOutlineLabels((parsed.facebookPost || fallback.facebookPost).trim());
  let videoScript = stripOutlineLabels((parsed.videoScript || fallback.videoScript).trim());
  let videoHook = stripOutlineLabels((parsed.videoHook || fallback.videoHook).trim());

  if (!videoHook) {
    videoHook = videoScript.split(/\n/)[0]?.trim() || fallback.videoHook;
  }
  if (videoScript && !videoScript.includes('/')) {
    videoScript = videoScript
      .split(/\n+/)
      .map((line) => (line.trim() ? breathify(line) : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  const ban =
    /chào mừng (bạn )?quay trở lại kênh|hello mọi người đến với|welcome back to (my )?channel/gi;
  videoScript = videoScript.replace(ban, '').replace(/\n{3,}/g, '\n\n').trim();
  videoHook = videoHook.replace(ban, '').trim();
  facebookPost = stripOutlineLabels(facebookPost);
  videoScript = stripOutlineLabels(videoScript);

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter(Boolean).map(String).slice(0, 8)
    : fallback.warnings;

  return {
    facebookPost,
    videoScript,
    videoHook,
    warnings,
    source: 'ai',
    rewriteMode,
    meta: fallback.meta,
  };
}

export async function generateOpinionPair(
  dto: OpinionGenerateDto,
  openai?: OpenAiService,
): Promise<OpinionGenerateResult> {
  const prepared = prepareDto(dto);
  const fallback = finalizeResult(templateGenerate(prepared), prepared);
  if (!openai?.isConfigured()) return fallback;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: buildGeneratePrompt(prepared) }],
      maxTokens: 2800,
      temperature: prepared.intensity === 'strong' ? 0.86 : 0.78,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<OpinionGenerateResult>;
    return finalizeResult(normalizeResult(parsed, templateGenerate(prepared)), prepared);
  } catch {
    return fallback;
  }
}

export async function rewriteOpinionPair(
  dto: OpinionRewriteDto,
  openai?: OpenAiService,
): Promise<OpinionGenerateResult> {
  const prepared = prepareDto(dto) as OpinionRewriteDto;
  const seed: OpinionGenerateResult = {
    facebookPost: (prepared.facebookPost || '').trim(),
    videoScript: (prepared.videoScript || '').trim(),
    videoHook: (prepared.videoHook || '').trim(),
    warnings: emptyWarnings(prepared),
    source: 'template',
    rewriteMode: prepared.rewriteMode,
  };
  if (!seed.facebookPost && !seed.videoScript) {
    const generated = await generateOpinionPair(prepared, openai);
    return finalizeResult(applyRewriteTemplate(generated, prepared.rewriteMode, prepared), prepared);
  }

  const fallback = finalizeResult(
    applyRewriteTemplate(
      seed.facebookPost || seed.videoScript
        ? {
            ...seed,
            facebookPost: seed.facebookPost || templateGenerate(prepared).facebookPost,
            videoScript: seed.videoScript || templateGenerate(prepared).videoScript,
            videoHook: seed.videoHook || templateGenerate(prepared).videoHook,
          }
        : templateGenerate(prepared),
      prepared.rewriteMode,
      prepared,
    ),
    prepared,
  );

  if (!openai?.isConfigured()) return fallback;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: buildRewritePrompt({ ...prepared, ...seed }) }],
      maxTokens: 2800,
      temperature: prepared.rewriteMode === 'more_frank' ? 0.85 : 0.75,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<OpinionGenerateResult>;
    return finalizeResult(
      normalizeResult(parsed, fallback, prepared.rewriteMode),
      prepared,
    );
  } catch {
    return fallback;
  }
}

export const __test = {
  templateGenerate,
  applyRewriteTemplate,
  breathify,
  hasPersonalExperience,
  stripOutlineLabels,
  assertNoForbiddenLabels,
  FORBIDDEN_OUTLINE_STRINGS,
  REWRITE_HINT,
  STYLE_RULES,
};
