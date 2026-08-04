/**
 * Smoke: personal title fallback never empty; count honored.
 * Run: pnpm exec tsx scripts/test-personal-titles.ts
 */
import assert from 'node:assert/strict';
import { suggestPersonalTitles } from '../apps/api/src/content-marketing/content-marketing-logic';
import { suggestPersonalTitlesLocal } from '../apps/web/src/lib/personal-ideas-suggest';
import { toSubtopicId } from '../apps/web/src/lib/brand-topic-themes';

async function main() {
  assert.ok(toSubtopicId('Lần thất bại lớn nhất').length > 0);

  for (const count of [5, 10, 20] as const) {
    const local = suggestPersonalTitlesLocal({
      subtopicLabel: 'Lần thất bại lớn nhất tôi từng trải qua',
      topicGroupLabel: 'Bài học từ thất bại',
      count,
      audience: 'Người đang tìm động lực',
    });
    assert.equal(local.titles.length, count);
    assert.equal(new Set(local.titles.map((t) => t.toLowerCase())).size, count);

    const api = await suggestPersonalTitles({
      topicGroupId: 'failure_lessons',
      topicGroupLabel: 'Bài học từ thất bại',
      subtopicId: toSubtopicId('Lần thất bại lớn nhất tôi từng trải qua'),
      subtopicLabel: 'Lần thất bại lớn nhất tôi từng trải qua',
      count,
      tone: 'mild_edgy',
      pronoun: 'ban_toi',
      audience: 'Người đang tìm động lực',
      goal: 'personal_branding',
    });
    assert.ok(api.titles.length > 0, 'API fallback must not be empty');
    assert.equal(api.titles.length, count);
    assert.equal(api.source, 'template');
  }

  console.log('test-personal-titles: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
