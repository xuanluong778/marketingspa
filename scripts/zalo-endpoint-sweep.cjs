const { prisma } = require('../packages/database/dist');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';

(async () => {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials, key));
  const token = creds.accessToken || creds.access_token;
  const uid = (
    await prisma.chatbotConversation.findFirst({
      where: {
        organizationId: ORG,
        channel: 'zalo',
        channelRef: OA,
        NOT: { externalUserId: { startsWith: 'e2e_' } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  ).externalUserId;

  const text = `EP ${Date.now().toString().slice(-4)}`;
  const endpoints = [
    { url: 'https://openapi.zalo.me/v3.0/oa/message/cs', body: { recipient: { user_id: uid }, message: { text } } },
    { url: 'https://openapi.zalo.me/v2.0/oa/message', body: { recipient: { user_id: uid }, message: { text } } },
    { url: 'https://openapi.zalo.me/v2.0/oa/message/cs', body: { recipient: { user_id: uid }, message: { text } } },
    {
      url: 'https://openapi.zalo.me/v3.0/oa/message/cs',
      body: {
        recipient: { user_id: uid },
        message: { text },
      },
      extraHeaders: { access_token: token },
    },
  ];

  const rows = [];
  for (const ep of endpoints) {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        access_token: token,
        'Content-Type': 'application/json',
        ...(ep.extraHeaders || {}),
      },
      body: JSON.stringify(ep.body),
    });
    const data = await res.json();
    rows.push({
      path: ep.url.replace('https://openapi.zalo.me', ''),
      error: data.error ?? null,
      message: data.message || null,
      mid: data.data?.message_id ? String(data.data.message_id).slice(0, 18) : null,
    });
  }

  // Quota / permission probes
  const infoEndpoints = [
    'https://openapi.zalo.me/v2.0/oa/quota/message',
    'https://openapi.zalo.me/v3.0/oa/quota/message',
    'https://openapi.zalo.me/v2.0/oa/getoa',
  ];
  const info = [];
  for (const url of infoEndpoints) {
    const res = await fetch(url, { headers: { access_token: token } });
    const data = await res.json();
    info.push({
      path: url.replace('https://openapi.zalo.me', ''),
      error: data.error ?? null,
      message: data.message || null,
      hasData: Boolean(data.data),
    });
  }

  console.log(JSON.stringify({ uidTail: uid.slice(-6), send: rows, info }, null, 2));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e.message || e).slice(0, 300));
  process.exit(1);
});
