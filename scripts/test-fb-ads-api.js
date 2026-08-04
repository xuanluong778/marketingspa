/**
 * Test Facebook Marketing / Ads Graph API (v24.0)
 * Usage: node scripts/test-fb-ads-api.js [ACCESS_TOKEN]
 */

const TOKEN =
  process.argv[2] ||
  process.env.FB_ACCESS_TOKEN ||
  'EAAiBYJV08kkBSJKb1uB0TMNpBlmLkPj1JKZCBMlLaqMhkbBKxDCP8TtSQ6bZBZB8ZC8G7nRanRrDRzxik1ciEbZCZCdThFX3Rlm70ZAZAgzFyMspAMxQ3GgkEsgHZBcsh7wOGjaFhqvlaFf6ZA5ZCqYJiZCKiZBeQI6V8aj4ya58U0ZBk8DYX0EcttpQaq4JpVCVxjnJhZCecJFVMSZAaUUVD04bHhAeb52g';

const API_VERSION = 'v24.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

async function getJson(url, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`GET ${url.replace(TOKEN, '***')}`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(data, null, 2));
  return { ok: res.ok, status: res.status, data };
}

function summarizeError(data) {
  const err = data?.error;
  if (!err) return null;
  const msg = `${err.message || ''} ${err.error_user_msg || ''} ${err.type || ''}`.toLowerCase();
  if (msg.includes('permission') || msg.includes('ads_management') || msg.includes('unsupported get')) {
    return 'PERMISSION_OR_SCOPE_ISSUE';
  }
  return 'API_ERROR';
}

async function main() {
  console.log('Facebook Ads API smoke test');
  console.log(`Version: ${API_VERSION}`);
  console.log(`Token prefix: ${TOKEN.slice(0, 12)}... (len=${TOKEN.length})`);

  // 1) Who am I
  const me = await getJson(`${BASE}/me?fields=id,name`, '1) /me');

  // 2) Ad accounts
  const accounts = await getJson(
    `${BASE}/me/adaccounts?fields=id,account_id,name,currency,account_status&limit=25`,
    '2) /me/adaccounts',
  );

  const list = accounts.data?.data || [];
  if (accounts.ok && Array.isArray(list)) {
    console.log(`\n>>> Ad accounts count: ${list.length}`);
    if (list.length === 0) {
      console.log('>>> OK: API thật hoạt động (data: []). Token có quyền gọi ads API nhưng chưa có ad account.');
    } else {
      console.log('>>> OK: API thật hoạt động — có danh sách ad account.');
    }
  } else {
    const kind = summarizeError(accounts.data);
    console.log(`\n>>> FAIL adaccounts: ${kind || 'UNKNOWN'}`);
  }

  // 3) Campaigns of first account (if any)
  const first = list[0];
  if (first?.id) {
    const campaigns = await getJson(
      `${BASE}/${first.id}/campaigns?fields=id,name,status,objective&limit=10`,
      `3) /${first.id}/campaigns`,
    );

    if (campaigns.ok && Array.isArray(campaigns.data?.data)) {
      console.log(`\n>>> Campaigns count: ${campaigns.data.data.length}`);
      console.log('>>> OK: đọc campaigns thành công (có thể là mảng rỗng).');
    } else {
      const kind = summarizeError(campaigns.data);
      console.log(`\n>>> FAIL campaigns: ${kind || 'UNKNOWN'}`);
    }
  } else {
    console.log('\n=== 3) /act_xxx/campaigns ===');
    console.log('Bỏ qua — không có ad account để test.');
  }

  console.log('\n=== DONE ===');
}

main().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
