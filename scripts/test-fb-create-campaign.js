/**
 * Test create Meta Ads campaign (PAUSED) dùng META_ACCESS_TOKEN + META_AD_ACCOUNT_ID từ .env hệ thống.
 *
 * Usage:
 *   node --env-file=.env scripts/test-fb-create-campaign.js
 *   node --env-file=.env scripts/test-fb-create-campaign.js "Ten campaign" OUTCOME_ENGAGEMENT
 */

const TOKEN = process.env.META_ACCESS_TOKEN?.trim();
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID?.trim();
const API_VERSION = process.env.META_API_VERSION?.trim() || 'v21.0';

const name = process.argv[2] || `Test MCP Web ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const objective = process.argv[3] || 'OUTCOME_ENGAGEMENT';

async function main() {
  if (!TOKEN) {
    console.error('FAIL: thiếu META_ACCESS_TOKEN trong .env');
    process.exit(1);
  }
  if (!AD_ACCOUNT) {
    console.error('FAIL: thiếu META_AD_ACCOUNT_ID trong .env');
    process.exit(1);
  }

  const actId = AD_ACCOUNT.startsWith('act_') ? AD_ACCOUNT : `act_${AD_ACCOUNT}`;
  const url = `https://graph.facebook.com/${API_VERSION}/${actId}/campaigns`;

  console.log('=== Create Meta campaign (PAUSED) ===');
  console.log(`API: ${API_VERSION}`);
  console.log(`Ad account: ${actId}`);
  console.log(`Name: ${name}`);
  console.log(`Objective: ${objective}`);
  console.log(`Token prefix: ${TOKEN.slice(0, 12)}...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      name,
      objective,
      status: 'PAUSED',
      buying_type: 'AUCTION',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    }),
  });

  const body = await res.json();
  console.log(`\nHTTP ${res.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok || body.error || !body.id) {
    console.error('\n>>> FAIL: không tạo được campaign');
    process.exit(1);
  }

  console.log(`\n>>> OK: đã tạo campaign PAUSED id=${body.id}`);
}

main().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
