/**
 * One-shot: sync Chatbot Fanpage → MessagingChannelConnection using env token.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/sync-chatbot-to-messaging.ts
 */
import { createCipheriv, randomBytes, scryptSync } from 'crypto';
import {
  MessageChannel,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();
const SALT = 'marketingspa-integration-v1';

function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = scryptSync(encryptionKey, SALT, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

async function main() {
  const encryptionKey = process.env.ENCRYPTION_KEY || '';
  const pageAccessToken =
    process.env.META_MESSENGER_TOKEN_CHAT || process.env.META_PAGE_ACCESS_TOKEN || '';
  const envPageId = process.env.META_PAGE_ID || '';

  if (!encryptionKey || encryptionKey.length < 16) throw new Error('ENCRYPTION_KEY missing');
  if (!pageAccessToken) throw new Error('META_PAGE_ACCESS_TOKEN missing');

  const pages = await prisma.chatbotFacebookPage.findMany({
    where: { status: 'connected' },
  });
  if (pages.length === 0 && envPageId) {
    console.log('No chatbot pages — will still upsert from env META_PAGE_ID');
  }

  const targets =
    pages.length > 0
      ? pages
      : [
          {
            organizationId: (
              await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })
            )?.id,
            pageId: envPageId,
            pageName: process.env.META_PAGE_NAME || 'Fanpage',
            webhookSubscribed: true,
          },
        ];

  for (const page of targets) {
    if (!page.organizationId || !page.pageId) {
      console.log('skip incomplete page', page);
      continue;
    }
    const pageId = page.pageId;
    const token = pageAccessToken;

    const graph = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=id,name&access_token=${encodeURIComponent(token)}`,
    );
    const body = (await graph.json()) as { id?: string; name?: string; error?: { message: string } };
    const graphOk = graph.ok && !body.error;
    if (!graphOk) {
      console.warn(
        'Graph validate failed — vẫn lưu connection (token cần pages_messaging):',
        pageId,
        body.error?.message || body,
      );
    }

    const credentials = JSON.stringify({ pageAccessToken: token, pageId });
    const encrypted = encryptSecret(credentials, encryptionKey);

    const row = await prisma.messagingChannelConnection.upsert({
      where: {
        organizationId_channel_accountRef: {
          organizationId: page.organizationId,
          channel: MessageChannel.MESSENGER,
          accountRef: pageId,
        },
      },
      create: {
        organizationId: page.organizationId,
        channel: MessageChannel.MESSENGER,
        providerKind: MessagingProviderKind.MESSENGER,
        accountRef: pageId,
        displayName: body.name || page.pageName || 'Fanpage',
        encryptedCredentials: encrypted,
        status: graphOk
          ? MessagingChannelAccountStatus.ACTIVE
          : MessagingChannelAccountStatus.REAUTH_REQUIRED,
        permissions: ['MESSAGES'],
        lastTestedAt: new Date(),
        webhookSubscribed: Boolean(page.webhookSubscribed),
      },
      update: {
        displayName: body.name || page.pageName || 'Fanpage',
        encryptedCredentials: encrypted,
        status: graphOk
          ? MessagingChannelAccountStatus.ACTIVE
          : MessagingChannelAccountStatus.REAUTH_REQUIRED,
        permissions: ['MESSAGES'],
        lastTestedAt: new Date(),
        isPaused: false,
        webhookSubscribed: Boolean(page.webhookSubscribed),
      },
    });
    console.log('synced', {
      connectionId: row.id,
      pageId,
      org: page.organizationId,
      name: row.displayName,
      status: row.status,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
