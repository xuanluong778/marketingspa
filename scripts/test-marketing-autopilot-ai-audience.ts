import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  suggestAudienceOptions,
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

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function main() {
  const root = '/var/www/dev_marketin_usr/data/www/dev.marketingautoaz.com';
  const ui = readFileSync(join(root, 'apps/web/src/components/marketing-autopilot/autopilot-brief-form.tsx'), 'utf8');

  const rich = suggestAudienceOptions({
    projectName: 'Dự án Phun môi 3D',
    productName: 'Phun môi 3D',
    area: 'TP.HCM',
    options: {
      products: [],
      segments: [
        { id: 'seg-1', name: 'Nữ 25-35 quan tâm thẩm mỹ', source: 'crm' },
        { id: 'seg-2', name: 'Khách HCM đã booking', source: 'crm' },
      ],
      provinces: ['TP.HCM'],
      defaultProvince: 'TP.HCM',
      defaultProvinceSource: null,
      organizationName: 'Test',
      organizationAddress: null,
      goals: [],
      budgetPresets: [],
    },
    snapshot: {
      organizationId: 'org',
      generatedAt: new Date().toISOString(),
      timeRange: { from: '', to: '' },
      engineVersion: 'v1',
      metrics: {
        leads: { total: 40, hot: 5, noFollowUp: 12 },
        bookings: { total: 4 },
        chatbot: { leadsCaptured: 3 },
      },
      insights: [{ id: '1', category: 'crm', title: 'Lead chưa follow-up', summary: '12 lead', evidence: 'x', source: 'crm', timeRange: { from: '', to: '' }, confidence: 'HIGH' }],
      sources: [],
    } as any,
  });

  const aiAudience10Pass =
    rich.options.length === 10 &&
    rich.options.every((o, i) => o.index === i + 1 && o.text.trim().length > 0) &&
    rich.options.some((o) => o.text.includes('Phun môi 3D')) &&
    rich.options.some((o) => o.text.includes('TP.HCM')) &&
    !rich.options.some((o) => FIXED_PRESETS.includes(o.text)) &&
    rich.confidence !== 'INSUFFICIENT_DATA';

  // Simulate click-to-apply: picking option N fills customerProfile with that text
  let customerProfile = '';
  const pick = rich.options[2];
  assert(pick, 'Missing option 3');
  customerProfile = pick.text;
  const clickToApplyPass =
    customerProfile === pick.text &&
    customerProfile.length > 0 &&
    ui.includes('Gợi ý AI') &&
    ui.includes('applyAudienceOption') &&
    ui.includes('suggestAudienceOptions') &&
    !ui.includes('CUSTOMER_PRESETS') &&
    ui.includes('Textarea') &&
    ui.includes('customerProfile');

  const empty = suggestAudienceOptions({
    projectName: '',
    productName: '',
    area: '',
  });
  const existingSystemPass =
    empty.options.length === 0 &&
    empty.confidence === 'INSUFFICIENT_DATA' &&
    ui.includes('id="customerProfile"') &&
    ui.includes('Khách hàng mục tiêu');

  const changedFiles = execSync('git status --porcelain', { cwd: root })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  const facebookFilesModifiedNone = !changedFiles.some((f) => {
    const path = f.replace(/^..\s+/, '').trim();
    if (!path.includes('apps/api/src/facebook/') && !path.includes('apps/api/src/auto-post/')) {
      return false;
    }
    return /\.(ts|tsx)$/.test(path) && !/\.d\.ts$/.test(path);
  });

  console.log(`AI AUDIENCE 10 OPTIONS ${aiAudience10Pass ? 'PASS' : 'FAIL'}`);
  console.log(`CLICK TO APPLY ${clickToApplyPass ? 'PASS' : 'FAIL'}`);
  console.log(`EXISTING SYSTEM ${existingSystemPass ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK FILES MODIFIED ${facebookFilesModifiedNone ? 'NONE' : 'CHANGED'}`);

  assert(aiAudience10Pass, 'AI AUDIENCE 10 OPTIONS FAIL');
  assert(clickToApplyPass, 'CLICK TO APPLY FAIL');
  assert(existingSystemPass, 'EXISTING SYSTEM FAIL');
  assert(facebookFilesModifiedNone, 'FACEBOOK FILES MODIFIED');
}

main();
