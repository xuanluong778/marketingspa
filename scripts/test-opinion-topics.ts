/**
 * Opinion topic themes — random subtopics, titles, life/clip generate.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-opinion-topics.ts
 */
import assert from 'node:assert/strict';
import {
  OPINION_TOPIC_GROUPS,
  OPINION_TOPIC_GROUP_IDS,
  isClipLifeTheme,
  isLifeStoryTheme,
  pickRandomOpinionSubtopics,
  suggestOpinionTitlesLocal,
} from '../apps/web/src/lib/opinion-topic-themes';
import { __test, generateOpinionPair, rewriteOpinionPair } from '../apps/api/src/content-marketing/opinion-generate.logic';
import type { OpinionGenerateDto } from '../apps/api/src/content-marketing/dto/content-marketing.dto';

const { templateGenerate } = __test;

async function main() {
  // Config integrity
  assert.ok(OPINION_TOPIC_GROUPS.length >= 16, 'need clip + 15 life groups');
  assert.equal(OPINION_TOPIC_GROUP_IDS.length, OPINION_TOPIC_GROUPS.length);
  assert.ok(OPINION_TOPIC_GROUPS.some((g) => g.id === 'clip_life_comment'));
  for (const g of OPINION_TOPIC_GROUPS) {
    assert.ok(g.subtopics.length >= 10, `${g.id} needs ≥10 subtopics`);
    const uniq = new Set(g.subtopics);
    assert.equal(uniq.size, g.subtopics.length, `${g.id} has duplicate subtopics`);
  }

  // Random 5–8 unique
  const batch1 = pickRandomOpinionSubtopics('raise_children', { minCount: 5, maxCount: 8 });
  assert.ok(batch1.length >= 5 && batch1.length <= 8);
  assert.equal(new Set(batch1).size, batch1.length);
  const batch2 = pickRandomOpinionSubtopics('raise_children', {
    minCount: 5,
    maxCount: 8,
    exclude: batch1,
  });
  assert.ok(batch2.length >= 5);
  assert.equal(new Set(batch2).size, batch2.length);

  // Titles 5–10
  const titles = suggestOpinionTitlesLocal({
    subtopicLabel: 'Không so sánh con với con nhà người ta',
    topicGroupLabel: 'Dạy con và đồng hành cùng con',
    count: 8,
  });
  assert.equal(titles.length, 8);
  assert.ok(titles.every((t) => t.includes('so sánh') || t.includes('Dạy con') || t.length > 10));

  assert.equal(isClipLifeTheme('clip_life_comment'), true);
  assert.equal(isLifeStoryTheme('fate_choice'), true);
  assert.equal(isLifeStoryTheme('clip_life_comment'), false);

  // Life story generate
  const lifeDto: OpinionGenerateDto = {
    themeId: 'overcome_adversity',
    subtopic: 'Mất tất cả và bắt đầu lại từ số không',
    quickAngleLabel: 'Rút ra bài học cuộc sống',
    selectedAngle: 'Bài học cuộc sống chân thật',
    sourceSummary: 'Một người mất việc và phải bắt đầu lại từ đầu.',
    userViewpoint: 'Không bỏ cuộc, nhưng cũng không cần giả mạnh mẽ mọi lúc.',
    pronoun: 'toi_cac_ban',
    intensity: 'deep',
    length: 'facebook',
  };
  const life = templateGenerate(lifeDto);
  assert.match(life.facebookPost, /Nói thật|Chuyện đời thường/i);
  assert.match(life.facebookPost, /tôi nghĩ/i);
  assert.match(life.facebookPost, /nghĩ sao|Comment/i);
  assert.doesNotMatch(life.facebookPost, /Tình huống tôi muốn bàn:|Góc nhìn:|Vấn đề đáng nói:|Bài học cuộc sống:|Kết luận:/i);
  assert.doesNotMatch(life.facebookPost, /hành trình|bức tranh lớn|đánh thức tiềm năng/i);
  assert.ok(life.videoScript.includes('/'));
  assert.ok(life.meta?.themeId === 'overcome_adversity');

  // Intensities + lengths
  for (const intensity of ['gentle', 'deep', 'frank', 'emotional', 'motivational'] as const) {
    for (const length of ['1min', '3min', '5min', 'facebook'] as const) {
      const g = templateGenerate({ ...lifeDto, intensity, length });
      assert.ok(g.facebookPost.length > 40, `${intensity}/${length} too short`);
    }
  }

  // Rewrite
  const pair = await generateOpinionPair(lifeDto, undefined);
  const rw = await rewriteOpinionPair(
    {
      ...lifeDto,
      rewriteMode: 'more_natural',
      facebookPost: pair.facebookPost,
      videoScript: pair.videoScript,
      videoHook: pair.videoHook,
    },
    undefined,
  );
  assert.ok(rw.facebookPost.length > 40);
  assert.equal(rw.rewriteMode, 'more_natural');

  // Draft-shaped fields (normalize-compatible)
  const draftShape = {
    opinionThemeId: 'parents_filial',
    opinionSuggestedSubtopics: batch1,
    opinionSubtopic: batch1[0] || '',
    opinionGeneratedTitles: titles,
    opinionSelectedTitle: titles[0] || '',
    opinionTitleCount: 10 as const,
    opinionIntensity: 'emotional' as const,
    opinionLength: '3min' as const,
    opinionIsGeneratingTitles: false,
    opinionUseCustomStory: false,
  };
  assert.equal(draftShape.opinionSuggestedSubtopics.length, batch1.length);
  assert.ok(draftShape.opinionGeneratedTitles.length >= 5);

  // Teleprompter-ready: breath marks present
  assert.ok(life.videoScript.split('/').length >= 3);

  console.log('test-opinion-topics: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
