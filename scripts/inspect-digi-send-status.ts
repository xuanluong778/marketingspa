/** Inspect Digi outbound bot send statuses */
import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  try {
    const page = await p.chatbotFacebookPage.findFirst({
      where: {
        OR: [
          { pageName: { contains: 'DIGI', mode: 'insensitive' } },
          { pageId: '103244355239559' },
        ],
      },
    });
    if (!page) {
      console.log('NO_PAGE');
      return;
    }
    console.log(
      'PAGE',
      JSON.stringify({
        pageId: page.pageId,
        pageName: page.pageName,
        aiEnabled: page.aiEnabled,
        status: page.status,
        webhookSubscribed: page.webhookSubscribed,
        hasToken: Boolean(page.pageAccessTokenEncrypted),
        tokenLen: page.pageAccessTokenEncrypted?.length,
        botId: page.botId?.slice(0, 8),
        org: page.organizationId?.slice(0, 8),
      }),
    );

    const convs = await p.chatbotConversation.findMany({
      where: { channelRef: page.pageId, channel: 'facebook' },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        externalUserId: true,
        visitorName: true,
        humanTakeover: true,
        status: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            role: true,
            senderType: true,
            direction: true,
            status: true,
            errorCode: true,
            externalMessageId: true,
            message: true,
            createdAt: true,
          },
        },
      },
    });

    for (const c of convs) {
      console.log(
        `\nCONV ${c.id.slice(0, 8)} psid…${String(c.externalUserId || '').slice(-4)} ${c.visitorName} takeover=${c.humanTakeover} ${c.status}`,
      );
      for (const m of [...c.messages].reverse()) {
        console.log(
          ' ',
          m.createdAt.toISOString(),
          m.role,
          m.senderType,
          m.direction,
          m.status,
          m.errorCode || '-',
          'mid=' + (m.externalMessageId || '-').slice(0, 24),
          JSON.stringify((m.message || '').slice(0, 90)),
        );
      }
    }

    const since = new Date(Date.now() - 7 * 864e5);
    const msgs = await p.chatbotMessage.findMany({
      where: {
        createdAt: { gte: since },
        senderType: 'BOT',
        conversation: { channelRef: page.pageId },
      },
      select: { status: true, errorCode: true },
    });
    const tally: Record<string, number> = {};
    for (const m of msgs) {
      const k = `${m.status || '?'}|${m.errorCode || '-'}`;
      tally[k] = (tally[k] || 0) + 1;
    }
    console.log('\nBOT_STATUS_7d', tally);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
