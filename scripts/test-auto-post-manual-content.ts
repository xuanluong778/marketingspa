/**
 * Unit tests: manual Auto Post + schedule helpers.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auto-post-manual-content.ts
 */
import {
  buildManualOrLibraryDraftPayload,
  canAutoPostPublish,
  datetimeLocalToIso,
  isScheduleDatetimeInFuture,
  suggestScheduleDatetimeLocal,
  topicFromManualCaption,
} from '../apps/web/src/lib/auto-post-manual-content';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// topic
assert(topicFromManualCaption('') === 'Bài đăng thủ công', 'empty topic');
assert(topicFromManualCaption('  \n  ') === 'Bài đăng thủ công', 'whitespace topic');
assert(topicFromManualCaption('Xin chào\ndòng 2') === 'Xin chào', 'first line topic');
assert(topicFromManualCaption('a'.repeat(100)).endsWith('...'), 'long topic truncated');

// can publish: content + fanpage only (no library)
assert(
  canAutoPostPublish({
    caption: 'Hello VN 👋',
    fanpageId: 'page-1',
    facebookConnected: true,
  }) === true,
  'manual publish ok',
);
assert(
  canAutoPostPublish({
    caption: 'Hello',
    fanpageId: '',
    facebookConnected: true,
  }) === false,
  'need fanpage',
);

// draft payload without library
const manual = buildManualOrLibraryDraftPayload({
  caption: 'Nội dung thử\n dòng 2',
  fanpageId: 'fp1',
  tabFilter: 'ad',
});
assert(manual.postType === 'SPA_SALES', 'manual postType from tabFilter');
assert(manual.topic === 'Nội dung thử', 'manual topic from first line');

// library draft
const lib = buildManualOrLibraryDraftPayload({
  caption: 'Edited caption',
  fanpageId: 'fp1',
  tabFilter: 'ad',
  libraryTitle: 'Tiêu đề thư viện',
  libraryTab: 'personal',
});
assert(lib.postType === 'BRAND_BUILDING', 'library tab wins');
assert(lib.topic === 'Tiêu đề thư viện', 'library title');

// schedule time helpers
const suggested = suggestScheduleDatetimeLocal(60);
assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(suggested), 'datetime-local format');
const iso = datetimeLocalToIso(suggested);
assert(Boolean(iso && !Number.isNaN(Date.parse(iso!))), 'iso from local');
assert(isScheduleDatetimeInFuture(suggested) === true, 'suggested is future');
assert(isScheduleDatetimeInFuture('') === false, 'empty not future');
assert(datetimeLocalToIso('') === null, 'empty local null');
assert(datetimeLocalToIso('not-a-date') === null, 'bad local null');

// schedule body shape for API
const scheduleBody = {
  postId: 'draft-id-1',
  scheduledAt: iso!,
};
assert(Boolean(scheduleBody.postId && scheduleBody.scheduledAt), 'schedule body shape');
assert(new Date(scheduleBody.scheduledAt).getTime() > Date.now(), 'schedule future');

console.log('ALL_PASS auto-post-manual-content');
