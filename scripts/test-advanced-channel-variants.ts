/**
 * Test Viết bài nâng cao — 4 channels distinct + quality gates.
 * Usage: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-advanced-channel-variants.ts
 */
import { templateGenerateAdvanced } from '../apps/api/src/content-marketing/advanced-article-logic';
import {
  evaluateAdsChannel,
  evaluateFacebookChannel,
  evaluateWebsiteChannel,
  textSimilarity,
} from '../apps/api/src/content-marketing/advanced-article-quality';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const brief = {
  writingStyle: 'pain_direct' as const,
  demographic: 'female_25_35' as const,
  articleGoal: 'booking' as const,
  productService: 'Liệu trình trị nám chuyên sâu 8 buổi',
  price: '2.990.000đ',
  combo: 'Mua 8 tặng 2 buổi chăm sóc da',
  gift: 'Serum dưỡng ẩm mini',
  offerDeadline: '30/09/2026',
  salesArea: 'Quận 1, TP.HCM',
  certification: 'Kỹ thuật viên được đào tạo theo quy trình chuẩn cơ sở',
  caseStudy:
    'Chị H. (32 tuổi) chia sẻ da đều màu hơn sau liệu trình — kết quả tùy cơ địa',
  painPoints:
    'Da nám xỉn, makeup không che được, tự ti khi giao tiếp và họp online',
  desires: 'Da sáng đều hơn, makeup ăn nền, tự tin không cần filter',
  differentiator: 'Quy trình cá nhân hóa theo tình trạng da, không ép upsell',
  postLength: 'medium' as const,
  ctaType: 'booking' as const,
  industryName: 'Spa/Làm đẹp',
};

async function main() {
  const r = templateGenerateAdvanced(brief);

  assert(r.final_article && r.variants.facebook && r.variants.website && r.variants.ads, '4 channels');
  assert(r.variants.facebook !== r.final_article, 'facebook != final_article');
  assert(r.variants.website !== r.final_article, 'website != final_article');
  assert(r.variants.website !== r.variants.facebook, 'website != facebook');
  assert((r.variants.ads.match(/Primary text/gi) || []).length >= 3, 'ads ≥3 primaryText');
  assert(/^#\s/m.test(r.variants.website), 'website H1');
  assert(/FAQ|Câu hỏi thường gặp/i.test(r.variants.website), 'website FAQ');
  assert(/quy trình/i.test(r.variants.website), 'website quy trình');
  assert(!/^#\s/m.test(r.variants.facebook), 'facebook no markdown H1');

  const simFbMain = textSimilarity(r.variants.facebook, r.final_article);
  const simWebMain = textSimilarity(r.variants.website, r.final_article);
  const simWebFb = textSimilarity(r.variants.website, r.variants.facebook);
  assert(simFbMain < 0.85, `fb~main ${simFbMain}`);
  assert(simWebMain < 0.8, `web~main ${simWebMain}`);
  assert(simWebFb < 0.75, `web~fb ${simWebFb}`);

  const qFb = evaluateFacebookChannel(r.variants.facebook, r.final_article);
  const qWeb = evaluateWebsiteChannel(r.variants.website, r.final_article, r.variants.facebook);
  const qAds = evaluateAdsChannel(r.variants.ads);
  assert(qFb.ok, `FB gate: ${qFb.reasons.join('; ')}`);
  assert(qWeb.ok, `WEB gate: ${qWeb.reasons.join('; ')}`);
  assert(qAds.ok, `ADS gate: ${qAds.reasons.join('; ')}`);
  assert(!evaluateFacebookChannel(r.final_article, r.final_article).ok, 'clone must fail');
  assert(!evaluateAdsChannel('Mua ngay').ok, 'sparse ads fail');

  console.log('PASS advanced-channel-variants');
  console.log(
    JSON.stringify(
      {
        words: {
          main: r.final_article.split(/\s+/).length,
          facebook: r.variants.facebook.split(/\s+/).length,
          website: r.variants.website.split(/\s+/).length,
          ads: r.variants.ads.split(/\s+/).length,
        },
        similarity: {
          fb_main: Number(simFbMain.toFixed(3)),
          web_main: Number(simWebMain.toFixed(3)),
          web_fb: Number(simWebFb.toFixed(3)),
        },
        sample4: {
          main: r.final_article.slice(0, 140),
          facebook: r.variants.facebook.slice(0, 140),
          website: r.variants.website.split('\n').slice(0, 4).join(' | '),
          ads: r.variants.ads.split('\n').slice(0, 6).join(' | '),
        },
      },
      null,
      2,
    ),
  );

  if (process.env.ADVANCED_AI_LIVE === '1') {
    const { OpenAiService } = await import('../apps/api/src/openai/openai.service');
    const { generateAdvancedArticle } = await import(
      '../apps/api/src/content-marketing/advanced-article-logic'
    );
    const config = {
      get: (k: string) => process.env[k],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openai = new OpenAiService(config as any);
    if (!openai.isConfigured()) {
      console.log('SKIP AI live — OPENAI_API_KEY not configured');
      return;
    }
    console.log('Running AI live generate (may take ~1–2 min)...');
    const live = await generateAdvancedArticle(brief, openai);
    assert(live.variants.facebook !== live.final_article, 'AI facebook != main');
    assert((live.variants.ads.match(/Primary text/gi) || []).length >= 3, 'AI ads pack');
    const liveFb = evaluateFacebookChannel(live.variants.facebook, live.final_article);
    const liveWeb = evaluateWebsiteChannel(
      live.variants.website,
      live.final_article,
      live.variants.facebook,
    );
    const liveAds = evaluateAdsChannel(live.variants.ads);
    console.log(
      JSON.stringify(
        {
          aiLive: {
            source: live.source,
            gates: { facebook: liveFb.ok, website: liveWeb.ok, ads: liveAds.ok },
            reasons: {
              facebook: liveFb.reasons,
              website: liveWeb.reasons,
              ads: liveAds.reasons,
            },
            similarity: {
              fb_main: Number(
                textSimilarity(live.variants.facebook, live.final_article).toFixed(3),
              ),
              web_fb: Number(
                textSimilarity(live.variants.website, live.variants.facebook).toFixed(3),
              ),
            },
            sample4: {
              main: live.final_article.slice(0, 120),
              facebook: live.variants.facebook.slice(0, 120),
              website: live.variants.website.split('\n').slice(0, 3).join(' | '),
              ads: live.variants.ads.split('\n').slice(0, 5).join(' | '),
            },
          },
        },
        null,
        2,
      ),
    );
    // Soft assert: after quality regenerate, prefer pass; allow soft fail log if still weak
    if (!liveFb.ok) console.warn('WARN AI FB gate:', liveFb.reasons.join('; '));
    if (!liveWeb.ok) console.warn('WARN AI WEB gate:', liveWeb.reasons.join('; '));
    if (!liveAds.ok) console.warn('WARN AI ADS gate:', liveAds.reasons.join('; '));
    assert(live.source === 'ai' || live.source === 'template', 'source set');
  }
}

main().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
