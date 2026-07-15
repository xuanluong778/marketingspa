import type { GenerateContentDto } from './dto/content-marketing.dto';
import {
  BRAND_ARTICLE_GENRES,
  BRAND_OPENING_STYLES,
  contentUsesForbiddenOpener,
  normalizeBrandDefaults,
  pickOpeningStyle,
  type BrandArticleGenre,
} from './brand-post-config';

const BRAND_PUNCHLINE_POOL = [
  'Thất bại không giết mày, cái giết mày là nằm im rồi tự thương hại chính mình.',
  'Đời không nợ mày cơ hội, mày phải tự đứng dậy mà giành lấy.',
  'Người bản lĩnh không phải người chưa từng gục, mà là người gục xong vẫn biết bò dậy.',
  'Phụ nữ đẹp không phải để giữ ai, mà để không đánh mất chính mình.',
  'Chăm sóc bản thân không phải phù phiếm, đó là lòng tự trọng.',
  'Một spa tử tế không chỉ làm da khách đẹp hơn, mà làm họ tin lại vào chính mình.',
  'Không ai cứu được mày ngoài chính mày — kể cả liệu trình đắt nhất.',
  'Tự trách mình mãi cũng không làm da sáng hơn — hành động mới làm được.',
];

/** Template đa dạng khi AI offline — mỗi genre + opening style khác nhau */
export function templateGenerateBrandPost(
  dto: GenerateContentDto,
  seed?: number,
): { content: string; hooks: string[]; openers: string[]; punchlines: string[]; source: 'template' } {
  const topic = (dto.postTopic ?? dto.productService).trim();
  const audience = dto.targetAudience?.trim() || 'người đọc trên Facebook';
  const angle = dto.personalAngle?.trim() || 'một sự thật ít ai dám nói thẳng';
  const story = dto.storyIdea?.trim() || 'khoảnh khắc khiến tôi phải nhìn lại chính mình';
  const { genre, pronoun, intensity } = normalizeBrandDefaults(
    dto.brandArticleGenre,
    dto.brandPronoun,
    dto.brandVoiceIntensity,
  );
  const opening = pickOpeningStyle(seed ?? Date.now());

  const openerLine = buildTemplateOpener(opening.id, topic, story, pronoun, angle, seed ?? 0);
  const body = buildTemplateBody(genre, topic, audience, angle, story, pronoun, intensity);
  const closing =
    pronoun === 'may_tao'
      ? 'Đứng dậy đi. Không phải ngày mai — hôm nay. Ai cần nghe điều này thì gửi cho họ.'
      : 'Nếu bạn đọc đến đây — hãy làm một việc nhỏ cho chính mình hôm nay. Rồi comment cho tôi biết bạn chọn gì.';

  let content = [openerLine, '', body, '', closing].join('\n');

  if (contentUsesForbiddenOpener(content)) {
    content = [buildTemplateOpener('observation', topic, story, 'ban_toi', angle, (seed ?? 0) + 1), '', body, '', closing].join(
      '\n',
    );
  }

  const punchlineStart = Math.abs(seed ?? 0) % BRAND_PUNCHLINE_POOL.length;
  const punchlines = Array.from({ length: 6 }, (_, i) =>
    BRAND_PUNCHLINE_POOL[(punchlineStart + i) % BRAND_PUNCHLINE_POOL.length]!,
  );

  const hooks = BRAND_OPENING_STYLES.slice(0, 5).map((s, i) =>
    buildTemplateOpener(s.id, topic, story, pronoun, angle, (seed ?? 0) + i + 10).slice(0, 120),
  );
  const openers = BRAND_OPENING_STYLES.slice(0, 5).map((s, i) =>
    buildTemplateOpener(s.id, topic, `${story} — lần ${i + 1}`, pronoun, angle, (seed ?? 0) + i + 20).slice(0, 100),
  );

  return { content, hooks, openers, punchlines, source: 'template' };
}

function pronounYou(p: string): string {
  if (p === 'may_tao') return 'mày';
  if (p === 'anh_em') return 'em';
  if (p === 'chi_em') return 'em';
  if (p === 'parent_child') return 'con';
  return 'bạn';
}

function buildTemplateOpener(
  styleId: string,
  topic: string,
  story: string,
  pronoun: string,
  angle: string,
  seed: number,
): string {
  const you = pronounYou(pronoun);
  const variants: Record<string, string[]> = {
    short_story: [
      `Hôm qua tôi gặp một người phụ nữ — ${story}. Chúng tôi không nói về ${topic} ngay, nhưng tôi biết đó là lý do cô ấy đến.`,
      `Có buổi tối im lặng lạ, tôi ngồi nhìn khách ra về và nghĩ về ${topic}.`,
    ],
    provocative_question: [
      `Bao lâu rồi ${you} nhìn gương mà thấy người lạ?`,
      `${you.charAt(0).toUpperCase() + you.slice(1)} có đang sống cuộc đời của mình — hay cuộc đời người khác mong đợi?`,
    ],
    pain_punch: [
      `Không phải ${you} yếu — ${you} chỉ quen hy sinh bản thân đến mức quên mình xứng đáng được chăm sóc.`,
      `Sự thật về ${topic}: đôi khi nỗi đau không ở da, mà ở chỗ ${you} không cho phép mình được nghỉ.`,
    ],
    confession: [
      `Tôi ít khi viết về ${topic}, nhưng hôm nay nghĩ ai đó cần nghe.`,
      `Nếu ${you} đang đọc dòng này lúc nửa đêm — tôi viết cho ${you}, không phải cho lượt like.`,
    ],
    paradox: [
      `Càng cố trông có vẻ ổn, nhiều người càng cô đơn hơn với chính mình — ${topic} cũng vậy.`,
      `Đôi khi ${you} không cần thêm lời khuyên. ${you} cần một không gian được là chính mình.`,
    ],
    after_fall: [
      `Tôi từng ${story}. Sau cú ngã đó, tôi mới hiểu ${topic} không phải chuyện xa vời.`,
      `Thất bại dạy tôi điều thành công không bao giờ nói: ${angle}.`,
    ],
    relationship_scene: [
      `"Em mệt quá" — câu nói quen thuộc. Nhưng phía sau đó là ${story}.`,
      `Chị khách kể chồng không hiểu vì sao chị đi spa. Tôi hiểu — vì ${you} cũng cần được nhìn thấy.`,
    ],
    observation: [
      `Có người bước vào spa không vì da xấu — mà vì họ quên cách được chăm sóc.`,
      `Tôi để ý: phụ nữ hay cười khi nói về ${topic}, nhưng mắt thì không cười.`,
    ],
    direct_truth: [
      `Làm đẹp không cứu được mọi thứ — nhưng tự trọng thì có thể cứu ${you} khỏi những thứ đang bào mòn ${you}.`,
      `${topic}: không ai nói hết sự thật, trừ khi họ thật sự quan tâm ${you}.`,
    ],
    dialogue_hook: [
      `"Chị ơi, làm đẹp có ích gì khi nhà vẫn loạn?" — câu hỏi ấy khiến tôi im lặng khá lâu.`,
      `"Tại sao phụ nữ phải đẹp?" — ${you} hỏi. Tôi không trả lời ngay.`,
    ],
  };
  const list = variants[styleId] ?? variants.observation!;
  return list[Math.abs(seed) % list.length]!;
}

function buildTemplateBody(
  genre: BrandArticleGenre,
  topic: string,
  audience: string,
  angle: string,
  story: string,
  pronoun: string,
  intensity: string,
): string {
  const you = pronounYou(pronoun);
  const spaBridge =
    'Một spa tử tế không chỉ làm da khách đẹp hơn — mà làm họ tin lại vào chính mình. Chăm sóc bản thân không phải phù phiếm, đó là lòng tự trọng. Làm đẹp là cách phụ nữ lấy lại khí chất — không phải để giữ ai, mà để không đánh mất chính mình.';

  const genreParagraphs: Record<BrandArticleGenre, string[]> = {
    edgy_motivation: [
      `${angle}. ${you.charAt(0).toUpperCase() + you.slice(1)} không thiếu cơ hội — ${you} thiếu quyền dừng lại và hỏi: mình đang sống cho ai?`,
      `Muốn đổi đời thì bắt đầu từ việc không coi thường bản thân nữa. ${intensity === 'very_strong' ? 'Thẳng thắn: đừng chờ ai cho phép.' : 'Không ai cứu được ' + you + ' ngoài chính ' + you + '.'}`,
      spaBridge,
    ],
    love_advice: [
      `Tình yêu đẹp khi hai người còn giữ được ranh giới và sự tôn trọng — kể cả trong chuyện gần gũi. ${story}.`,
      `Đừng đánh đổi giá trị bản thân để giữ ai đó. ${you.charAt(0).toUpperCase() + you.slice(1)} xứng đáng được yêu mà không phải hy sinh hết mình.`,
      spaBridge,
    ],
    life_lesson: [
      `${story}. Tôi rút ra: ${angle}.`,
      `Cuộc sống không trả lời ngay — nhưng nó phản hồi theo cách ${you} đối xử với chính mình.`,
      spaBridge,
    ],
    parent_advice: [
      `Con à, bố/mẹ không mong con hoàn hảo — chỉ mong con đừng quên mình là ai giữa bao nhiêu kỳ vọng.`,
      `${topic} — con sẽ hiểu khi con trải qua. Nhưng hãy nhớ: chăm sóc bản thân không phải ích kỷ.`,
      spaBridge,
    ],
    friend_advice: [
      `Nếu ${you} hỏi tôi thật lòng về ${topic}, tôi sẽ nói: ${angle}.`,
      `${story}. Tôi từng như ${you}. Giờ tôi chỉ muốn ${you} bớt khổ vì tự trách mình.`,
      spaBridge,
    ],
    women_beauty: [
      `Phụ nữ không sinh ra để xinh cho ai ngắm — nhưng được phép yêu làn da, cơ thể, vóc dáng của mình.`,
      `${angle}. Làm đẹp không phải hình phạt hay cuộc đua vô tận.`,
      spaBridge,
    ],
    marriage_family: [
      `Gia đình cần người khỏe mạnh cả thể chất lẫn tinh thần — không phải người héo mòn vì hy sinh im lặng.`,
      `${story}. Hôn nhân bền khi còn hai người biết giữ mình cho nhau.`,
      spaBridge,
    ],
    success_failure: [
      `Thành công ồn ào đôi khi che giấu những đêm ${you} không ngủ được. Thất bại thì dạy ${you} ai thật sự ở lại.`,
      `${angle}. ${topic} — tôi học được sau cả hai.`,
      spaBridge,
    ],
    spa_profession: [
      `Nghề spa không chỉ là thoa kem — là lắng nghe, là giữ an toàn, là không hứa hẹn điều ta không chắc.`,
      `${story}. Mỗi khách mang một câu chuyện; ${angle}.`,
      `Uy tín spa không xây bằng caption đẹp — xây bằng kết quả thật và sự thấu hiểu.`,
    ],
    spa_owner_brand: [
      `Xây thương hiệu spa không phải chuyện một ngày. ${story}.`,
      `${angle}. Tôi chọn uy tín hơn doanh số ảo — vì ${audience} tin tôi bằng trải nghiệm, không bằng lời hứa.`,
      spaBridge,
    ],
    intimate_story: [
      `Cơ thể và cảm xúc luôn liên quan — tôi nói điều này như người làm nghề chăm sóc, không phải giảng đạo.`,
      `${story}. ${angle}. Tôi viết điều này tế nhị — vì biết có người cần nghe mà không bị phán xét.`,
      spaBridge,
    ],
  };

  return (genreParagraphs[genre] ?? genreParagraphs.life_lesson).join('\n\n');
}

/** Kiểm tra đa dạng mở đầu — dùng cho test */
export function collectTemplateOpeners(count: number): {
  openers: string[];
  genres: BrandArticleGenre[];
  forbiddenCount: number;
  uniqueOpeners: number;
} {
  const openers: string[] = [];
  const genres: BrandArticleGenre[] = [];
  let forbiddenCount = 0;

  for (let i = 0; i < count; i++) {
    const dto = {
      postTopic: `Chủ đề test ${i}`,
      productService: `Chủ đề test ${i}`,
      brandArticleGenre: BRAND_ARTICLE_GENRES[i % BRAND_ARTICLE_GENRES.length],
      brandPronoun: (['auto', 'may_tao', 'ban_toi', 'chi_em', 'anh_em'] as const)[i % 5],
      brandVoiceIntensity: (['gentle_deep', 'frank', 'edgy', 'strong', 'very_strong'] as const)[i % 5],
      personalAngle: `Góc nhìn ${i}`,
      storyIdea: `Câu chuyện ${i}`,
    } as GenerateContentDto;

    const result = templateGenerateBrandPost(dto, i * 137);
    const first = result.content.trim().split('\n')[0] ?? '';
    openers.push(first);
    genres.push(normalizeBrandDefaults(dto.brandArticleGenre, dto.brandPronoun, dto.brandVoiceIntensity).genre);
    if (contentUsesForbiddenOpener(result.content)) forbiddenCount++;
  }

  return {
    openers,
    genres,
    forbiddenCount,
    uniqueOpeners: new Set(openers).size,
  };
}
