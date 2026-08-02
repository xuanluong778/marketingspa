/**
 * Opinion complete — scandal safety, hide names, naturalness, generate flow.
 * Run: pnpm test:opinion-complete
 */
import assert from 'node:assert/strict';
import { generateOpinionPair, rewriteOpinionPair } from '../apps/api/src/content-marketing/opinion-generate.logic';
import { scanOpinionSafety, anonymizeNames, extractLikelyNames } from '../apps/api/src/content-marketing/opinion-safety.logic';
import { __test as scoreTest } from '../apps/api/src/content-marketing/opinion-score-naturalness.logic';
import {
  savePendingTeleprompter,
  loadPendingTeleprompter,
  clearPendingTeleprompter,
} from '../apps/web/src/lib/teleprompter-bridge';

async function main() {
  // --- Scandal, single source, strong opinion, hide names ---
  const dto = {
    sourceSummary:
      'Ngày 12/5 tại Hà Nội, sự việc liên quan anh Nguyễn Văn A được đưa lên mạng và gây tranh luận mạnh.',
    confirmedFacts: ['Bài đăng công khai ngày 12/5', 'Địa điểm được nêu là Hà Nội'],
    unverifiedClaims: ['Có ý kiến cho rằng anh Nguyễn Văn A cố ý lừa đảo', 'Đồn rằng có bằng chứng chưa công bố'],
    selectedAngle: 'Đạo đức',
    angle: 'ethics' as const,
    userViewpoint:
      'Tôi phản đối cách dư luận kết tội sớm. Không thể biến cáo buộc thành sự thật khi mới có một nguồn.',
    pronoun: 'toi_cac_ban' as const,
    intensity: 'strong' as const,
    length: 'facebook' as const,
    commonPhrases: ['nói thật lòng', 'thôi thì'],
    hideNames: true,
    preferredWords: ['nói thật lòng'],
    avoidWords: ['hành trình', 'đánh thức tiềm năng'],
    openingPhrases: ['Mình nói thật lòng nhé'],
    closingPhrases: ['Bạn nghĩ sao? Comment giúp mình'],
    sampleParagraph: 'Mình hay nói ngắn. Không vòng vo. Thấy sao nói vậy, nhưng không công kích ai.',
  };

  const names = extractLikelyNames(dto.sourceSummary + ' ' + dto.unverifiedClaims.join(' '));
  assert.ok(names.length >= 1, 'should detect names');
  const anon = anonymizeNames('Anh Nguyễn Văn A bị tố', names);
  assert.ok(!/Nguyễn Văn A/i.test(anon) || /nhân vật/i.test(anon));

  const gen = await generateOpinionPair(dto, undefined);
  assert.ok(gen.facebookPost.length > 80);
  assert.ok(gen.videoScript.includes('/'));
  assert.match(gen.facebookPost, /theo thông tin đang được chia sẻ|chưa đủ dữ kiện/i);
  assert.doesNotMatch(gen.facebookPost, /Nguyễn Văn A/i);
  assert.ok(
    gen.warnings.some((w) => /ẩn tên|kiểm chứng|cáo buộc|dữ kiện|chưa/i.test(w)),
    `warnings: ${gen.warnings.join(' | ')}`,
  );
  assert.ok(gen.safetyRisk === 'low' || gen.safetyRisk === 'medium' || gen.safetyRisk === 'high');

  // Attack language should raise safety
  const attack = scanOpinionSafety({
    facebookPost: 'Thằng khốn này phải chết. Chắc chắn là tội phạm.',
    unverifiedClaims: ['bị tố lừa đảo'],
  });
  assert.ok(attack.warnings.length >= 1);
  assert.ok(attack.riskLevel !== 'low');

  // Naturalness
  const nat = scoreTest.scoreOpinionNaturalnessHeuristic(gen.facebookPost);
  assert.ok(nat.total >= 0 && nat.total <= 100);
  assert.ok(nat.criteria.spokenFeel >= 0);
  assert.ok(Array.isArray(nat.suggestions));

  const natScript = scoreTest.scoreOpinionNaturalnessHeuristic(gen.videoScript, {
    isVideoScript: true,
  });
  assert.ok(natScript.criteria.cameraReadiness >= 40);

  // Rewrite + compare seed
  const rw = await rewriteOpinionPair(
    {
      ...dto,
      rewriteMode: 'more_frank',
      facebookPost: gen.facebookPost,
      videoScript: gen.videoScript,
      videoHook: gen.videoHook,
    },
    undefined,
  );
  assert.ok(rw.facebookPost.length > 40);
  assert.doesNotMatch(rw.facebookPost, /Nguyễn Văn A/i);

  // Teleprompter bridge
  const store: Record<string, string> = {};
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      getItem: (k: string) => store[k] ?? null,
      removeItem: (k: string) => {
        delete store[k];
      },
    },
  };
  savePendingTeleprompter({
    title: 'Scandal test',
    videoScript: gen.videoScript,
    videoHook: gen.videoHook,
    facebookPost: gen.facebookPost,
  });
  const pending = loadPendingTeleprompter();
  assert.ok(pending?.videoScript.includes('/'));
  clearPendingTeleprompter();
  assert.equal(loadPendingTeleprompter(), null);

  // Check Content Ads payload shape (client-side contract)
  const adsPayload = {
    title: 'Scandal test',
    content: gen.facebookPost,
    mode: 'facebook_post' as const,
  };
  assert.ok(adsPayload.content.length > 20);
  assert.equal(adsPayload.mode, 'facebook_post');

  console.log('test-opinion-complete: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
