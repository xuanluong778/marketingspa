import {
  buildFullIndustryPromptContext,
  containsSpaLeakage,
  resolveIndustryContext,
  regulatedComplianceBlock,
} from './industry-context.util';
import { buildIndustrySuggestions } from './industry-suggestions.logic';
import { templateGenerateAdvanced } from './advanced-article-logic';
import type { GenerateAdvancedArticleDto } from './dto/content-marketing.dto';
import { checkAdPolicyRisk } from './content-marketing-logic';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const tech = resolveIndustryContext({ industryName: 'Công nghệ' });
  assert(tech.label === 'Công nghệ', 'tech label');
  assert(!tech.isSpaBeauty, 'tech not spa');
  assert(!tech.isRegulated, 'tech not regulated');

  const health = resolveIndustryContext({ industryName: 'Sức khỏe' });
  assert(health.isRegulated && health.regulatedKind === 'health', 'health regulated');

  const custom = resolveIndustryContext({ customIndustry: 'Pet Grooming cao cấp' });
  assert(custom.isCustom && !custom.isSpaBeauty, 'custom not spa');

  const { block } = buildFullIndustryPromptContext({
    industry: { industryName: 'Bất động sản' },
    productService: 'Căn hộ 2PN',
    targetAudience: 'Gia đình trẻ',
    goal: 'lead',
    tone: 'tin cậy',
    pronoun: 'anh/em',
    platform: 'facebook',
    length: 'medium',
    cta: 'Đặt lịch xem nhà',
    keywords: 'căn hộ quận 7',
    brandInfo: 'ABC Realty',
  });
  assert(block.includes('Bất động sản'), 'block has industry');
  assert(/CẤM chèn spa/i.test(block), 'block forbids spa');

  const spaSug = await buildIndustrySuggestions({ industryName: 'Spa/Làm đẹp' });
  assert(spaSug.source === 'catalog', 'spa catalog');
  assert(spaSug.hashtags.some((h) => /spa/i.test(h)), 'spa hashtags');

  const techSug = await buildIndustrySuggestions({ industryName: 'Công nghệ' });
  assert(techSug.source === 'catalog', 'tech catalog');
  assert(!techSug.hashtags.some((h) => /#spa/i.test(h)), 'tech no spa hashtag');

  const eduSug = await buildIndustrySuggestions({ industryName: 'Giáo dục' });
  assert(eduSug.topics.length >= 3, 'edu topics');

  const foodSug = await buildIndustrySuggestions({ industryName: 'Ẩm thực' });
  assert(foodSug.ctas.some((c) => /đặt bàn|order|ship|check-in/i.test(c)), 'food cta');

  const customSug = await buildIndustrySuggestions({ customIndustry: 'Xe máy điện' });
  assert(customSug.isCustom, 'custom flag');
  assert(customSug.industry === 'Xe máy điện', 'custom name');
  assert(!/#spa/i.test(customSug.hashtags.join(' ')), 'custom no spa tag');

  const baseDto = {
    writingStyle: 'expert_consultant',
    demographic: 'female_25_35',
    articleGoal: 'direct_sales',
    productService: 'Phần mềm CRM',
    painPoints: 'Quản lý khách hàng phân tán, đội sale quên follow-up',
    postLength: 'medium',
    ctaType: 'inbox',
    industryName: 'Công nghệ',
  } as GenerateAdvancedArticleDto;

  const article = templateGenerateAdvanced(baseDto);
  assert(!containsSpaLeakage(article.final_article, tech), 'article no spa leak');
  assert(!/#spa/i.test(article.hashtags.join(' ')), 'article hashtags clean');

  const reDto = {
    ...baseDto,
    productService: 'Căn hộ view sông',
    painPoints: 'Lo pháp lý, sợ mua nhầm dự án',
    industryName: 'Bất động sản',
  } as GenerateAdvancedArticleDto;
  const re = templateGenerateAdvanced(reDto);
  assert(!/\bspa\b/i.test(re.final_article), 'bds no spa');

  const foodDto = {
    ...baseDto,
    productService: 'Set lẩu hải sản',
    painPoints: 'Cuối tuần không biết ăn gì với nhóm bạn',
    industryName: 'Ẩm thực',
  } as GenerateAdvancedArticleDto;
  const food = templateGenerateAdvanced(foodDto);
  assert(!/\bspa\b|#lamdep/i.test(food.final_article + food.hashtags.join(' ')), 'food clean');

  const eduDto = {
    ...baseDto,
    productService: 'Khóa IELTS online',
    painPoints: 'Học mãi không lên band',
    industryName: 'Giáo dục',
  } as GenerateAdvancedArticleDto;
  const edu = templateGenerateAdvanced(eduDto);
  assert(!/\bspa\b/i.test(edu.final_article), 'edu clean');

  const freeDto = {
    ...baseDto,
    productService: 'Gói bảo dưỡng định kỳ',
    painPoints: 'Xe hay hỏng đột xuất, tốn chi phí',
    customIndustry: 'Garage xe máy',
    industryName: '',
  } as GenerateAdvancedArticleDto;
  const free = templateGenerateAdvanced(freeDto);
  assert(!/\bspa\b/i.test(free.final_article), 'custom garage clean');

  const policy = checkAdPolicyRisk({
    content: 'Cam kết chữa khỏi 100% và kết quả chắc chắn giảm 10kg trong 7 ngày',
    industryName: 'Giảm cân',
  });
  assert(policy.isRegulatedIndustry, 'policy regulated');
  assert(policy.requiresModerationAck, 'policy ack');
  assert(policy.riskLevel !== 'low' || policy.flaggedPhrases.length > 0, 'policy flagged');
  assert(regulatedComplianceBlock(health).includes('CẤM'), 'compliance block');

  console.log('PASS industry-adaptive content checks');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
