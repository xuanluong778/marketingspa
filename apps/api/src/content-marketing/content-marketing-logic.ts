import type { OpenAiService } from '../openai/openai.service';
import {
  getAdObjectiveConfig,
  normalizeAdObjective,
} from './ad-objective-config';
import {
  BOLD_MAY_TAO_TONE_LABEL,
  getPersonalTonePromptBlock,
  isBoldMayTaoTone,
  MAY_TAO_INSPIRATION_CTAS,
} from './personal-tone-prompts';
import {
  buildBrandPostPrompt,
  contentUsesForbiddenOpener,
  normalizeBrandDefaults,
  pickOpeningStyle,
} from './brand-post-config';
import { templateGenerateBrandPost } from './brand-post-template';
import type {
  GenerateContentDto,
  AnalyzeVideoDto,
  CheckPolicyDto,
  ScoreContentDto,
  RewriteContentDto,
} from './dto/content-marketing.dto';

export interface PolicyFlag {
  phrase: string;
  reason: string;
  suggestion: string;
}

export interface PolicyCheckResult {
  safetyScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  flaggedPhrases: PolicyFlag[];
  saferVersion: string;
  disclaimer: string;
}

export interface ContentScoreCriteria {
  hook: number;
  insight: number;
  benefits: number;
  proof: number;
  cta: number;
  readability: number;
  platformFit: number;
  policySafety: number;
}

export interface ContentScoreResult {
  total: number;
  criteria: ContentScoreCriteria;
  strengths: string[];
  improvements: string[];
  adsReadiness: 'low' | 'medium' | 'high';
}

export interface VideoAnalysisResult {
  topic: string;
  insights: string[];
  hook: string;
  angle: string;
  contentIdeas: string[];
  suggestedCta: string;
  source: 'ai' | 'heuristic';
}

export interface PersonalScoreCriteria {
  hook: number;
  emotion: number;
  relatability: number;
  personalAngle: number;
  engagement: number;
  naturalness: number;
}

export interface PersonalScoreResult {
  total: number;
  criteria: PersonalScoreCriteria;
  strengths: string[];
  improvements: string[];
  interactionReadiness: 'low' | 'medium' | 'high';
  naturalnessNotes: string[];
}

export interface GeneratePersonalResult {
  content: string;
  hooks: string[];
  openers: string[];
  punchlines: string[];
  source: 'ai' | 'template';
}

export interface GenerateContentResult {
  content: string;
  hooks: string[];
  ctas: string[];
  source: 'ai' | 'template';
}

const SOFT_INTERACTION_CTAS = [
  'Bạn thấy đúng không?',
  'Bạn đã từng gặp chuyện này chưa?',
  'Nếu thấy hay hãy lưu lại.',
  'Bạn nghĩ sao về góc nhìn này?',
  'Comment quan điểm của bạn nhé.',
];

const SALES_CTA_PATTERNS =
  /inbox để mua|đăng ký ngay|chốt đơn|nhận ưu đãi|mua ngay|inbox ngay|đặt lịch ngay|nhắn tin để mua/giu;

const AI_LIKE_PATTERNS =
  /tóm lại|kết luận|trên đây là|dưới đây là|điều quan trọng là|hãy nhớ rằng|🔥|✅|📖|💡|👉/giu;

const POLICY_DISCLAIMER =
  'Đây là đánh giá rủi ro tự động, không đảm bảo nội dung được Facebook duyệt 100%.';

const RISK_RULES: Array<{
  pattern: RegExp;
  reason: string;
  suggestion: string;
  penalty: number;
}> = [
  {
    pattern: /100\s*%|triệt để|hoàn toàn chữa|chắc chắn 100|đảm bảo 100/giu,
    reason: 'Cam kết quá mức',
    suggestion: 'Dùng "có thể giúp", "nhiều khách hài lòng"',
    penalty: 18,
  },
  {
    pattern: /bạn là ai|tuổi tác|tôn giáo|dân tộc|giới tính|hôn nhân/giu,
    reason: 'Thuộc tính cá nhân nhạy cảm',
    suggestion: 'Tránh nhắm đối tượng theo thuộc tính cá nhân',
    penalty: 22,
  },
  {
    pattern: /trước.{0,20}sau|before.{0,10}after|ảnh trước|ảnh sau/giu,
    reason: 'Before/after nhạy cảm',
    suggestion: 'Mô tả quy trình, trải nghiệm thay vì so sánh hình ảnh',
    penalty: 20,
  },
  {
    pattern: /sợ|hoảng|kinh hoàng|chết|tai nạn|mất trắng/giu,
    reason: 'Hù dọa / gây sợ',
    suggestion: 'Tập trung giải pháp tích cực',
    penalty: 15,
  },
  {
    pattern: /chữa khỏi|điều trị|bệnh lý|thuốc|y tế|bác sĩ khuyên|FDA/giu,
    reason: 'Tuyên bố y tế/điều trị',
    suggestion: 'Tránh claim y khoa, dùng "chăm sóc", "hỗ trợ"',
    penalty: 25,
  },
  {
    pattern: /làm giàu|triệu phú|thu nhập 1 tỷ|kiếm tiền nhanh|passive income ngay/giu,
    reason: 'Làm giàu quá đà',
    suggestion: 'Nêu kết quả thực tế, có căn cứ',
    penalty: 20,
  },
  {
    pattern: /ngu|đồ ngu|xấu xí|thất bại|vô dụng|đĩ|chửi/giu,
    reason: 'Giật gân / xúc phạm',
    suggestion: 'Giữ giọng tôn trọng, tránh từ tiêu cực',
    penalty: 18,
  },
];

function safeNum(n: number): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampScore(n: number, max = 100): number {
  return safeNum(Math.min(n, max));
}

function extractMatchPhrase(content: string, pattern: RegExp): string {
  const m = content.match(pattern);
  return m?.[0]?.trim() ?? pattern.source.slice(0, 30);
}

export function checkAdPolicyRisk(input: CheckPolicyDto): PolicyCheckResult {
  const content = input.content.trim();
  let safetyScore = 100;
  const flaggedPhrases: PolicyFlag[] = [];
  const seen = new Set<string>();

  for (const rule of RISK_RULES) {
    if (rule.pattern.test(content)) {
      const phrase = extractMatchPhrase(content, rule.pattern);
      const key = `${rule.reason}:${phrase}`;
      if (!seen.has(key)) {
        seen.add(key);
        flaggedPhrases.push({
          phrase,
          reason: rule.reason,
          suggestion: rule.suggestion,
        });
        safetyScore -= rule.penalty;
      }
      rule.pattern.lastIndex = 0;
    }
  }

  safetyScore = safeNum(safetyScore);
  let riskLevel: PolicyCheckResult['riskLevel'] = 'low';
  if (safetyScore < 50) riskLevel = 'high';
  else if (safetyScore < 75) riskLevel = 'medium';

  let saferVersion = content;
  for (const flag of flaggedPhrases) {
    if (flag.phrase && saferVersion.includes(flag.phrase)) {
      saferVersion = saferVersion.replace(flag.phrase, `[${flag.suggestion}]`);
    }
  }
  if (saferVersion === content && flaggedPhrases.length > 0) {
    saferVersion = `${content}\n\n(Gợi ý: ${flaggedPhrases[0]?.suggestion ?? 'Viết lại an toàn hơn'})`;
  }

  return {
    safetyScore,
    riskLevel,
    flaggedPhrases: flaggedPhrases.slice(0, 8),
    saferVersion,
    disclaimer: POLICY_DISCLAIMER,
  };
}

export function scoreAdContent(
  input: ScoreContentDto,
  policy?: PolicyCheckResult,
): ContentScoreResult {
  const content = input.content.trim();
  const lines = content.split('\n').filter((l: string) => l.trim());
  const firstLine = lines[0] ?? '';
  const lower = content.toLowerCase();
  const objective =
    getAdObjectiveConfig(input.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(input.adObjective));

  const policyResult = policy ?? checkAdPolicyRisk({ content, platform: input.platform });

  let hook =
    (clampScore(
      (firstLine.length >= 15 && firstLine.length <= 120 ? 40 : 20) +
        (/[!?]/.test(firstLine) ? 20 : 0) +
        (/\d/.test(firstLine) ? 15 : 0) +
        (firstLine.length > 0 ? 25 : 0),
      100,
    ) /
      100) *
    12.5;

  const insight =
    (clampScore(
      (/vấn đề|nỗi đau|khó khăn|stress|mệt|lo lắng/i.test(content) ? 50 : 20) +
        (/vì|bởi|nguyên nhân/i.test(content) ? 30 : 0) +
        (lines.length >= 2 ? 20 : 0),
      100,
    ) /
      100) *
    12.5;

  const benefits =
    (clampScore(
      (/lợi ích|giúp|tiết kiệm|cải thiện|hiệu quả/i.test(content) ? 55 : 15) +
        (content.includes('•') || content.includes('-') ? 25 : 0) +
        (lines.length >= 3 ? 20 : 0),
      100,
    ) /
      100) *
    12.5;

  let proof =
    (clampScore(
      (/%|khách hàng|review|case|kết quả|số liệu|\d+/.test(content) ? 60 : 15) +
        (/đã|từng|thực tế/i.test(content) ? 25 : 0),
      100,
    ) /
      100) *
    12.5;

  let cta =
    (clampScore(
      (/inbox|đăng ký|đặt lịch|mua|liên hệ|nhắn|comment|click|để lại/i.test(lower) ? 65 : 10) +
        (content.length > 50 ? 25 : 0),
      100,
    ) /
      100) *
    12.5;

  if (objective) {
    if (objective.hookPattern.test(firstLine)) hook = Math.min(12.5, hook * 1.15);
    if (objective.proofPattern.test(content)) proof = Math.min(12.5, proof * 1.1);
    if (objective.ctaPattern.test(lower)) {
      cta = Math.min(12.5, cta * objective.ctaWeight);
    } else if (objective.value === 'brand_awareness') {
      if (/câu chuyện|thương hiệu|hành trình|sứ mệnh/i.test(lower)) {
        cta = Math.max(cta, 8);
      }
    } else {
      cta *= 0.85;
    }
  }

  const sentences = content.split(/[.!?]/).filter(Boolean);
  const avgSentence =
    sentences.reduce((a: number, s: string) => a + s.length, 0) / Math.max(1, sentences.length);
  const readability =
    (clampScore(
      (avgSentence <= 120 ? 50 : 25) +
        (lines.length <= 12 ? 35 : 15) +
        (content.length >= 80 ? 15 : 5),
      100,
    ) /
      100) *
    12.5;

  const platform = input.platform ?? 'facebook';
  const platformLimits: Record<string, number> = {
    facebook: content.length <= 500 ? 80 : content.length <= 1200 ? 60 : 40,
    tiktok: content.length <= 300 ? 85 : 50,
    zalo: content.length <= 600 ? 75 : 55,
  };
  const platformFit =
    (clampScore((platformLimits[platform] ?? 60) + (/emoji|🔥|✨/u.test(content) ? 15 : 0), 100) /
      100) *
    12.5;

  const policySafety = (policyResult.safetyScore / 100) * 12.5;

  const criteria: ContentScoreCriteria = {
    hook: safeNum(hook),
    insight: safeNum(insight),
    benefits: safeNum(benefits),
    proof: safeNum(proof),
    cta: safeNum(cta),
    readability: safeNum(readability),
    platformFit: safeNum(platformFit),
    policySafety: safeNum(policySafety),
  };

  const total = safeNum(Object.values(criteria).reduce((sum, v) => sum + v, 0));

  const strengths: string[] = [];
  const improvements: string[] = [];

  const labels: Record<keyof ContentScoreCriteria, string> = {
    hook: 'Hook mở đầu',
    insight: 'Insight / nỗi đau',
    benefits: 'Lợi ích rõ ràng',
    proof: 'Bằng chứng / social proof',
    cta: 'CTA',
    readability: 'Dễ đọc',
    platformFit: 'Phù hợp nền tảng',
    policySafety: 'An toàn chính sách',
  };

  (Object.keys(criteria) as (keyof ContentScoreCriteria)[]).forEach((key) => {
    const v = criteria[key];
    if (v >= 9) strengths.push(`${labels[key]} tốt (${v}/12.5)`);
    else if (v < 6) improvements.push(`Cải thiện ${labels[key].toLowerCase()}`);
  });

  if (strengths.length === 0) strengths.push('Nội dung có nền tảng, cần tối ưu thêm');
  if (improvements.length === 0) improvements.push('Có thể A/B test thêm hook và CTA');

  if (objective) {
    if (!objective.hookPattern.test(firstLine) && criteria.hook < 9) {
      improvements.push(`Hook chưa phù hợp mục tiêu "${objective.label}" — ${objective.description}`);
    }
    if (!objective.ctaPattern.test(lower) && criteria.cta < 9) {
      improvements.push(`CTA nên hướng tới: ${objective.description.toLowerCase()}`);
    }
  }

  let adsReadiness: ContentScoreResult['adsReadiness'] = 'low';
  if (total >= 75 && policyResult.safetyScore >= 70) adsReadiness = 'high';
  else if (total >= 55 && policyResult.safetyScore >= 50) adsReadiness = 'medium';

  return { total, criteria, strengths, improvements, adsReadiness };
}

function detectSalesCta(content: string): boolean {
  return SALES_CTA_PATTERNS.test(content);
}

function checkNaturalness(content: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 100;

  const aiMatches = content.match(AI_LIKE_PATTERNS);
  if (aiMatches && aiMatches.length >= 3) {
    score -= 25;
    notes.push('Nhiều emoji/icon hoặc cụm từ giống AI — nên viết tự nhiên hơn');
  }

  if (/•|^\d+\./m.test(content)) {
    score -= 10;
    notes.push('Danh sách bullet có thể làm bài giống template — thử viết đoạn văn liền mạch');
  }

  if (detectSalesCta(content)) {
    score -= 30;
    notes.push('Phát hiện CTA bán hàng — tab cá nhân nên dùng CTA tương tác nhẹ');
  }

  if (!/tôi|mình|tớ/i.test(content)) {
    score -= 15;
    notes.push('Thiếu giọng nói cá nhân (tôi/mình) — nên thêm trải nghiệm riêng');
  }

  if (content.length < 80) {
    score -= 10;
    notes.push('Bài hơi ngắn — khó tạo kết nối cảm xúc');
  }

  return { score: safeNum(score), notes };
}

export function scorePersonalContent(input: ScoreContentDto): PersonalScoreResult {
  const content = input.content.trim();
  const lines = content.split('\n').filter((l: string) => l.trim());
  const firstLine = lines[0] ?? '';
  const lower = content.toLowerCase();

  const hook = safeNum(
    clampScore(
      (firstLine.length >= 20 && firstLine.length <= 150 ? 50 : 25) +
        (/[!?…]/.test(firstLine) ? 25 : 0) +
        (firstLine.length > 0 ? 25 : 0),
      100,
    ) * 0.2,
  );

  const emotion = safeNum(
    clampScore(
      (/cảm|xúc|yêu|buồn|vui|đau|hạnh phúc|mất mát|biết ơn|hy vọng|sợ|lo/i.test(content)
        ? 55
        : 20) + (/…|!/u.test(content) ? 20 : 0) + (lines.length >= 3 ? 25 : 0),
      100,
    ) * 0.2,
  );

  const relatability = safeNum(
    clampScore(
      (/đời thường|hàng ngày|ai cũng|đôi khi|thật ra|như mọi người/i.test(content) ? 50 : 20) +
        (/tôi|mình/i.test(content) ? 30 : 0) +
        (/bạn|mọi người/i.test(content) ? 20 : 0),
      100,
    ) * 0.15,
  );

  const personalAngle = safeNum(
    clampScore(
      (/theo tôi|góc nhìn|quan điểm|tôi nghĩ|tôi tin|trải nghiệm của tôi/i.test(content)
        ? 60
        : 15) + (/vì|bởi vì|nhưng/i.test(content) ? 25 : 0),
      100,
    ) * 0.15,
  );

  const engagement = safeNum(
    clampScore(
      (/\?/.test(content) ? 40 : 10) +
        (/comment|chia sẻ|lưu lại|bạn nghĩ|bạn thấy|đúng không/i.test(lower) ? 45 : 0) +
        (detectSalesCta(content) ? -30 : 15),
      100,
    ) * 0.15,
  );

  const naturalnessCheck = checkNaturalness(content);
  const naturalness = safeNum((naturalnessCheck.score / 100) * 15);

  const criteria: PersonalScoreCriteria = {
    hook,
    emotion,
    relatability,
    personalAngle,
    engagement: safeNum(Math.max(0, engagement)),
    naturalness,
  };

  const total = safeNum(
    Object.values(criteria).reduce((sum, v) => sum + v, 0),
  );

  const strengths: string[] = [];
  const improvements: string[] = [];

  const labels: Record<keyof PersonalScoreCriteria, string> = {
    hook: 'Hook mở đầu',
    emotion: 'Cảm xúc',
    relatability: 'Gần gũi',
    personalAngle: 'Góc nhìn cá nhân',
    engagement: 'Khả năng tương tác',
    naturalness: 'Độ tự nhiên',
  };

  const maxScores: Record<keyof PersonalScoreCriteria, number> = {
    hook: 20,
    emotion: 20,
    relatability: 15,
    personalAngle: 15,
    engagement: 15,
    naturalness: 15,
  };

  (Object.keys(criteria) as (keyof PersonalScoreCriteria)[]).forEach((key) => {
    const v = criteria[key];
    const max = maxScores[key];
    if (v >= max * 0.75) strengths.push(`${labels[key]} tốt (${v}/${max})`);
    else if (v < max * 0.5) improvements.push(`Cải thiện ${labels[key].toLowerCase()}`);
  });

  if (strengths.length === 0) strengths.push('Bài có nền tảng, cần thêm cảm xúc và góc nhìn cá nhân');
  if (improvements.length === 0) improvements.push('Có thể thử thêm câu hỏi mở để kích thích bình luận');

  let interactionReadiness: PersonalScoreResult['interactionReadiness'] = 'low';
  if (total >= 75 && !detectSalesCta(content)) interactionReadiness = 'high';
  else if (total >= 55) interactionReadiness = 'medium';

  return {
    total,
    criteria,
    strengths,
    improvements,
    interactionReadiness,
    naturalnessNotes: naturalnessCheck.notes,
  };
}

function templateGeneratePersonal(dto: GenerateContentDto): GeneratePersonalResult {
  const enriched = { ...dto };
  if (isBoldMayTaoTone(dto.personalTone)) {
    enriched.brandPronoun = enriched.brandPronoun ?? 'may_tao';
    enriched.brandVoiceIntensity = enriched.brandVoiceIntensity ?? 'strong';
    enriched.brandArticleGenre = enriched.brandArticleGenre ?? 'edgy_motivation';
  }
  return templateGenerateBrandPost(enriched);
}

function templateGenerate(dto: GenerateContentDto): GenerateContentResult {
  const product = dto.productService.trim();
  const audience = dto.targetAudience?.trim() || 'khách hàng mục tiêu';
  const pain = dto.painPoints?.trim() || 'nỗi đau thường gặp';
  const benefit = dto.benefits?.trim() || 'giải pháp rõ ràng';
  const offer = dto.offer?.trim() || '';
  const objective =
    getAdObjectiveConfig(dto.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(dto.adObjective));
  const cta = dto.cta?.trim() || objective?.defaultCta || 'Inbox ngay để được tư vấn';
  const platform = dto.platform ?? 'facebook';
  const objectiveLine = objective
    ? `Mục tiêu: ${objective.label} — ${objective.description}`
    : dto.adObjective
      ? `Mục tiêu: ${dto.adObjective}`
      : '';

  const content = [
    `🎯 [${platform.toUpperCase()}] ${product}`,
    '',
    `Hook: ${pain}? Đừng bỏ lỡ cơ hội ${benefit}.`,
    '',
    `Insight: ${audience} thường gặp ${pain}.`,
    `Lợi ích: ${benefit}.`,
    offer ? `Ưu đãi: ${offer}` : '',
    objectiveLine,
    '',
    `CTA: ${cta}`,
  ]
    .filter(Boolean)
    .join('\n');

  const defaultHooks = [
    `${pain}? Có giải pháp rồi.`,
    `90% ${audience} mắc sai lầm này`,
    `3 giây để hiểu vì sao ${product} khác biệt`,
    `Dừng ${pain} — bắt đầu từ hôm nay`,
    `Bí quyết ${benefit} (thực tế)`,
  ];

  return {
    content,
    hooks: objective?.defaultHooks ?? defaultHooks,
    ctas: [cta, 'Inbox "TƯ VẤN"', 'Đặt lịch ngay', 'Nhận ưu đãi', 'Comment "OK" để nhận tư vấn'].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    ).slice(0, 5),
    source: 'template',
  };
}

export async function generateMarketingContent(
  dto: GenerateContentDto,
  openai?: OpenAiService,
): Promise<GenerateContentResult> {
  if (!openai?.isConfigured()) {
    return templateGenerate(dto);
  }

  const tone = dto.tone ?? 'friendly';
  const objective =
    getAdObjectiveConfig(dto.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(dto.adObjective));
  const type =
    dto.mode === 'ad'
      ? (dto.adContentType ?? objective?.defaultContentType ?? 'sales')
      : (dto.personalPostType ?? 'personal_story');

  const prompt = `Bạn là chuyên gia content marketing spa/wellness tại Việt Nam.
Viết content tiếng Việt, mode=${dto.mode}, loại=${type}, giọng=${tone}, nền tảng=${dto.platform ?? 'facebook'}.
Sản phẩm/dịch vụ: ${dto.productService}
Khách mục tiêu: ${dto.targetAudience ?? ''}
Nỗi đau: ${dto.painPoints ?? ''}
Lợi ích: ${dto.benefits ?? ''}
Ưu đãi: ${dto.offer ?? ''}
Mục tiêu QC: ${objective ? `${objective.label} — ${objective.description}` : (dto.adObjective ?? '')}
${objective ? `Hướng dẫn theo mục tiêu: ${objective.generateHint}` : ''}
CTA: ${dto.cta ?? objective?.defaultCta ?? ''}
${dto.transcript ? `Tham khảo transcript: ${dto.transcript.slice(0, 2000)}` : ''}

Trả JSON (không markdown):
{"content":"...","hooks":["h1","h2","h3","h4","h5"],"ctas":["c1","c2","c3","c4","c5"]}
Tuân thủ chính sách Facebook, tránh cam kết tuyệt đối.`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
      temperature: 0.7,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as GenerateContentResult;
    return {
      content: parsed.content || templateGenerate(dto).content,
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 5) : [],
      ctas: Array.isArray(parsed.ctas) ? parsed.ctas.slice(0, 5) : [],
      source: 'ai',
    };
  } catch {
    return templateGenerate(dto);
  }
}

const PERSONAL_LENGTH_HINT: Record<string, string> = {
  short: '150–300 từ',
  medium: '300–600 từ',
  long: '600+ từ',
};

export async function generatePersonalContent(
  dto: GenerateContentDto,
  openai?: OpenAiService,
): Promise<GeneratePersonalResult> {
  if (!openai?.isConfigured()) {
    return templateGeneratePersonal(dto);
  }

  const topic = dto.postTopic ?? dto.productService;
  const lengthHint = PERSONAL_LENGTH_HINT[dto.postLength ?? 'medium'] ?? '300–600 từ';
  const { genre, pronoun, intensity } = normalizeBrandDefaults(
    dto.brandArticleGenre,
    dto.brandPronoun ?? (isBoldMayTaoTone(dto.personalTone) ? 'may_tao' : undefined),
    dto.brandVoiceIntensity ?? (isBoldMayTaoTone(dto.personalTone) ? 'strong' : undefined),
  );
  const openingStyle = pickOpeningStyle(Date.now() + topic.length);
  const legacyTone = isBoldMayTaoTone(dto.personalTone)
    ? BOLD_MAY_TAO_TONE_LABEL
    : dto.personalTone ?? 'approachable';

  const prompt = buildBrandPostPrompt({
    topic,
    audience: dto.targetAudience ?? '',
    goal: dto.postGoal ?? 'engagement',
    genre,
    pronoun,
    intensity,
    lengthHint,
    angle: dto.personalAngle ?? '',
    storyIdea: dto.storyIdea ?? '',
    transcript: dto.transcript,
    openingStyle,
    legacyTone,
  });

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2400,
      temperature: intensity === 'very_strong' || intensity === 'strong' ? 0.9 : 0.85,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as GeneratePersonalResult;
    const fallback = templateGeneratePersonal(dto);
    let content = parsed.content || fallback.content;
    if (contentUsesForbiddenOpener(content)) {
      content = fallback.content;
    }
    return {
      content,
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 5) : fallback.hooks,
      openers: Array.isArray(parsed.openers) ? parsed.openers.slice(0, 5) : fallback.openers,
      punchlines: Array.isArray(parsed.punchlines)
        ? parsed.punchlines.slice(0, 8)
        : fallback.punchlines,
      source: 'ai',
    };
  } catch {
    return templateGeneratePersonal(dto);
  }
}

function rewritePersonalFallback(dto: RewriteContentDto): { variants: string[]; mode: string } {
  const first = dto.content.split('\n')[0] ?? dto.content.slice(0, 80);
  if (dto.mode === 'shorter')
    return { variants: [dto.content.split('\n').slice(0, 5).join('\n')], mode: dto.mode };
  if (dto.mode === 'longer')
    return {
      variants: [
        `${dto.content}\n\nTôi viết thêm vài dòng vì nghĩ có thể ai đó cũng đang trải qua điều tương tự. Nếu bạn đọc đến đây, cảm ơn vì đã dành thời gian.`,
      ],
      mode: dto.mode,
    };
  if (dto.mode === 'hooks_5') {
    return {
      variants: [
        first,
        `Có ai từng... ${first.toLowerCase()}`,
        `Tôi không biết bạn thế nào, nhưng ${first.toLowerCase()}`,
        `Đôi khi ${first.toLowerCase()}`,
        `Sáng nay tôi chợt nghĩ: ${first.toLowerCase()}`,
      ],
      mode: dto.mode,
    };
  }
  if (dto.mode === 'openers_5') {
    return {
      variants: [
        `Tôi muốn kể một chuyện nhỏ...`,
        `Không ai hỏi, nhưng tôi vẫn muốn chia sẻ.`,
        `Có lẽ đây là bài viết không "viral", nhưng là của tôi.`,
        `Ai cũng có những ngày thế này — tôi cũng vậy.`,
        `Đọc xong bài này, bạn có thể sẽ nghĩ khác một chút.`,
      ],
      mode: dto.mode,
    };
  }
  if (dto.mode === 'ab_3') {
    return {
      variants: [
        dto.content,
        dto.content.replace(/\n\n/g, '\n').slice(0, Math.ceil(dto.content.length * 0.85)),
        `${dto.content}\n\n${SOFT_INTERACTION_CTAS[2]}`,
      ],
      mode: dto.mode,
    };
  }
  if (dto.mode === 'funnier')
    return {
      variants: [`${dto.content}\n\n(Thật ra lúc viết bài này tôi cũng hơi... buồn cười về chính mình.)`],
      mode: dto.mode,
    };
  if (dto.mode === 'deeper')
    return {
      variants: [`${dto.content}\n\nĐôi khi ta cần dừng lại và hỏi: mình đang sống hay chỉ đang chạy?`],
      mode: dto.mode,
    };
  if (dto.mode === 'more_emotional')
    return {
      variants: [`${dto.content}\n\nTôi viết những dòng này với tất cả sự chân thành.`],
      mode: dto.mode,
    };
  if (dto.mode === 'more_motivational')
    return {
      variants: [`${dto.content}\n\nNếu hôm nay khó khăn, hãy nhớ: bạn đã từng vượt qua những ngày tệ hơn.`],
      mode: dto.mode,
    };
  return { variants: [dto.content], mode: dto.mode };
}

function heuristicVideoAnalysis(text: string): VideoAnalysisResult {
  const lines = text.split('\n').filter((l) => l.trim());
  const first = lines[0]?.trim() ?? text.slice(0, 120);
  return {
    topic: first.slice(0, 80) || 'Chủ đề từ nội dung video',
    insights: [
      'Khán giả quan tâm giải pháp thực tế, không thích hứa hẹn quá đà',
      'Nên nhấn insight đau điểm trong 3 giây đầu',
      'CTA rõ ràng giúp tăng inbox/lead',
    ],
    hook: first.length > 10 ? first : 'Mở đầu bằng câu hỏi hoặc số liệu gây tò mò',
    angle: 'Góc nhìn trải nghiệm thực tế + lợi ích cụ thể',
    contentIdeas: [
      'Biến hook video thành ads caption ngắn',
      'Tách insight làm carousel 3 slide',
      'Viết bài cá nhân kể hậu trường',
    ],
    suggestedCta: 'Inbox để nhận tư vấn miễn phí',
    source: 'heuristic',
  };
}

export async function analyzeVideoAngle(
  dto: AnalyzeVideoDto,
  openai?: OpenAiService,
): Promise<VideoAnalysisResult> {
  const transcript = dto.transcript?.trim() ?? '';
  const videoUrl = dto.videoUrl?.trim() ?? '';

  if (!transcript && !videoUrl) {
    return {
      topic: '',
      insights: ['Vui lòng dán link video hoặc transcript/caption'],
      hook: '',
      angle: '',
      contentIdeas: [],
      suggestedCta: '',
      source: 'heuristic',
    };
  }

  const sourceText =
    transcript ||
    `(Không trích xuất được nội dung từ link: ${videoUrl}. Hãy phân tích dựa trên URL và gợi ý user dán transcript thủ công.)`;

  if (!openai?.isConfigured()) {
    return transcript
      ? heuristicVideoAnalysis(transcript)
      : {
          ...heuristicVideoAnalysis(''),
          insights: [
            'Không lấy được transcript từ link — vui lòng dán caption/transcript thủ công',
            'Phân tích tự động từ link cần tích hợp API nền tảng hoặc OpenAI',
          ],
          source: 'heuristic',
        };
  }

  const prompt = `Phân tích góc content từ video/post:
URL: ${videoUrl || 'không có'}
Nội dung/transcript:
${sourceText.slice(0, 4000)}

Trả JSON:
{"topic":"","insights":["",""],"hook":"","angle":"","contentIdeas":["",""],"suggestedCta":""}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
      temperature: 0.5,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as VideoAnalysisResult;
    return { ...parsed, source: 'ai' };
  } catch {
    return heuristicVideoAnalysis(transcript || sourceText);
  }
}

export async function rewriteContentVariant(
  dto: RewriteContentDto,
  openai?: OpenAiService,
): Promise<{ variants: string[]; mode: string }> {
  const isPersonal = dto.studioMode === 'personal';

  const countMap: Record<string, number> = {
    stronger: 1,
    safer: 1,
    shorter: 1,
    longer: 1,
    funnier: 1,
    deeper: 1,
    more_emotional: 1,
    more_motivational: 1,
    hooks_5: 5,
    cta_5: 5,
    openers_5: 5,
    ab_3: 3,
  };
  const count = countMap[dto.mode] ?? 1;

  const modeLabels: Record<string, string> = isPersonal
    ? {
        funnier: 'hài hước hơn, vui nhộn hơn',
        deeper: 'sâu sắc hơn',
        more_emotional: 'cảm động hơn',
        more_motivational: 'truyền động lực hơn',
        shorter: 'ngắn gọn hơn',
        longer: 'dài hơn, chi tiết hơn',
        hooks_5: '5 hook mở đầu khác nhau',
        openers_5: '5 tiêu đề/góc mở bài khác nhau',
        ab_3: '3 phiên bản A/B test',
      }
    : {
        stronger: 'mạnh hơn, thuyết phục hơn',
        safer: 'an toàn chính sách Facebook hơn',
        shorter: 'ngắn gọn hơn',
        longer: 'dài hơn, chi tiết hơn',
        funnier: 'hài hước hơn',
        hooks_5: '5 hook mở đầu khác nhau',
        cta_5: '5 CTA khác nhau',
        ab_3: '3 phiên bản A/B test',
      };

  if (!openai?.isConfigured()) {
    if (isPersonal) return rewritePersonalFallback(dto);

    const policy = checkAdPolicyRisk({ content: dto.content });
    if (dto.mode === 'safer') return { variants: [policy.saferVersion], mode: dto.mode };
    if (dto.mode === 'shorter')
      return { variants: [dto.content.split('\n').slice(0, 4).join('\n')], mode: dto.mode };
    if (dto.mode === 'hooks_5') {
      const first = dto.content.split('\n')[0] ?? dto.content.slice(0, 80);
      return {
        variants: [
          first,
          `Bạn có biết? ${first}`,
          `3 lý do: ${first}`,
          `Sự thật: ${first}`,
          `Đừng bỏ lỡ: ${first}`,
        ],
        mode: dto.mode,
      };
    }
    if (dto.mode === 'cta_5') {
      return {
        variants: [
          'Inbox ngay',
          'Comment "TƯ VẤN"',
          'Đặt lịch hôm nay',
          'Nhắn tin để nhận ưu đãi',
          'Click link bio',
        ],
        mode: dto.mode,
      };
    }
    if (dto.mode === 'ab_3') {
      return {
        variants: [
          dto.content,
          dto.content.replace(/^/m, '🔥 '),
          `${dto.content}\n\n⏰ Ưu đãi có hạn`,
        ],
        mode: dto.mode,
      };
    }
    return { variants: [dto.content], mode: dto.mode };
  }

  const prompt = isPersonal
    ? `Viết lại bài đăng Facebook CÁ NHÂN tiếng Việt, yêu cầu: ${modeLabels[dto.mode] ?? dto.mode}.
KHÔNG bán hàng, KHÔNG CTA mua hàng. Chỉ CTA tương tác nhẹ (hỏi ý kiến, mời comment, lưu bài).
Giọng: ${isBoldMayTaoTone(dto.personalTone) ? BOLD_MAY_TAO_TONE_LABEL : (dto.personalTone ?? 'approachable')}.
${getPersonalTonePromptBlock(dto.personalTone) ? `${getPersonalTonePromptBlock(dto.personalTone)}\n` : ''}Tạo đúng ${count} phiên bản.
Content gốc:
${dto.content}

Trả JSON: {"variants":["..."]}`
    : `Viết lại content tiếng Việt, yêu cầu: ${modeLabels[dto.mode]}.
Nền tảng: ${dto.platform ?? 'facebook'}. Giọng: ${dto.tone ?? 'friendly'}.
Tạo đúng ${count} phiên bản.
Content gốc:
${dto.content}

Trả JSON: {"variants":["..."]}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1500,
      temperature: 0.7,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as { variants: string[] };
    return {
      variants: (parsed.variants ?? []).slice(0, count),
      mode: dto.mode,
    };
  } catch {
    if (isPersonal) return rewritePersonalFallback(dto);
    return rewriteContentVariant(dto, undefined);
  }
}

export interface AdInsightsSuggestion {
  painPoints: string;
  benefits: string;
  source: 'ai' | 'template';
}

function templateSuggestAdInsights(dto: {
  productService: string;
  targetAudience?: string;
  platform?: string;
  adObjective?: string;
}): AdInsightsSuggestion {
  const product = dto.productService.trim();
  const audience = dto.targetAudience?.trim() || 'khách hàng mục tiêu';
  const lower = product.toLowerCase();
  const objective =
    getAdObjectiveConfig(dto.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(dto.adObjective));

  let painPoints =
    'Khó tìm giải pháp phù hợp, lo ngại hiệu quả không như mong đợi, thiếu thời gian tìm hiểu kỹ';
  let benefits =
    'Giải pháp rõ ràng, quy trình minh bạch, cảm nhận khác biệt sau liệu trình, được tư vấn tận tâm';

  if (/da|spa|trẻ hóa|facial|skincare|mụn|lỗ chân lông/i.test(lower)) {
    painPoints =
      'Da xỉn màu, lỗ chân lông to, makeup không ăn, da lão hóa sớm do stress và thiếu chăm sóc';
    benefits =
      'Da sáng hơn, mịn màng hơn, makeup ăn nền, thư giãn toàn thân, cải thiện rõ sau liệu trình';
  } else if (/massage|thư giãn|body|gội/i.test(lower)) {
    painPoints =
      'Mỏi vai gáy, căng cơ, mất ngủ, stress công việc, cơ thể luôn mệt mỏi';
    benefits =
      'Thư giãn sâu, giảm đau nhức, ngủ ngon hơn, tái tạo năng lượng, cảm giác nhẹ người';
  } else if (/giảm cân|slim|eo|dáng|fit/i.test(lower)) {
    painPoints =
      'Mỡ bụng tích tụ, khó giảm cân dù đã thử nhiều cách, mất tự tin về vóc dáng';
    benefits =
      'Vóc dáng săn chắc hơn, giảm số đo có căn cứ, quy trình an toàn, tự tin hơn khi mặc đồ';
  } else if (/nail|mi|lash|phun xăm|làm đẹp/i.test(lower)) {
    painPoints =
      'Khó giữ nét đẹp lâu, sợ hỏng tự nhiên, không biết chọn dịch vụ uy tín';
    benefits =
      'Lên form chuẩn, bền màu, tự nhiên, được chăm sóc kỹ, phù hợp phong cách cá nhân';
  }

  if (audience && audience !== 'khách hàng mục tiêu') {
    painPoints = `${audience}: ${painPoints}`;
  }

  if (objective?.value === 'messages') {
    benefits = `${benefits}, dễ inbox tư vấn nhanh, phản hồi tận tâm`;
  } else if (objective?.value === 'engagement') {
    painPoints = `${painPoints}, dễ bỏ qua nội dung không gây tò mò`;
    benefits = `${benefits}, dễ chia sẻ, kích thích bình luận`;
  } else if (objective?.value === 'lead_form') {
    benefits = `${benefits}, nhận báo giá/checklist sau khi để lại thông tin`;
  } else if (objective?.value === 'landing_conversion') {
    benefits = `${benefits}, quy trình rõ trên landing, dễ đăng ký/mua`;
  } else if (objective?.value === 'direct_sales') {
    benefits = `${benefits}, ưu đãi rõ, dễ chốt đơn/đặt lịch`;
  } else if (objective?.value === 'remarketing') {
    painPoints = `${painPoints}, đã từng quan tâm nhưng chưa quay lại`;
    benefits = `${benefits}, ưu đãi quay lại, nhắc nhẹ không gây khó chịu`;
  } else if (objective?.value === 'brand_awareness') {
    painPoints = `${painPoints}, chưa biết thương hiệu hoặc chưa tin tưởng`;
    benefits = `${benefits}, câu chuyện thương hiệu, uy tín lâu năm`;
  }

  return {
    painPoints,
    benefits: `${benefits} — phù hợp cho ${product}`,
    source: 'template',
  };
}

export async function suggestAdInsights(
  dto: { productService: string; targetAudience?: string; platform?: string; adObjective?: string },
  openai?: OpenAiService,
): Promise<AdInsightsSuggestion> {
  if (!openai?.isConfigured()) {
    return templateSuggestAdInsights(dto);
  }

  const objective =
    getAdObjectiveConfig(dto.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(dto.adObjective));

  const prompt = `Bạn là chuyên gia marketing spa/wellness tại Việt Nam.
Dựa trên thông tin sau, gợi ý NỖI ĐAU khách hàng và LỢI ÍCH/giải pháp để viết quảng cáo Facebook/TikTok.

Sản phẩm/dịch vụ: ${dto.productService}
Khách mục tiêu: ${dto.targetAudience ?? 'chưa rõ'}
Nền tảng: ${dto.platform ?? 'facebook'}
Mục tiêu quảng cáo: ${objective ? `${objective.label} — ${objective.description}` : 'chưa chọn'}
${objective ? `Ưu tiên insight phù hợp: ${objective.generateHint}` : ''}

Yêu cầu:
- painPoints: 2–4 ý ngắn gọn, cách nhau bằng dấu phẩy hoặc xuống dòng, đúng insight thực tế
- benefits: 2–4 lợi ích cụ thể, có thể cảm nhận được, không cam kết 100%
- Tiếng Việt tự nhiên, phù hợp quảng cáo

Trả JSON (không markdown):
{"painPoints":"...","benefits":"..."}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.6,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
      painPoints?: string;
      benefits?: string;
    };
    const fallback = templateSuggestAdInsights(dto);
    return {
      painPoints: (parsed.painPoints ?? '').trim() || fallback.painPoints,
      benefits: (parsed.benefits ?? '').trim() || fallback.benefits,
      source: 'ai',
    };
  } catch {
    return templateSuggestAdInsights(dto);
  }
}

export interface AdCtaSuggestion {
  cta: string;
  alternatives: string[];
  source: 'ai' | 'template';
}

function templateSuggestAdCta(dto: {
  productService: string;
  targetAudience?: string;
  platform?: string;
  offer?: string;
  adObjective?: string;
  adContentType?: string;
}): AdCtaSuggestion {
  const product = dto.productService.trim();
  const offer = dto.offer?.trim();
  const objective =
    getAdObjectiveConfig(dto.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(dto.adObjective));
  const type = dto.adContentType ?? objective?.defaultContentType ?? 'sales';

  if (objective) {
    const alts: Record<string, string[]> = {
      messages: [
        'Nhắn tin ngay — team online phản hồi trong 5 phút',
        'Inbox để nhận lộ trình phù hợp',
        'Comment "INBOX" để được nhắn riêng',
      ],
      engagement: [
        'Tag người bạn nghĩ cần đọc bài này',
        'Thả tim nếu bạn đồng ý',
        'Share để bạn bè cùng thảo luận',
      ],
      lead_form: [
        'Comment "OK" để nhận báo giá chi tiết',
        'Inbox "BÁO GIÁ" để nhận bảng giá',
        'Điền form — gọi tư vấn trong ngày',
      ],
      landing_conversion: [
        'Click link để xem chi tiết trên landing',
        'Truy cập trang đăng ký — slot có hạn',
        'Xem quy trình đầy đủ trên landing page',
      ],
      direct_sales: [
        offer ? `Inbox "ĐẶT LỊCH" — ${offer}` : 'Inbox "ĐẶT LỊCH" — ưu tiên slot sớm',
        'Nhấn inbox để giữ suất trong tuần này',
        'Comment "MUA" để được nhắn lịch',
      ],
      remarketing: [
        'Bạn còn ưu đãi chưa dùng — inbox để kích hoạt',
        'Inbox "NHẮC" để nhận deal quay lại',
        'Đừng bỏ lỡ — nhắn tin trước khi hết hạn',
      ],
      brand_awareness: [
        'Theo dõi để xem thêm câu chuyện thương hiệu',
        'Tìm hiểu thêm về hành trình của chúng tôi',
        'Xem thêm trên trang — không bán hàng ngay',
      ],
    };
    const alternatives = alts[objective.value] ?? [];
    return {
      cta: objective.defaultCta,
      alternatives: alternatives.slice(0, 4),
      source: 'template',
    };
  }

  const byType: Record<string, string[]> = {
    inbox: [
      `Inbox "TƯ VẤN" để được tư vấn ${product} miễn phí`,
      'Nhắn tin ngay — team online phản hồi trong 5 phút',
      'Inbox để nhận lộ trình phù hợp với bạn',
    ],
    lead: [
      'Comment "OK" để nhận báo giá chi tiết',
      'Để lại SĐT — chúng tôi gọi tư vấn trong ngày',
      'Inbox "BÁO GIÁ" để nhận bảng giá mới nhất',
    ],
    sales: [
      offer ? `Đặt lịch ngay — ${offer}` : `Đặt lịch ${product} hôm nay`,
      'Inbox "ĐẶT LỊCH" — ưu tiên slot sớm nhất',
      'Nhấn inbox để giữ suất trong tuần này',
    ],
    remarketing: [
      'Bạn còn ưu đãi chưa dùng — inbox để kích hoạt',
      'Quay lại hôm nay — inbox "QUAY LẠI" nhận quà',
    ],
    promo: [
      offer ? `Inbox ngay — ${offer}` : 'Inbox "ƯU ĐÃI" để nhận deal tháng này',
      'Số lượng có hạn — nhắn tin để giữ suất',
    ],
    case_study: [
      'Inbox "CASE" để xem kết quả thực tế tương tự bạn',
      'Muốn biết liệu trình phù hợp? Inbox tư vấn miễn phí',
    ],
    video_script: [
      'Xem hết video và inbox "OK" để được tư vấn',
      'Comment "VIDEO" để nhận checklist sau xem',
    ],
    hook_3s: [
      'Inbox ngay nếu bạn liên quan 3 giây đầu',
      'Dừng scroll — inbox "TƯ VẤN" để biết thêm',
    ],
  };

  const list = byType[type] ?? byType.sales ?? [];
  const platform = dto.platform ?? 'facebook';
  const cta =
    list[0] ??
    (platform === 'tiktok'
      ? 'Comment hoặc follow để xem thêm tips'
      : 'Inbox ngay để được tư vấn');

  return {
    cta,
    alternatives: list.slice(1, 5),
    source: 'template',
  };
}

export async function suggestAdCta(
  dto: {
    productService: string;
    targetAudience?: string;
    platform?: string;
    offer?: string;
    adObjective?: string;
    adContentType?: string;
  },
  openai?: OpenAiService,
): Promise<AdCtaSuggestion> {
  if (!openai?.isConfigured()) {
    return templateSuggestAdCta(dto);
  }

  const objective =
    getAdObjectiveConfig(dto.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(dto.adObjective));

  const prompt = `Bạn là copywriter quảng cáo spa/wellness Việt Nam.
Gợi ý CTA (call-to-action) cho quảng cáo ${dto.platform ?? 'facebook'}.

Sản phẩm/dịch vụ: ${dto.productService}
Khách mục tiêu: ${dto.targetAudience ?? ''}
Ưu đãi: ${dto.offer ?? 'không có'}
Mục tiêu QC: ${objective ? `${objective.label} — ${objective.description}` : (dto.adObjective ?? '')}
${objective ? `Hướng dẫn CTA: ${objective.generateHint}` : ''}
Loại content: ${dto.adContentType ?? objective?.defaultContentType ?? 'sales'}

Yêu cầu:
- cta: 1 CTA chính ngắn gọn, rõ hành động (inbox, comment, đặt lịch...)
- alternatives: 4 CTA phụ khác nhau
- Tiếng Việt, phù hợp ads, không cam kết 100%

Trả JSON: {"cta":"...","alternatives":["","",""]}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 350,
      temperature: 0.65,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
      cta?: string;
      alternatives?: string[];
    };
    const fallback = templateSuggestAdCta(dto);
    return {
      cta: (parsed.cta ?? '').trim() || fallback.cta,
      alternatives: Array.isArray(parsed.alternatives)
        ? parsed.alternatives.filter(Boolean).slice(0, 4)
        : fallback.alternatives,
      source: 'ai',
    };
  } catch {
    return templateSuggestAdCta(dto);
  }
}

export interface PersonalIdeasSuggestion {
  personalAngle: string;
  storyIdea: string;
  angleAlternatives: string[];
  storyAlternatives: string[];
  source: 'ai' | 'template';
}

const PERSONAL_ANGLE_BY_GOAL: Record<string, string[]> = {
  engagement: [
    'Đặt câu hỏi để người đọc muốn chia sẻ quan điểm',
    'Góc nhìn trái chiều với điều mọi người hay nghĩ',
    'Chia sẻ điều bạn từng sai về chủ đề này',
  ],
  knowledge: [
    'Chia sẻ điều ít người nói thẳng — từ kinh nghiệm thực tế',
    'Giải thích đơn giản một khái niệm khó hiểu',
    '3 điều tôi ước biết sớm hơn',
  ],
  inspiration: [
    'Thành công không phải lúc nào cũng ồn ào',
    'Thay đổi không cần bước ngoặt lớn — chỉ cần bước đi đều',
    'Học cách chấp nhận bản thân trước khi cố gắng hơn',
  ],
  humor: [
    'Kể chuyện hài nhưng vẫn có bài học nhỏ',
    'Tự trào về một thói quen "dở tệ" ai cũng có',
    'So sánh kỳ vọng vs thực tế một cách dí dỏm',
  ],
  touching_story: [
    'Khoảnh khắc nhỏ thay đổi cách nhìn của bạn',
    'Câu chuyện về người đã giúp bạn đứng dậy',
    'Điều bạn không dám nói to nhưng hôm nay muốn chia sẻ',
  ],
  personal_view: [
    'Quan điểm cá nhân — không ai đúng tuyệt đối',
    'Tôi không đồng ý với cách nhiều người nghĩ về...',
    'Góc nhìn thực tế, không màu hồng',
  ],
  trend: [
    'Bắt trend nhưng thêm góc nhìn riêng, không copy',
    'Trend này đúng với bạn chưa? — chia sẻ thật',
    'Điều trend đang bỏ qua mà bạn thấy quan trọng',
  ],
  personal_branding: [
    'Hành trình xây dựng uy tín từ con số 0',
    'Giá trị cốt lõi bạn không muốn đánh đổi',
    'Cách tôi muốn được nhớ đến trong ngành',
  ],
};

const PERSONAL_STORY_BY_TYPE: Record<string, string[]> = {
  knowledge_sharing: [
    'Kể lần bạn học được bài học quan trọng từ một khách / đồng nghiệp',
    'Một hiểu lầm phổ biến mà bạn từng mắc và cách sửa',
    'Checklist ngắn bạn tự rút ra sau nhiều năm làm nghề',
  ],
  humor: [
    'Tình huống "dở khóc dở cười" trong ngày làm việc',
    'Lần bạn làm điều ngớ ngẩn nhưng rút ra bài học',
    'So sánh kỳ vọng vs thực tế khi mới vào nghề',
  ],
  philosophy: [
    'Một câu hỏi bạn tự hỏi mỗi sáng',
    'Điều bạn học được khi buông bớt sự hoàn hảo',
    'Quan niệm cũ bạn đã thay đổi sau vài năm',
  ],
  touching: [
    'Khoảnh khắc một khách hàng nói câu khiến bạn xúc động',
    'Lần bạn suýt bỏ cuộc nhưng ai đó kéo bạn lại',
    'Câu chuyện về người thân / mentor đã ảnh hưởng đến bạn',
  ],
  motivational: [
    'Ngày tồi tệ nhất và điều giúp bạn đứng dậy',
    'Lần thất bại đầu tiên khi khởi nghiệp / đổi nghề',
    'Thói quen nhỏ mỗi sáng giữ bạn không bỏ cuộc',
  ],
  personal_story: [
    'Kể về lần thất bại đầu tiên khi khởi nghiệp',
    'Hành trình từ người mới đến khi tự tin với nghề',
    'Điều bạn không dám chia sẻ trước đây về chủ đề này',
  ],
  realistic_view: [
    'Sự thật "không ai nói" về ngành spa / làm đẹc',
    'Điều mạng xã hội hay phóng đại mà thực tế khác',
    'Kỳ vọng vs thực tế khi mới bắt đầu',
  ],
  personal_trend: [
    'Trend bạn thấy hay nhưng không phù hợp với mình',
    'Cách bạn bắt trend mà vẫn giữ chất riêng',
    'Điều trend đang bỏ qua — góc nhìn của bạn',
  ],
  failure_lesson: [
    'Dự án / quyết định sai lầm và bài học rút ra',
    'Lần mất khách vì sai sót — bạn xử lý thế nào',
    'Điều bạn sẽ làm khác nếu quay lại thời điểm đó',
  ],
  success_experience: [
    'Bước ngoặt giúp bạn đạt kết quả đầu tiên',
    'Thói quen / quyết định nhỏ tạo khác biệt lớn',
    'Câu chuyện thành công không ồn ào nhưng bền',
  ],
  community_engagement: [
    'Câu hỏi mở để cộng đồng cùng thảo luận',
    'Poll: A hay B — bạn chọn gì và vì sao',
    'Mời mọi người chia sẻ trải nghiệm tương tự',
  ],
};

function templateSuggestPersonalIdeas(dto: {
  postTopic: string;
  targetAudience?: string;
  postGoal?: string;
  personalPostType?: string;
  personalTone?: string;
}): PersonalIdeasSuggestion {
  const topic = dto.postTopic.trim();
  const audience = dto.targetAudience?.trim() || 'người đọc mục tiêu';
  const goal = dto.postGoal ?? 'engagement';
  const postType = dto.personalPostType ?? 'personal_story';

  const angles = PERSONAL_ANGLE_BY_GOAL[goal] ?? PERSONAL_ANGLE_BY_GOAL.engagement ?? [];
  const stories = PERSONAL_STORY_BY_TYPE[postType] ?? PERSONAL_STORY_BY_TYPE.personal_story ?? [];

  const personalAngle =
    angles[0] ?? 'Góc nhìn thực tế từ trải nghiệm cá nhân — không giảng đạo';
  const storyIdea =
    `${stories[0] ?? 'Kể một khoảnh khắc đời thường liên quan đến chủ đề'} — gợi ý cho "${topic}", phù hợp ${audience}`;

  return {
    personalAngle: `${personalAngle} (chủ đề: ${topic})`,
    storyIdea,
    angleAlternatives: angles.slice(1, 4).map((a) => `${a} — ${topic}`),
    storyAlternatives: stories.slice(1, 4).map(
      (s) => `${s} — hướng tới ${audience}`,
    ),
    source: 'template',
  };
}

export async function suggestPersonalIdeas(
  dto: {
    postTopic: string;
    targetAudience?: string;
    postGoal?: string;
    personalPostType?: string;
    personalTone?: string;
  },
  openai?: OpenAiService,
): Promise<PersonalIdeasSuggestion> {
  if (!openai?.isConfigured()) {
    return templateSuggestPersonalIdeas(dto);
  }

  const prompt = `Bạn là người viết bài đăng Facebook CÁ NHÂN tại Việt Nam — KHÔNG phải copywriter bán hàng.
Gợi ý góc nhìn và ý tưởng câu chuyện để viết bài.

Chủ đề: ${dto.postTopic}
Đối tượng đọc: ${dto.targetAudience ?? 'chưa rõ'}
Mục tiêu bài: ${dto.postGoal ?? 'engagement'}
Loại bài: ${dto.personalPostType ?? 'personal_story'}
Văn phong: ${isBoldMayTaoTone(dto.personalTone) ? BOLD_MAY_TAO_TONE_LABEL : (dto.personalTone ?? 'approachable')}
${getPersonalTonePromptBlock(dto.personalTone) ? `\n${getPersonalTonePromptBlock(dto.personalTone)}\n` : ''}

Yêu cầu:
- personalAngle: 1 góc nhìn / thông điệp muốn khai thác, ngắn gọn (1–2 câu)
- storyIdea: 1 ý tưởng câu chuyện thô để viết bài (2–4 câu), cụ thể, đời thường
- angleAlternatives: 3 góc nhìn phụ khác
- storyAlternatives: 3 ý tưởng câu chuyện phụ khác
- Tiếng Việt tự nhiên, KHÔNG bán hàng, KHÔNG CTA mua hàng

Trả JSON (không markdown):
{"personalAngle":"...","storyIdea":"...","angleAlternatives":["","",""],"storyAlternatives":["","",""]}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      temperature: 0.7,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
      personalAngle?: string;
      storyIdea?: string;
      angleAlternatives?: string[];
      storyAlternatives?: string[];
    };
    const fallback = templateSuggestPersonalIdeas(dto);
    return {
      personalAngle: (parsed.personalAngle ?? '').trim() || fallback.personalAngle,
      storyIdea: (parsed.storyIdea ?? '').trim() || fallback.storyIdea,
      angleAlternatives: Array.isArray(parsed.angleAlternatives)
        ? parsed.angleAlternatives.filter(Boolean).slice(0, 3)
        : fallback.angleAlternatives,
      storyAlternatives: Array.isArray(parsed.storyAlternatives)
        ? parsed.storyAlternatives.filter(Boolean).slice(0, 3)
        : fallback.storyAlternatives,
      source: 'ai',
    };
  } catch {
    return templateSuggestPersonalIdeas(dto);
  }
}
