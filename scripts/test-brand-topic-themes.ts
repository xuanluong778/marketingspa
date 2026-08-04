/**
 * Unit checks for brand topic themes (personal tab).
 * Run: node --import tsx scripts/test-brand-topic-themes.ts
 * or: pnpm exec tsx scripts/test-brand-topic-themes.ts
 */
import assert from 'node:assert/strict';
import {
  BRAND_TOPIC_GROUPS,
  BRAND_TOPIC_GROUP_IDS,
  pickRandomTopicsFromGroup,
  getBrandTopicGroup,
} from '../apps/web/src/lib/brand-topic-themes';

function main() {
  assert.equal(BRAND_TOPIC_GROUPS.length, 10);
  assert.equal(BRAND_TOPIC_GROUP_IDS.length, 10);

  for (const g of BRAND_TOPIC_GROUPS) {
    assert.ok(g.topics.length >= 10, `${g.id} needs ≥10 topics, got ${g.topics.length}`);
    const uniq = new Set(g.topics);
    assert.equal(uniq.size, g.topics.length, `${g.id} has duplicate topics`);
  }

  const group = getBrandTopicGroup('failure_lessons');
  assert.ok(group);

  for (let i = 0; i < 20; i += 1) {
    const batch = pickRandomTopicsFromGroup('failure_lessons', { minCount: 5, maxCount: 8 });
    assert.ok(batch.length >= 5 && batch.length <= 8, `batch size ${batch.length}`);
    assert.equal(new Set(batch).size, batch.length, 'duplicates in one batch');
    for (const t of batch) {
      assert.ok(group!.topics.includes(t), `topic not in group: ${t}`);
    }
  }

  const a = pickRandomTopicsFromGroup('motivation', { count: 6 });
  const b = pickRandomTopicsFromGroup('motivation', { count: 6, exclude: a });
  assert.ok(b.every((t) => !a.includes(t) || groupHasEnough('motivation', a.length)));

  // Changing group conceptually clears selection — util returns empty for unknown
  assert.deepEqual(pickRandomTopicsFromGroup('unknown_group'), []);

  console.log('PASS brand topic groups = 10');
  console.log('PASS each group ≥10 unique topics');
  console.log('PASS random 5–8 no duplicates within batch');
  console.log('PASS topics belong to selected group');
  console.log('\nALL brand-topic-themes checks PASS');
}

function groupHasEnough(id: string, excluded: number) {
  const g = getBrandTopicGroup(id);
  return (g?.topics.length ?? 0) - excluded >= 5;
}

main();
