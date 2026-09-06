/**
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-work-task-detail.ts
 */
import assert from 'node:assert/strict';
import {
  appendAttachmentToDescription,
  attachmentDescriptionLine,
  buildLabelCatalog,
  checklistProgress,
  commentBodyForAttachment,
  encodeWorkLabel,
  fileExtensionBadge,
  filterByQuery,
  formatLabelsCsv,
  isDescriptionDirty,
  mergeActivityFeed,
  parseLabelsCsv,
  parseWorkLabel,
  removeAttachmentFromDescription,
  renameLabelToken,
  toggleChecklistItem,
  toggleToken,
} from '../apps/web/src/lib/work-task-detail';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

function main() {
  section('labels parse/format');
  assert.deepEqual(parseLabelsCsv('A, B; C\nD'), ['A', 'B', 'C', 'D']);
  assert.equal(formatLabelsCsv(['A', 'B']), 'A, B');
  console.log('PASS labels');

  section('work label encode/parse/toggle');
  assert.equal(encodeWorkLabel('green'), 'green');
  assert.equal(encodeWorkLabel('green', 'Campaign'), 'green:Campaign');
  assert.equal(parseWorkLabel('green').colorId, 'green');
  assert.equal(parseWorkLabel('blue:Q3').title, 'Q3');
  assert.deepEqual(toggleToken(['green'], 'green'), []);
  assert.deepEqual(toggleToken([], 'red'), ['red']);
  assert.deepEqual(renameLabelToken(['green'], 'green', 'green', 'Mkt'), ['green:Mkt']);
  assert.equal(buildLabelCatalog(['green:Mkt']).some((l) => l.token === 'green:Mkt'), true);
  assert.deepEqual(
    filterByQuery(
      [
        { id: '1', name: 'An' },
        { id: '2', name: 'Bình' },
      ],
      'bì',
      (e) => e.name,
    ).map((e) => e.id),
    ['2'],
  );
  console.log('PASS work labels');

  section('attachment description helpers');
  const line = attachmentDescriptionLine('a.xlsx', 'fid1');
  assert.equal(line, '[a.xlsx](attachment:fid1)');
  const withFile = appendAttachmentToDescription('hello', 'a.xlsx', 'fid1');
  assert.equal(withFile, `hello\n${line}`);
  assert.equal(appendAttachmentToDescription(withFile, 'a.xlsx', 'fid1'), withFile);
  assert.equal(removeAttachmentFromDescription(withFile, 'fid1'), 'hello');
  assert.equal(commentBodyForAttachment('a.xlsx', 'fid1'), `📎 Tài liệu: ${line}`);
  assert.equal(fileExtensionBadge('report.XLSX'), 'XLSX');
  console.log('PASS attachments');

  section('description dirty');
  assert.equal(isDescriptionDirty('hello', 'hello'), false);
  assert.equal(isDescriptionDirty('hello', 'hello '), false);
  assert.equal(isDescriptionDirty('hello', 'world'), true);
  console.log('PASS dirty');

  section('checklist toggle + progress');
  let items = [
    { title: 'a', isDone: false, sortOrder: 0 },
    { title: 'b', isDone: true, sortOrder: 1 },
  ];
  items = toggleChecklistItem(items, 0);
  assert.equal(items[0]!.isDone, true);
  assert.equal(checklistProgress(items), 100);
  console.log('PASS checklist');

  section('activity merge order');
  const feed = mergeActivityFeed({
    history: [
      {
        id: '1',
        createdAt: '2026-01-01T10:00:00.000Z',
        toColumnKey: 'TODO',
        action: 'create',
        actor: { name: 'A' },
      },
    ],
    reviews: [
      {
        id: '2',
        createdAt: '2026-01-02T10:00:00.000Z',
        type: 'APPROVED',
        revisionNumber: 1,
        reviewedBy: { name: 'B' },
      },
    ],
  });
  assert.equal(feed[0]!.kind, 'review');
  assert.equal(feed.length, 2);
  console.log('PASS activity');

  console.log('\nALL_PASS work-task-detail');
}

main();
