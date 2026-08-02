/**
 * One-shot: tạo bot ACTIVE + gắn Fanpage Messenger từ .env rồi subscribe webhook.
 * Usage: node scripts/with-root-env.cjs node scripts/setup-messenger-chatbot.cjs
 */
const API = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

async function main() {
  const pageId = (process.env.META_PAGE_ID || '').trim();
  const pageToken = (
    process.env.META_MESSENGER_TOKEN_CHAT ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    ''
  ).trim();

  if (!pageId || !pageToken) {
    throw new Error('Thiếu META_PAGE_ID hoặc META_MESSENGER_TOKEN_CHAT / META_PAGE_ACCESS_TOKEN');
  }

  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SETUP_ADMIN_EMAIL || 'admin@demo-spa.com',
      password: process.env.SETUP_ADMIN_PASSWORD || 'password123',
    }),
  });
  const login = await loginRes.json();
  if (!loginRes.ok || !login.accessToken) {
    throw new Error(`Login failed: ${login.message || loginRes.status}`);
  }
  const auth = { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' };

  // Ensure settings exist
  await fetch(`${API}/api/v1/chatbot-cskh/settings`, { headers: auth });

  let bots = await (await fetch(`${API}/api/v1/chatbot-cskh/bots`, { headers: auth })).json();
  let bot = Array.isArray(bots) ? bots.find((b) => b.status === 'ACTIVE') || bots[0] : null;

  if (!bot) {
    const createRes = await fetch(`${API}/api/v1/chatbot-cskh/bots`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        botName: 'Chatbot CSKH Messenger',
        businessName: 'Demo Spa Wellness',
        industry: 'spa',
        consultationTone: 'friendly',
        greeting: 'Xin chào! Em là chatbot CSKH. Anh/chị cần hỗ trợ gì ạ?',
        mainServices: 'Tư vấn dịch vụ spa, đặt lịch, chăm sóc khách hàng',
        status: 'ACTIVE',
      }),
    });
    bot = await createRes.json();
    if (!createRes.ok) throw new Error(`Create bot failed: ${JSON.stringify(bot)}`);
  } else if (bot.status !== 'ACTIVE') {
    const patchRes = await fetch(`${API}/api/v1/chatbot-cskh/bots/${bot.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    bot = await patchRes.json();
    if (!patchRes.ok) throw new Error(`Activate bot failed: ${JSON.stringify(bot)}`);
  }

  // Resolve page name from Graph if possible
  let pageName = 'Fanpage Messenger';
  try {
    const g = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=name&access_token=${encodeURIComponent(pageToken)}`,
    );
    const gj = await g.json();
    if (gj?.name) pageName = String(gj.name);
  } catch {
    /* ignore */
  }

  const connectRes = await fetch(`${API}/api/v1/chatbot-cskh/facebook/pages`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      botId: bot.id,
      pageId,
      pageName,
      pageAccessToken: pageToken,
      aiEnabled: true,
    }),
  });
  const connected = await connectRes.json();
  if (!connectRes.ok) throw new Error(`Connect page failed: ${JSON.stringify(connected)}`);

  // Knowledge seed (optional)
  const knowledge = await (
    await fetch(`${API}/api/v1/chatbot-cskh/knowledge?botId=${bot.id}`, { headers: auth })
  ).json();
  if (Array.isArray(knowledge) && knowledge.length === 0) {
    await fetch(`${API}/api/v1/chatbot-cskh/knowledge`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        botId: bot.id,
        title: 'Giới thiệu spa',
        sourceType: 'MANUAL',
        content:
          'Chúng tôi là spa wellness. Hỗ trợ tư vấn liệu trình, đặt lịch, giá dịch vụ cơ bản và chăm sóc khách hàng qua Messenger.',
      }),
    });
  }

  const pages = await (await fetch(`${API}/api/v1/chatbot-cskh/facebook/pages`, { headers: auth })).json();
  const openai = await (
    await fetch(`${API}/api/v1/chatbot-cskh/openai/status`, { headers: auth })
  ).json();

  console.log(
    JSON.stringify(
      {
        ok: true,
        botId: bot.id,
        botStatus: bot.status,
        pageId,
        pageName,
        webhookSubscribed: connected.webhookSubscribed,
        pagesCount: Array.isArray(pages) ? pages.length : 0,
        openaiConfigured: Boolean(openai?.configured ?? openai?.ok ?? openai?.ready),
        webhookUrl: `${API}/api/v1/chatbot-cskh/facebook/webhook`,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('SETUP_FAILED', err.message || err);
  process.exit(1);
});
