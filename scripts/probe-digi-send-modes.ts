/** Probe Digi Messenger send modes (RESPONSE / HUMAN_AGENT). */
import { PrismaClient } from '@prisma/client';
import { decryptSecret } from '../apps/api/dist/common/utils/encryption.util.js';
import { decodeStoredSecret } from '../apps/api/dist/common/utils/token-security.util.js';

const GRAPH = process.env.META_GRAPH_VERSION || process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';
const PAGE_ID = '103244355239559';

function decodeToken(enc: string): string {
  const key = process.env.ENCRYPTION_KEY || '';
  try {
    const d = decodeStoredSecret(enc, key);
    if (d) return d;
  } catch {
    /* continue */
  }
  try {
    return decryptSecret(enc, key) || '';
  } catch {
    return '';
  }
}

async function main() {
  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
  const secret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
  if (appId && secret) {
    const rolesRes = await fetch(
      `https://graph.facebook.com/${GRAPH}/${appId}/roles?access_token=${encodeURIComponent(`${appId}|${secret}`)}`,
    );
    const rolesBody = (await rolesRes.json()) as {
      data?: Array<{ role?: string; user?: string }>;
      error?: { message?: string };
    };
    console.log(
      'ROLES',
      JSON.stringify(
        (rolesBody.data || []).map((r) => ({
          role: r.role,
          userTail: String(r.user || '').slice(-4),
        })),
      ),
      rolesBody.error?.message || '',
    );
  }

  const prisma = new PrismaClient();
  try {
    const page = await prisma.chatbotFacebookPage.findFirst({ where: { pageId: PAGE_ID } });
    if (!page) throw new Error('no page');
    const token = decodeToken(page.pageAccessTokenEncrypted);
    const convs = await prisma.chatbotConversation.findMany({
      where: { channelRef: PAGE_ID },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { externalUserId: true, visitorName: true },
    });

    for (const t of convs) {
      const psid = t.externalUserId || '';
      if (!/^\d+$/.test(psid)) continue;
      for (const mode of ['RESPONSE', 'HUMAN_AGENT'] as const) {
        const body =
          mode === 'RESPONSE'
            ? {
                recipient: { id: psid },
                messaging_type: 'RESPONSE',
                message: { text: `E2E probe ${mode} ${Date.now()}` },
              }
            : {
                recipient: { id: psid },
                messaging_type: 'MESSAGE_TAG',
                tag: 'HUMAN_AGENT',
                message: { text: `E2E probe ${mode} ${Date.now()}` },
              };
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(PAGE_ID)}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          },
        );
        const j = (await res.json()) as {
          message_id?: string;
          error?: { message?: string; code?: number; error_subcode?: number };
        };
        console.log(
          JSON.stringify({
            name: t.visitorName,
            psidTail: psid.slice(-4),
            mode,
            http: res.status,
            code: j.error?.code,
            sub: j.error?.error_subcode,
            mid: j.message_id?.slice(0, 24),
            msg: (j.error?.message || '').slice(0, 120),
          }),
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
