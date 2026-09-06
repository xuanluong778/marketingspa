/**
 * CONTENT_MARKETING intent routing for Trợ lý Bạch Cốt Tinh.
 * Run: pnpm test:assistant-content-intent
 */
import assert from 'node:assert/strict';
import {
  hasBusinessDataIntent,
  hasContentMarketingIntent,
  resolveContentMarketingIntent,
} from '../packages/shared/src/assistant-content-intent';

function main() {
  // non-content small talk
  assert.equal(hasContentMarketingIntent('Hôm nay có gì vui không?'), false);
  assert.equal(resolveContentMarketingIntent('Doanh thu hôm nay thế nào?'), null);
  assert.ok(hasBusinessDataIntent('Doanh thu hôm nay thế nào?'));

  // generic lost
  const generic = resolveContentMarketingIntent(
    'Tôi muốn viết content nhưng không biết viết thế nào',
  );
  assert.ok(generic);
  assert.equal(generic!.intent, 'CONTENT_MARKETING');
  assert.ok(generic!.variants.includes('generic'));
  assert.equal(generic!.pure, true);
  assert.ok(generic!.preferredReply?.includes('Content Marketing'));
  assert.equal(generic!.links.length, 1);
  assert.equal(generic!.links[0].label, 'Bắt đầu tạo Content');
  assert.equal(generic!.links[0].href, '/content?tab=create&section=ad');

  // brand
  const personal = resolveContentMarketingIntent('viết content xây dựng thương hiệu');
  assert.ok(personal);
  assert.ok(personal!.variants.includes('personal'));
  assert.equal(personal!.links[0].href, '/content?tab=create&section=personal');
  assert.equal(personal!.links[0].label, 'Xây dựng thương hiệu');

  // ads sell content (not metrics)
  const ad = resolveContentMarketingIntent('viết quảng cáo bán hàng');
  assert.ok(ad);
  assert.ok(ad!.variants.includes('ad'));
  assert.equal(ad!.links[0].href, '/content?tab=create&section=ad');
  assert.ok(!hasBusinessDataIntent('viết quảng cáo bán hàng'));

  // advanced
  const adv = resolveContentMarketingIntent('viết bài nâng cao cho blog');
  assert.ok(adv);
  assert.ok(adv!.variants.includes('advanced'));
  assert.equal(adv!.links[0].href, '/content?tab=create&section=advanced');

  // video
  const video = resolveContentMarketingIntent('viết kịch bản quay video teleprompter');
  assert.ok(video);
  assert.ok(video!.variants.includes('video'));
  assert.equal(video!.links[0].href, '/teleprompter');

  // ads metrics should NOT be content pure replace
  assert.ok(hasBusinessDataIntent('Quảng cáo 7 ngày qua hiệu quả thế nào?'));
  assert.equal(
    hasContentMarketingIntent('Quảng cáo 7 ngày qua hiệu quả thế nào?'),
    false,
  );

  // hub
  const hub = resolveContentMarketingIntent('giúp tôi làm content marketing');
  assert.ok(hub);
  assert.ok(hub!.links.some((l) => l.href.includes('section=ad')));
  assert.ok(hub!.links.some((l) => l.href.includes('section=personal')));
  assert.ok(hub!.links.some((l) => l.href === '/teleprompter'));

  // mixed: content + data stays not pure
  const mixed = resolveContentMarketingIntent(
    'viết content bán hàng và cho tôi doanh thu hôm nay',
  );
  assert.ok(mixed);
  assert.equal(mixed!.pure, false);

  console.log('ALL_PASS assistant-content-intent');
}

main();
