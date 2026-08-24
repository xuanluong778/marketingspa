import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CUSTOM_PRODUCT,
  extractProductFromProjectName,
  suggestCustomer,
  suggestProduct,
} from '../apps/web/src/lib/marketing-autopilot-suggestions';

const FIXED_PRESETS = [
  'Người đang tìm động lực thay đổi',
  'Người từng trải thất bại / khởi đầu lại',
  'Người làm nghề muốn xây thương hiệu cá nhân',
  'Chủ doanh nghiệp / lãnh đạo nhỏ',
  'Người trẻ 22–35 đang định hướng cuộc sống',
  'Phụ nữ bận rộn muốn sống thật với bản thân',
  'Người theo dõi fanpage muốn câu chuyện chân thật',
  'Đồng nghiệp / cộng đồng nghề nghiệp',
];

const serum = { id: 'svc-serum', name: 'Serum trị nám', price: 850000, bookingCount30d: 99 };

function main() {
  const extracted = extractProductFromProjectName('Dự án Phun môi 3D');
  const fromProject = suggestProduct('Dự án Phun môi 3D', [serum]);
  const fromCampaign = suggestProduct('Chiến dịch Tăng lead Serum trị nám Q4 2026', [serum]);
  const projectProductPass =
    extracted === 'Phun môi 3D' &&
    fromProject.name === 'Phun môi 3D' &&
    fromProject.confidence !== 'INSUFFICIENT_DATA' &&
    fromProject.name !== 'Serum trị nám' &&
    fromCampaign.name === 'Serum trị nám';

  const audience = suggestCustomer({
    projectName: 'Dự án Phun môi 3D',
    productName: 'Phun môi 3D',
    area: 'TP.HCM',
  });
  const audienceFromProjectOnly = suggestCustomer({
    projectName: 'Dự án Phun môi 3D',
    productName: '',
    area: 'TP.HCM',
  });
  const productAudiencePass =
    audience.confidence !== 'INSUFFICIENT_DATA' &&
    audience.text.includes('Phun môi 3D') &&
    audience.text.includes('TP.HCM') &&
    audienceFromProjectOnly.text.includes('Phun môi 3D') &&
    audienceFromProjectOnly.text.includes('TP.HCM');

  const randomProduct = suggestProduct('Dự án Tăng booking', [serum]);
  const randomAudience = suggestCustomer({
    projectName: 'Dự án Tăng booking',
    productName: '',
    area: '',
  });
  const noRandomPass =
    randomProduct.confidence === 'INSUFFICIENT_DATA' &&
    randomProduct.name !== 'Serum trị nám' &&
    randomProduct.id === CUSTOM_PRODUCT &&
    !FIXED_PRESETS.includes(audience.text) &&
    !FIXED_PRESETS.includes(randomAudience.text) &&
    !FIXED_PRESETS.some((p) => audience.text === p);

  const lowProject = suggestProduct('Dự án', []);
  const lowAudience = suggestCustomer({ projectName: '', productName: '', area: '' });
  const root = '/var/www/dev_marketin_usr/data/www/dev.marketingautoaz.com';
  const uiText = readFileSync(join(root, 'apps/web/src/components/marketing-autopilot/autopilot-brief-form.tsx'), 'utf8');
  const libText = readFileSync(join(root, 'apps/web/src/lib/marketing-autopilot-suggestions.ts'), 'utf8');
  const lowConfidenceSafePass =
    lowProject.confidence === 'INSUFFICIENT_DATA' &&
    lowAudience.confidence === 'INSUFFICIENT_DATA' &&
    uiText.includes('LOW_DATA_HINT') &&
    libText.includes('Chưa đủ dữ liệu để gợi ý') &&
    uiText.includes('form.projectName') &&
    uiText.includes('form.productName') &&
    !libText.includes('Phụ nữ bận rộn muốn sống thật với bản thân') &&
    !libText.includes('Người đang tìm động lực thay đổi');

  const changedFiles = execSync('git status --porcelain', { cwd: root }).toString().trim().split('\n').filter(Boolean);
  const facebookFilesModifiedNone = !changedFiles.some((line) => {
    const path = line.replace(/^..\s+/, '').trim();
    if (!path.includes('apps/api/src/facebook/') && !path.includes('apps/api/src/auto-post/')) {
      return false;
    }
    return /\.(ts|tsx)$/.test(path) && !/\.d\.ts$/.test(path);
  });

  console.log(`PROJECT→PRODUCT SUGGESTION ${projectProductPass ? 'PASS' : 'FAIL'}`);
  console.log(`PRODUCT→AUDIENCE SUGGESTION ${productAudiencePass ? 'PASS' : 'FAIL'}`);
  console.log(`NO RANDOM SUGGESTION ${noRandomPass ? 'PASS' : 'FAIL'}`);
  console.log(`LOW CONFIDENCE SAFE ${lowConfidenceSafePass ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK FILES MODIFIED: ${facebookFilesModifiedNone ? 'NONE' : 'CHANGED'}`);

  if (!projectProductPass || !productAudiencePass || !noRandomPass || !lowConfidenceSafePass || !facebookFilesModifiedNone) {
    if (!projectProductPass) {
      console.error({ extracted, fromProject, fromCampaign });
    }
    if (!productAudiencePass) {
      console.error({ audience, audienceFromProjectOnly });
    }
    if (!noRandomPass) {
      console.error({ randomProduct, randomAudience, audienceText: audience.text });
    }
    if (!lowConfidenceSafePass) {
      console.error({ lowProject, lowAudience });
    }
    process.exit(1);
  }
}

main();
