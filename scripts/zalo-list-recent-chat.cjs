/**
 * Pull recent Zalo OA conversations (no tokens printed).
 * Uses Digi OA access token to discover real user IDs for inbox E2E.
 */
const { prisma } = require('../packages/database/dist');
const { decryptSecret } = require('../apps/api/dist/common/utils/encryption.util');

const OA = '526368405518511676';
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';

(async () => {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  if (!conn?.encryptedCredentials) {
    console.log(JSON.stringify({ ok: false, reason: 'no_connection' }));
    process.exit(1);
  }
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials, key));
  const token = creds.accessToken || creds.access_token;
  if (!token) {
    console.log(JSON.stringify({ ok: false, reason: 'no_access_token' }));
    process.exit(1);
  }

  const url = new URL('https://openapi.zalo.me/v2.0/oa/listrecentchat');
  url.searchParams.set('data', JSON.stringify({ offset: 0, count: 10 }));
  const res = await fetch(url, {
    headers: { access_token: token },
  });
  const body = await res.json();
  const data = Array.isArray(body?.data) ? body.data : [];
  console.log(
    JSON.stringify(
      {
        http: res.status,
        error: body.error,
        message: body.message,
        count: data.length,
        items: data.slice(0, 10).map((row) => ({
          uidTail: String(row.user_id || row.from_id || row.src || '').slice(-6),
          uidLen: String(row.user_id || row.from_id || row.src || '').length,
          name: row.display_name || row.name || null,
          time: row.time || row.msg_time || null,
          preview: String(row.message || row.text || row.last_message || '').slice(0, 60),
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(String(e.message || e).slice(0, 300));
  process.exit(1);
});
