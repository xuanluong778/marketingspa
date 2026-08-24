import {
  assertAutopilotContentBundleQuality,
  formatAutopilotContentBundleScript,
  generateAutopilotContentIdeas,
  isGenericAutopilotContentLine,
  parseAutopilotContentBundleFromScript,
} from '@marketingspa/shared';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function main() {
  const input = {
    productName: 'Trị nám da',
    productPrice: 2_500_000,
    customerProfile: 'Nữ 28–45 tuổi, làm văn phòng TP.HCM, da nám sẫm sau sinh',
    targetArea: 'TP.HCM',
    primaryGoal: 'Tăng Lead / Booking / Doanh thu',
    valueProps: [
      'Thăm khám & phác đồ cá nhân trước khi điều trị',
      'Theo dõi tiến triển từng giai đoạn',
      'Không cam kết kết quả tuyệt đối — tư vấn rõ kỳ vọng',
    ],
    valueProposition: 'Trị nám có lộ trình, minh bạch chi phí, chăm sóc sau điều trị tại TP.HCM',
  };

  const bundle = generateAutopilotContentIdeas(input);
  const script = formatAutopilotContentBundleScript(bundle);
  const parsed = parseAutopilotContentBundleFromScript(script);

  const noGeneric = bundle.ideas.every(
    (i) =>
      !isGenericAutopilotContentLine(i.title) &&
      !/##\s*(Themes|Formats|Channels)/i.test(i.fullContent) &&
      !/^Short video$/i.test(i.formatLabel) &&
      i.fullContent.length >= 80,
  );

  const formats = new Set(bundle.ideas.map((i) => i.format));
  const hasVideo = formats.has('short_video');
  const hasCarousel = formats.has('carousel');
  const hasLanding = formats.has('landing_page');
  const hasEmail = formats.has('email');
  const hasChatbot = formats.has('chatbot');

  const video = bundle.ideas.find((i) => i.format === 'short_video');
  const carousel = bundle.ideas.find((i) => i.format === 'carousel');

  const videoStructure =
    Boolean(video?.shortVideo?.hook3s) &&
    (video?.shortVideo?.scenes?.length ?? 0) >= 2 &&
    Boolean(video?.shortVideo?.closingCta);

  const carouselStructure = (carousel?.carousel?.slides?.length ?? 0) >= 4;

  const safety =
    bundle.ideas.every(
      (i) =>
        !/100%|chữa khỏi|đảm bảo hiệu quả|cam kết hết/i.test(`${i.fullContent} ${i.offer}`) ||
        /không cam kết|tùy cơ địa|không cam kết 100%|không cam kết kết quả/i.test(
          `${i.fullContent} ${i.offer} ${(i.safetyNotes ?? []).join(' ')}`,
        ),
    ) && bundle.ideas.every((i) => (i.safetyNotes?.length ?? 0) >= 1);

  const localized =
    script.includes('TP.HCM') &&
    script.includes('Trị nám da') &&
    bundle.ideas.some((i) => /nám|da/i.test(i.customerInsight));

  const pass =
    bundle.ideas.length >= 5 &&
    bundle.ideas.every((i) => i.index >= 1 && i.index <= 5) &&
    assertAutopilotContentBundleQuality(bundle) &&
    noGeneric &&
    hasVideo &&
    hasCarousel &&
    hasLanding &&
    hasEmail &&
    hasChatbot &&
    videoStructure &&
    carouselStructure &&
    safety &&
    localized &&
    parsed != null &&
    parsed.ideas.length >= 5;

  console.log(`IDEAS COUNT ${bundle.ideas.length >= 5 ? 'PASS' : 'FAIL'}`);
  console.log(`NO GENERIC ${noGeneric ? 'PASS' : 'FAIL'}`);
  console.log(`FORMATS ${hasVideo && hasCarousel && hasLanding && hasEmail && hasChatbot ? 'PASS' : 'FAIL'}`);
  console.log(`VIDEO STRUCT ${videoStructure ? 'PASS' : 'FAIL'}`);
  console.log(`CAROUSEL STRUCT ${carouselStructure ? 'PASS' : 'FAIL'}`);
  console.log(`SAFETY ${safety ? 'PASS' : 'FAIL'}`);
  console.log(`LOCALIZED ${localized ? 'PASS' : 'FAIL'}`);
  console.log(`PARSE ROUNDTRIP ${parsed ? 'PASS' : 'FAIL'}`);
  console.log(`OVERALL ${pass ? 'PASS' : 'FAIL'}`);

  if (!pass) {
    console.log('\n--- Sample idea 1 title ---');
    console.log(bundle.ideas[0]?.title);
    console.log('\n--- Sample idea 1 excerpt ---');
    console.log(bundle.ideas[0]?.fullContent.slice(0, 400));
  }

  assert(pass, 'CONTENT DRAFT TEST FAIL');
}

main();
