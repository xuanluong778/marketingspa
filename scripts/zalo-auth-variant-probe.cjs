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
  const uidRow = await prisma.chatbotConversation.findFirst({
    where: {
      organizationId: ORG,
      channel: 'zalo',
      channelRef: OA,
      NOT: { externalUserId: { startsWith: 'e2e_' } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const uid = uidRow.externalUserId;
  const text = `Auth probe ${new Date().toISOString().slice(11, 19)}`;

  const variants = [
    {
      name: 'v3_bearer',
      url: 'https://openapi.zalo.me/v3.0/oa/message/cs',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
    {
      name: 'v3_access_token_header',
      url: 'https://openapi.zalo.me/v3.0/oa/message/cs',
      headers: { access_token: token, 'Content-Type': 'application/json' },
    },
    {
      name: 'v2_bearer',
      url: 'https://openapi.zalo.me/v2.0/oa/message/cs',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
    {
      name: 'v2_access_token',
      url: 'https://openapi.zalo.me/v2.0/oa/message/cs',
      headers: { access_token: token, 'Content-Type': 'application/json' },
    },
  ];

  const out = [];
  for (const v of variants) {
    const res = await fetch(v.url, {
      method: 'POST',
      headers: v.headers,
      body: JSON.stringify({
        recipient: { user_id: uid },
        message: { text },
      }),
    });
    const body = await res.json();
    out.push({
      name: v.name,
      http: res.status,
      error: body.error ?? null,
      message: body.message || null,
      messageId: body.data?.message_id ? String(body.data.message_id).slice(0, 20) : null,
    });
  }

  console.log(JSON.stringify({ uidTail: uid.slice(-6), variants: out }, null, 2));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e.message || e).slice(0, 300));
  process.exit(1);
});
