/** Cấu hình tab Xây dựng thương hiệu — thể loại, xưng hô, độ mạnh, mở đầu đa dạng */

export const BRAND_ARTICLE_GENRES = [
  'edgy_motivation',
  'love_advice',
  'life_lesson',
  'parent_advice',
  'friend_advice',
  'women_beauty',
  'marriage_family',
  'success_failure',
  'spa_profession',
  'spa_owner_brand',
  'intimate_story',
] as const;

export const BRAND_PRONOUNS = [
  'auto',
  'may_tao',
  'anh_em',
  'chi_em',
  'parent_child',
  'ban_toi',
  'experienced_youth',
] as const;

export const BRAND_VOICE_INTENSITIES = [
  'gentle_deep',
  'frank',
  'edgy',
  'strong',
  'very_strong',
] as const;

export type BrandArticleGenre = (typeof BRAND_ARTICLE_GENRES)[number];
export type BrandPronoun = (typeof BRAND_PRONOUNS)[number];
export type BrandVoiceIntensity = (typeof BRAND_VOICE_INTENSITIES)[number];

export const BRAND_GENRE_LABELS: Record<BrandArticleGenre, string> = {
  edgy_motivation: 'Truyền động lực gai góc',
  love_advice: 'Lời khuyên tình yêu',
  life_lesson: 'Bài học cuộc sống',
  parent_advice: 'Bố mẹ khuyên con',
  friend_advice: 'Bạn bè khuyên nhau',
  women_beauty: 'Phụ nữ & nhan sắc',
  marriage_family: 'Hôn nhân gia đình',
  success_failure: 'Thành công / thất bại',
  spa_profession: 'Chuyện nghề spa',
  spa_owner_brand: 'Thương hiệu cá nhân chủ spa',
  intimate_story: 'Câu chuyện thân mật tế nhị',
};

export const BRAND_PRONOUN_LABELS: Record<BrandPronoun, string> = {
  auto: 'AI tự chọn phù hợp',
  may_tao: 'Mày / Tao',
  anh_em: 'Anh / Em',
  chi_em: 'Chị / Em',
  parent_child: 'Bố mẹ / Con',
  ban_toi: 'Bạn / Tôi',
  experienced_youth: 'Người từng trải / Người trẻ',
};

export const BRAND_INTENSITY_LABELS: Record<BrandVoiceIntensity, string> = {
  gentle_deep: 'Nhẹ nhưng sâu sắc',
  frank: 'Thẳng thắn',
  edgy: 'Gai góc',
  strong: 'Rất mạnh',
  very_strong: 'Cực gắt (không tục)',
};

/** Kiểu mở đầu — xoay vòng mỗi lần generate */
export const BRAND_OPENING_STYLES = [
  {
    id: 'short_story',
    label: 'Câu chuyện ngắn',
    instruction: 'Mở bằng một cảnh/moment cụ thể, có không gian và chi tiết đời thường — KHÔNG bắt đầu bằng "Mày à".',
    example: 'Hôm qua có một khách vào spa, ngồi im lặng gần mười phút trước khi nói câu đầu tiên.',
  },
  {
    id: 'provocative_question',
    label: 'Câu hỏi xoáy',
    instruction: 'Mở bằng câu hỏi chạm trực diện nỗi đau hoặc nghịch lý — không hỏi sáo rỗng.',
    example: 'Bao lâu rồi bạn nhìn gương mà thấy người lạ?',
  },
  {
    id: 'pain_punch',
    label: 'Câu đấm vào nỗi đau',
    instruction: 'Mở bằng một câu thẳng, ngắn, chạm điểm yếu — không xúc phạm, không miệt thị.',
    example: 'Không phải bạn lười — bạn chỉ quen hy sinh bản thân đến mức quên mình là ai.',
  },
  {
    id: 'confession',
    label: 'Lời tâm sự',
    instruction: 'Mở như đang nói riêng với một người tin cậy — thân mật, chân thật.',
    example: 'Tôi ít khi viết những dòng này, nhưng hôm nay nghĩ ai đó cần nghe.',
  },
  {
    id: 'paradox',
    label: 'Nghịch lý',
    instruction: 'Mở bằng một nghịch lý cuộc sống khiến người đọc dừng lại suy nghĩ.',
    example: 'Càng cố gắng trông có vẻ ổn, nhiều người càng cô đơn hơn với chính mình.',
  },
  {
    id: 'after_fall',
    label: 'Bài học sau cú ngã',
    instruction: 'Mở từ một thất bại, sai lầm, hoặc khoảnh khắc tỉnh ngộ — không drama giả tạo.',
    example: 'Năm ngoái tôi suýt đóng cửa spa vì một quyết định sai lầm tưởng là thông minh.',
  },
  {
    id: 'relationship_scene',
    label: 'Tình huống tình yêu / gia đình / bạn bè',
    instruction: 'Mở bằng tình huống quan hệ cụ thể — tế nhị, trưởng thành, không sến.',
    example: 'Chị ấy cười khi chồng nói "em nhìn mệt quá" — nhưng tôi thấy đôi mắt buồn hơn cười.',
  },
  {
    id: 'observation',
    label: 'Quan sát đời thường',
    instruction: 'Mở bằng một chi tiết nhỏ quan sát được — quán cà phê, hành lang spa, tin nhắn chưa gửi.',
    example: 'Có những người phụ nữ bước vào spa không phải vì da xấu — mà vì họ quên cách được chăm sóc.',
  },
  {
    id: 'direct_truth',
    label: 'Sự thật thẳng',
    instruction: 'Mở bằng một sự thật khó nghe nhưng cần thiết — không moralizing.',
    example: 'Làm đẹp không cứu được mối quan hệ độc hại, nhưng tự trọng thì có thể cứu bạn.',
  },
  {
    id: 'dialogue_hook',
    label: 'Mở bằng thoại',
    instruction: 'Mở bằng một câu thoại ngắn (có thể trích) — tự nhiên, không kịch tính quá đà.',
    example: '"Chị ơi, làm đẹp có ích gì khi nhà vẫn loạn?" — câu hỏi ấy khiến tôi im lặng khá lâu.',
  },
] as const;

export const FORBIDDEN_OPENERS = [
  /^mày à\s*[,!.]/i,
  /^mày à\s*$/i,
  /^mày\s*[,!.]\s*$/i,
];

export function pickOpeningStyle(seed?: number): (typeof BRAND_OPENING_STYLES)[number] {
  const idx =
    seed != null
      ? Math.abs(seed) % BRAND_OPENING_STYLES.length
      : Math.floor(Math.random() * BRAND_OPENING_STYLES.length);
  return BRAND_OPENING_STYLES[idx]!;
}

export function getGenrePromptBlock(genre: BrandArticleGenre): string {
  const blocks: Record<BrandArticleGenre, string> = {
    edgy_motivation:
      'Thể loại: truyền động lực gai góc — đánh thức, không nịnh, không đạo lý rẻ. Chỉ ra thói quen tự phá hoại nhưng vẫn tôn trọng người đọc.',
    love_advice:
      'Thể loại: lời khuyên tình yêu — trưởng thành, tế nhị. Có thể nói về ranh giới, tự trọng, tình dục trong mối quan hệ nhưng KHÔNG dung tục, không khiêu dâm.',
    life_lesson:
      'Thể loại: bài học cuộc sống — rút ra từ trải nghiệm thật, không giáo điều sáo rỗng.',
    parent_advice:
      'Thể loại: bố mẹ khuyên con — ấm nhưng thẳng, không áp đặt, không moralizing.',
    friend_advice:
      'Thể loại: bạn bè khuyên nhau — như cuộc trò chuyện đêm khuya, chân thật, có thể gai góc nhẹ.',
    women_beauty:
      'Thể loại: phụ nữ & nhan sắc — làm đẹp là tự trọng, không phải hình phạt hay chạy theo chuẩn mực xa vời.',
    marriage_family:
      'Thể loại: hôn nhân gia đình — mâu thuẫn, hy sinh, cân bằng; tế nhị, không drama.',
    success_failure:
      'Thể loại: thành công / thất bại — cả hai mặt đều thật, không khoe ảo, không bán khóc lộ.',
    spa_profession:
      'Thể loại: chuyện nghề spa — behind the scenes, nghề nghiệp, khách hàng (ẩn danh), đạo nghề.',
    spa_owner_brand:
      'Thể loại: thương hiệu cá nhân chủ spa — hành trình, giá trị, uy tín, triết lý kinh doanh làm đẹp.',
    intimate_story:
      'Thể loại: câu chuyện thân mật tế nhị — cảm xúc, cơ thể, quan hệ; trưởng thạo, không tục.',
  };
  return blocks[genre] ?? blocks.life_lesson;
}

export function getPronounPromptBlock(pronoun: BrandPronoun): string {
  const blocks: Record<BrandPronoun, string> = {
    auto:
      'Xưng hô: AI tự chọn giọng phù hợp thể loại & đối tượng — đa dạng, không mặc định mày-tao.',
    may_tao:
      'Xưng hô: mày / tao — thân thiết, thẳng. TUYỆT ĐỐI không lạm dụng "Mày à," làm mở đầu; xoay cách gọi.',
    anh_em: 'Xưng hô: anh / em — gần gũi, có thể lãng mạn hoặc thân thiện tùy ngữ cảnh.',
    chi_em: 'Xưng hô: chị / em — ấm, có kinh nghiệm dẫn dắt.',
    parent_child: 'Xưng hô: bố mẹ / con (hoặc mẹ / con) — ấm, có trách nhiệm, không áp đặt.',
    ban_toi: 'Xưng hô: bạn / tôi — trang trọng vừa phải, chân thành.',
    experienced_youth:
      'Xưng hô: người từng trải nói với người trẻ — không giáo huấn, chia sẻ thật.',
  };
  return blocks[pronoun] ?? blocks.auto;
}

export function getIntensityPromptBlock(intensity: BrandVoiceIntensity): string {
  const blocks: Record<BrandVoiceIntensity, string> = {
    gentle_deep:
      'Độ mạnh: nhẹ nhưng sâu — câu chậm, có chiều sâu, không la hét, không drama.',
    frank: 'Độ mạnh: thẳng thắn — nói thật, không vòng vo, vẫn tôn trọng.',
    edgy: 'Độ mạnh: gai góc — câu ngắn, có nhịp, chạm nỗi đau, không toxic.',
    strong: 'Độ mạnh: rất mạnh — đánh thức, có lực, không chửi thề, không miệt thị.',
    very_strong:
      'Độ mạnh: cực gắt nhưng không tục — thẳng đến mức khó chịu (theo nghĩa tích cực), vẫn văn minh.',
  };
  return blocks[intensity] ?? blocks.edgy;
}

export const BRAND_PUNCHLINE_EXAMPLES = `
CÂU ĐINH — PHẢI CÓ 5–8 CÂU TRONG BÀI (có thể cắt làm caption Facebook/TikTok):
Viết câu ngắn, có lực, đọc lên "thấm" và "đau". Không copy y nguyên — sáng tạo theo chủ đề.

Tham khảo kiểu (chỉ là hướng, không lặp y nguyên):
- "Thất bại không giết mày, cái giết mày là nằm im rồi tự thương hại chính mình."
- "Đời không nợ mày cơ hội, mày phải tự đứng dậy mà giành lấy."
- "Người bản lĩnh không phải người chưa từng gục, mà là người gục xong vẫn biết bò dậy."
- "Phụ nữ đẹp không phải để giữ ai, mà để không đánh mất chính mình."
- "Chăm sóc bản thân không phải phù phiếm, đó là lòng tự trọng."
- "Một spa tử tế không chỉ làm da khách đẹp hơn, mà làm họ tin lại vào chính mình."

Mỗi đoạn thân bài nên có ít nhất 1 câu mạnh giữ cảm xúc. Xen câu ngắn dứt khoát với câu dài suy tư.
`.trim();

export const BRAND_ARTICLE_STRUCTURE = `
CẤU TRÚC BÀI (BẮT BUỘC):

1. HOOK (1–3 câu đầu):
   - Phải chạm ngay — câu hỏi xoáy, cú đấm nỗi đau, cảnh cụ thể, nghịch lý, hoặc thoại thật.
   - Người đọc dừng cuộn trong 3 giây đầu.

2. THÂN BÀI (có chiều sâu, không lan man):
   - Câu chuyện cụ thể (có thể từ ý tưởng người dùng hoặc hợp lý với ngữ cảnh spa).
   - Mâu thuẫn / nỗi đau thật — không kể chuyện phi lý, không drama giả.
   - Cú ngã hoặc khoảnh khắc tỉnh ngộ.
   - Bài học rút ra — không giáo điều sáo rỗng.
   - Sự thức tỉnh — cảm giác "bị nói trúng".
   - 5–8 câu đinh rải đều trong bài, mỗi đoạn có 1 câu giữ lửa cảm xúc.

3. LIÊN HỆ SPA (tự nhiên, 1 đoạn ngắn):
   - Làm đẹp = tự trọng; chăm sóc bản thân = phụ nữ lấy lại khí chất.
   - Spa không chỉ bán dịch vụ — bán sự tự tin, sự thấu hiểu, kết quả thật.
   - KHÔNG quảng cáo lộ liễu, KHÔNG inbox/ưu đãi/giá.

4. KẾT BÀI (truyền động lực mạnh):
   - Khiến người đọc muốn đứng dậy hành động — không phải "cố gắng lên" sáo rỗng.
   - CTA tương tác chân thành (hỏi ý kiến, mời chia sẻ, tag người cần nghe) — không CTA rẻ tiền.
`.trim();

export const SPA_BRAND_BRIDGE_BLOCK = `
GẮN THƯƠNG HIỆU SPA (khéo léo, không bán hàng):
- Làm đẹp là tự trọng — chăm sóc bản thân là cách phụ nữ lấy lại khí chất, không phải hình thức hời hợt.
- Spa không chỉ bán dịch vụ — bán sự tự tin, uy tín, kết quả thật, sự thấu hiểu khách hàng.
- Viết như người từng trải / người trong nghề đang chia sẻ thật — không như poster quảng cáo.
- 1 đoạn ngắn (2–4 câu) xen giữa hoặc trước kết — đủ để reader cảm nhận thương hiệu, không ép.
- KHÔNG chốt sale, KHÔNG inbox, KHÔNG ưu đãi, KHÔNG kêu gọi đặt lịch.
`.trim();

export const BRAND_WRITING_RULES = `
VĂN PHONG (BẮT BUỘC):
- Gai góc, mạnh, thật, đời, có chiều sâu — đọc lên thấy "thấm" và "đau".
- Không viết chung chung, không văn mẫu, không đạo lý rẻ tiền.
- Câu chữ có lực; đa dạng nhịp: câu ngắn dứt khoát xen câu dài suy tư.
- Xưng hô linh hoạt (mày/tao, anh/em, bạn/tôi, chị/em) theo ngữ cảnh — KHÔNG lạm dụng, KHÔNG mở đầu "Mày à,".
- Viết như người từng trải đang nói thật — cảm xúc thật, không sáo.
- Tình yêu, tình bạn, thân mật: tế nhị, trưởng thành — không dung tục, không khiêu dâm.
- Không xúc phạm ngoại hình, giới tính, vùng miền, tôn giáo, chính trị.
`.trim();

export const BRAND_AVOID_RULES = `
TUYỆT ĐỐI TRÁNH:
- Mở đầu bài nào cũng "Mày à," hoặc cùng một kiểu hook.
- Viết nhạt, kể chuyện lan man, không có mâu thuẫn.
- Đưa spa vào quá lộ liễu như quảng cáo.
- CTA rẻ tiền: "inbox ngay", "đặt lịch", "giảm giá".
- Câu sáo rỗng: "hãy cố gắng lên", "thành công sẽ đến", "mọi thứ rồi sẽ ổn", "tin vào bản thân".
- Bịa câu chuyện phi lý, drama giả, số liệu không có căn cứ.
- Bullet máy móc, emoji tràn lan, format list thay vì văn xuôi có cảm xúc.
`.trim();

export const BRAND_SELF_CHECK = `
TRƯỚC KHI TRẢ JSON — TỰ KIỂM TRA (phải đạt hết):
☑ Hook 3 câu đầu đủ mạnh, không sáo?
☑ Có câu chuyện + mâu thuẫn + cú ngã/bài học + thức tỉnh?
☑ Có ít nhất 5 câu đinh trong content (liệt kê lại vào punchlines)?
☑ Mỗi đoạn có câu giữ cảm xúc?
☑ Kết bài truyền động lực — reader muốn hành động?
☑ Liên hệ spa tự nhiên, không quảng cáo?
☑ Không văn mẫu, không câu sáo rỗng?
☑ Cảm giác người từng trải nói thật?

Nếu chưa đạt — viết lại trước khi trả kết quả.
`.trim();

export function buildBrandPostPrompt(params: {
  topic: string;
  audience: string;
  goal: string;
  genre: BrandArticleGenre;
  pronoun: BrandPronoun;
  intensity: BrandVoiceIntensity;
  lengthHint: string;
  angle: string;
  storyIdea: string;
  transcript?: string;
  openingStyle: (typeof BRAND_OPENING_STYLES)[number];
  legacyTone?: string;
}): string {
  return `Bạn là người viết bài Facebook/TikTok xây dựng thương hiệu spa/wellness tại Việt Nam.
Giọng viết: người TỪNG TRẢI đang nói THẬT với người đọc — không phải copywriter bán hàng, không phải coach sáo rỗng.

Chủ đề: ${params.topic}
Đối tượng đọc: ${params.audience || 'người theo dõi fanpage spa'}
Mục tiêu bài: ${params.goal}
Độ dài: ${params.lengthHint}
Góc nhìn: ${params.angle || '(AI phát triển từ chủ đề — phải sắc, không chung chung)'}
Ý tưởng/câu chuyện thô: ${params.storyIdea || '(AI sáng tạo hợp lý với ngữ cảnh spa — không bịa phi lý)'}
${params.transcript ? `Tham khảo transcript: ${params.transcript.slice(0, 2000)}` : ''}
${params.legacyTone ? `Giọng bổ sung: ${params.legacyTone}` : ''}

${getGenrePromptBlock(params.genre)}
${getPronounPromptBlock(params.pronoun)}
${getIntensityPromptBlock(params.intensity)}

KIỂU MỞ ĐẦU CHO BÀI NÀY:
- ${params.openingStyle.instruction}
- Hướng tham khảo (không copy): "${params.openingStyle.example}"

${BRAND_WRITING_RULES}

${BRAND_ARTICLE_STRUCTURE}

${BRAND_PUNCHLINE_EXAMPLES}

${SPA_BRAND_BRIDGE_BLOCK}

${BRAND_AVOID_RULES}

${BRAND_SELF_CHECK}

ĐẦU RA: Bài văn xuôi (xuống dòng \\n\\n giữa đoạn), vừa có câu chuyện, vừa cảm xúc, vừa thông điệp thương hiệu spa, vừa có câu đinh đủ cắt caption.

Trả JSON (không markdown):
{"content":"...full bài...","hooks":["5 hook thay thế — mạnh, không trùng mở bài"],"openers":["5 góc mở bài khác"],"punchlines":["5-8 câu đinh hay nhất TRÍCH từ bài — dùng làm caption ngắn"]}

hooks, openers, punchlines: mỗi mục 5–8 item, KHÁC NHAU, KHÔNG "Mày à," làm mở đầu.`;
}

export function contentUsesForbiddenOpener(content: string): boolean {
  const firstLine = content.trim().split('\n')[0]?.trim() ?? '';
  return FORBIDDEN_OPENERS.some((re) => re.test(firstLine));
}

export function normalizeBrandDefaults(
  genre?: string,
  pronoun?: string,
  intensity?: string,
): {
  genre: BrandArticleGenre;
  pronoun: BrandPronoun;
  intensity: BrandVoiceIntensity;
} {
  const g = BRAND_ARTICLE_GENRES.includes(genre as BrandArticleGenre)
    ? (genre as BrandArticleGenre)
    : 'life_lesson';
  const p = BRAND_PRONOUNS.includes(pronoun as BrandPronoun)
    ? (pronoun as BrandPronoun)
    : 'auto';
  const i = BRAND_VOICE_INTENSITIES.includes(intensity as BrandVoiceIntensity)
    ? (intensity as BrandVoiceIntensity)
    : 'edgy';
  return { genre: g, pronoun: p, intensity: i };
}
