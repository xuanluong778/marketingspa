/**
 * Test đa dạng mở đầu brand post — chạy: pnpm exec ts-node scripts/test-brand-post-diversity.ts
 * (hoặc: node --import tsx scripts/test-brand-post-diversity.ts)
 */
import { collectTemplateOpeners } from '../src/content-marketing/brand-post-template';

const result = collectTemplateOpeners(10);

console.log('=== Brand Post Diversity Test (10 bài template) ===\n');
console.log(`Unique openers: ${result.uniqueOpeners}/10 (cần >= 8)`);
console.log(`Forbidden "Mày à" openers: ${result.forbiddenCount} (cần = 0)\n`);

result.openers.forEach((o, i) => {
  console.log(`${i + 1}. [${result.genres[i]}] ${o.slice(0, 100)}${o.length > 100 ? '…' : ''}`);
});

const passUnique = result.uniqueOpeners >= 8;
const passForbidden = result.forbiddenCount === 0;
const pass = passUnique && passForbidden;

console.log(`\n${pass ? 'PASS' : 'FAIL'}: unique=${passUnique}, no-forbidden=${passForbidden}`);
process.exit(pass ? 0 : 1);
