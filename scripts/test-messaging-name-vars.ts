/**
 * Unit check: full_name / first_name per identity, no shared campaign name leak.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/shared exec tsx ../../scripts/test-messaging-name-vars.ts
 */
import assert from 'node:assert/strict';
import {
  MESSAGING_NAME_FALLBACK,
  pickCampaignRenderVariables,
  resolveMessagingDisplayNames,
  renderTemplateWithFallbacks,
  MESSAGING_NAME_FALLBACKS,
} from '@marketingspa/shared';

function renderFor(displayName: string | null, body: string) {
  const names = resolveMessagingDisplayNames(displayName);
  const context = {
    ...pickCampaignRenderVariables({
      body,
      full_name: 'SHOULD_NOT_APPEAR',
      first_name: 'LEAK',
      mediaUrl: 'https://x',
    }),
    ...names,
  };
  return renderTemplateWithFallbacks(body, context, MESSAGING_NAME_FALLBACKS).rendered;
}

const body = 'Chào anh {{full_name}}, ưu đãi dành cho {{first_name}}';

const a = renderFor('Lưu Xuân Lượng', body);
const b = renderFor('Mậu Diên Nhân', body);
const c = renderFor(null, body);
const d = renderFor('Khách Messenger', body);

assert.equal(a, 'Chào anh Lưu Xuân Lượng, ưu đãi dành cho Lưu');
assert.equal(b, 'Chào anh Mậu Diên Nhân, ưu đãi dành cho Mậu');
assert.equal(c, `Chào anh ${MESSAGING_NAME_FALLBACK}, ưu đãi dành cho ${MESSAGING_NAME_FALLBACK}`);
assert.equal(d, `Chào anh ${MESSAGING_NAME_FALLBACK}, ưu đãi dành cho ${MESSAGING_NAME_FALLBACK}`);
assert.ok(!a.includes('SHOULD_NOT_APPEAR') && !a.includes('{{'));
assert.notEqual(a, b);

console.log('PASS messaging-name-vars');
console.log({ a, b, c, d });
