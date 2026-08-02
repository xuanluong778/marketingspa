/**
 * Opinion generate/rewrite — spoken continuous scripts, no outline labels.
 * Run: pnpm test:opinion-generate
 */
import assert from 'node:assert/strict';
import {
  __test,
  generateOpinionPair,
  rewriteOpinionPair,
  FORBIDDEN_OUTLINE_STRINGS,
} from '../apps/api/src/content-marketing/opinion-generate.logic';
import type { OpinionGenerateDto } from '../apps/api/src/content-marketing/dto/content-marketing.dto';

const {
  templateGenerate,
  applyRewriteTemplate,
  breathify,
  hasPersonalExperience,
  stripOutlineLabels,
  assertNoForbiddenLabels,
} = __test;

function assertCleanSpoken(text: string, label: string) {
  for (const banned of FORBIDDEN_OUTLINE_STRINGS) {
    assert.ok(
      !text.includes(banned),
      `${label} must not contain "${banned}"`,
    );
  }
  assert.equal(assertNoForbiddenLabels(text), true, `${label} failed forbidden check`);
  assert.doesNotMatch(text, /^\s*(Tình huống|Góc nhìn|Vấn đề|Bài học|Kết luận|Phân tích)\s*:/m);
}

async function main() {
  const dto: OpinionGenerateDto = {
    sourceSummary:
      'Ngày 12/5 tại Hà Nội, một sự việc liên quan nhân vật A được đưa lên mạng và gây tranh luận.',
    confirmedFacts: ['Sự việc được đăng công khai ngày 12/5', 'Địa điểm được nêu là Hà Nội'],
    unverifiedClaims: ['Có ý kiến cho rằng bên A cố ý', 'Đồn rằng có bằng chứng chưa công bố'],
    selectedAngle: 'Đạo đức',
    angle: 'ethics',
    userViewpoint: 'Nên tách dữ kiện và cảm xúc trước khi kết luận.',
    pronoun: 'toi_cac_ban',
    intensity: 'frank',
    length: 'facebook',
    commonPhrases: ['nói thật lòng', 'thôi thì'],
  };

  const gen = templateGenerate(dto);
  assert.ok(gen.facebookPost.length > 80, 'facebook post too short');
  assert.ok(gen.videoScript.length > 40, 'video script too short');
  assert.ok(gen.videoHook.length > 5, 'missing hook');
  assert.match(gen.facebookPost, /tôi nghĩ/i);
  assert.match(gen.facebookPost, /nghĩ sao|Comment/i);
  assert.ok(gen.videoScript.includes('/'), 'video script must use / breath marks');
  assert.doesNotMatch(gen.videoScript, /chào mừng quay trở lại kênh/i);
  assert.doesNotMatch(gen.facebookPost, /hành trình|bức tranh lớn|đánh thức tiềm năng/i);
  assert.doesNotMatch(gen.facebookPost, /hôm qua tôi|tôi từng gặp|năm ngoái tôi/i);
  assertCleanSpoken(gen.facebookPost, 'facebook');
  assertCleanSpoken(gen.videoScript, 'video');
  assert.ok(gen.meta, 'meta must be separate field');
  assert.ok(
    gen.warnings.some((w) => /không dùng trải nghiệm|không bịa|chưa cung cấp/i.test(w)),
  );

  assert.equal(hasPersonalExperience(dto), false);
  assert.equal(
    hasPersonalExperience({ ...dto, userViewpoint: 'Tôi từng gặp chuyện tương tự năm ngoái.' }),
    true,
  );

  const breath = breathify('Xin chào. Đây là câu hai? Và ba!');
  assert.ok(breath.includes('/'));

  // Strip labels
  const dirty =
    'Tình huống tôi muốn bàn: abc\nGóc nhìn: xyz\nVấn đề đáng nói: 123\nBài học cuộc sống: học\nKết luận: hết';
  const cleaned = stripOutlineLabels(dirty);
  assertCleanSpoken(cleaned, 'stripped');

  // Rewrite modes
  for (const mode of [
    'more_casual',
    'more_natural',
    'more_spoken',
    'less_preachy',
    'more_frank',
    'more_deep',
    'shorten',
    'shorten_1min',
    'rewrite_all',
  ] as const) {
    const rewritten = applyRewriteTemplate(gen, mode, dto);
    assert.ok(rewritten.facebookPost.trim().length > 20, `rewrite ${mode} facebook empty`);
    assert.ok(rewritten.videoScript.trim().length > 20, `rewrite ${mode} script empty`);
    assert.equal(rewritten.rewriteMode, mode);
    assertCleanSpoken(rewritten.facebookPost, `rewrite ${mode} fb`);
    assertCleanSpoken(rewritten.videoScript, `rewrite ${mode} video`);
    assert.doesNotMatch(rewritten.videoScript, /chào mừng quay trở lại kênh/i);
  }

  const short = applyRewriteTemplate(gen, 'shorten', dto);
  assert.ok(short.facebookPost.length < gen.facebookPost.length + 80);

  const pair = await generateOpinionPair(dto, undefined);
  assert.equal(pair.source, 'template');
  assert.match(pair.facebookPost, /tôi nghĩ/i);
  assertCleanSpoken(pair.facebookPost, 'pair fb');
  assertCleanSpoken(pair.videoScript, 'pair video');

  const rw = await rewriteOpinionPair(
    {
      ...dto,
      rewriteMode: 'more_spoken',
      facebookPost: pair.facebookPost,
      videoScript: pair.videoScript,
      videoHook: pair.videoHook,
    },
    undefined,
  );
  assert.equal(rw.rewriteMode, 'more_spoken');
  assert.ok(rw.facebookPost.length > 40);
  assertCleanSpoken(rw.facebookPost, 'rw fb');

  // Flow markers (spoken, not labels)
  const markers = [
    /ồn|chia sẻ|thấy chuyện|Nói thật/i,
    /Chuyện ngắn|Ngày 12|tóm tắt/i,
    /đáng suy nghĩ|quan tâm/i,
    /tôi nghĩ/i,
    /phía|Người trong cuộc/i,
    /nghĩ sao|Comment/i,
  ];
  for (const re of markers) {
    assert.match(pair.facebookPost, re, `missing flow marker ${re}`);
  }

  // Clip life
  const clipDto: OpinionGenerateDto = {
    ...dto,
    themeId: 'clip_life_comment',
    subtopic: 'Góc nhìn phía sau một video viral',
    quickAngleLabel: 'Rút ra bài học cuộc sống',
    selectedAngle: 'Bài học cuộc sống từ clip',
    sourceSummary:
      'Một đoạn clip ngắn trên mạng kể tình huống hai người tranh luận công khai; phần lời thoại chưa được xác minh đầy đủ.',
  };
  const clip = templateGenerate(clipDto);
  assert.match(clip.facebookPost, /Mấy hôm nay tôi thấy một đoạn video/i);
  assert.match(clip.facebookPost, /Nói thật/i);
  assert.match(clip.facebookPost, /không phải ai thắng ai thua/i);
  assert.match(clip.facebookPost, /tôi nghĩ/i);
  assertCleanSpoken(clip.facebookPost, 'clip fb');
  assertCleanSpoken(clip.videoScript, 'clip video');
  // subtopic goes to meta, not as "Góc nhìn:" label in body
  assert.equal(clip.meta?.subtopic, 'Góc nhìn phía sau một video viral');
  assert.doesNotMatch(clip.facebookPost, /Góc nhìn:/);
  assert.ok(clip.videoScript.includes('/'));

  const clipEmpty = templateGenerate({
    themeId: 'clip_life_comment',
    pronoun: 'toi_cac_ban',
  });
  assert.ok(
    clipEmpty.warnings.some((w) => /caption|transcript|URL/i.test(w)),
    'clip without source should warn to paste caption/transcript',
  );
  assertCleanSpoken(clipEmpty.facebookPost, 'clipEmpty fb');

  // Life story continuous
  const life = templateGenerate({
    themeId: 'raise_children',
    subtopic: 'Khi con phạm lỗi — phạt hay dạy?',
    sourceSummary: 'Khi con phạm lỗi — phạt hay dạy?',
    userViewpoint: 'Nên dạy trước khi phạt, và nói rõ lý do.',
    pronoun: 'toi_cac_ban',
    intensity: 'gentle',
    length: '3min',
  });
  assertCleanSpoken(life.facebookPost, 'life fb');
  assertCleanSpoken(life.videoScript, 'life video');
  assert.match(life.facebookPost, /Nói thật|Chuyện đời thường/i);
  assert.doesNotMatch(life.facebookPost, /Tình huống tôi muốn bàn:/);

  console.log('test-opinion-generate: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
