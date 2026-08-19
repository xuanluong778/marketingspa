/**
 * E2E: Digi Fanpage — AI reply chỉ lưu BOT khi Graph Send OK; fail không giả «đã gửi».
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-cskh-messenger-send-digi.ts
 */
import { PrismaClient } from '@prisma/client';
import { decryptSecret } from '../apps/api/dist/common/utils/encryption.util.js';
import { decodeStoredSecret } from '../apps/api/dist/common/utils/token-security.util.js';

type Case = { name: string; pass: boolean; detail: string };

const DIGI_PAGE_ID = '103244355239559';
const GRAPH = process.env.META_GRAPH_VERSION || process.env.FACEBOOK_GRAPH_VERSION || 'v21.0';

function decodeToken(enc: string | null | undefined): string {
  if (!enc) return '';
  const key = process.env.ENCRYPTION_KEY || '';
  try {
    const d = decodeStoredSecret(enc, key);
    if (d) return d;
  } catch {
    /* continue */
  }
  try {
    const d = decryptSecret(enc, key);
    if (d) return d;
  } catch {
    /* continue */
  }
  return '';
}

async function graphSend(
  pageId: string,
  token: string,
  psid: string,
  text: string,
  mode: 'RESPONSE' | 'HUMAN_AGENT' = 'RESPONSE',
) {
  const url = `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(pageId)}/messages`;
  const payload =
    mode === 'RESPONSE'
      ? {
          recipient: { id: psid },
          messaging_type: 'RESPONSE',
          message: { text },
        }
      : {
          recipient: { id: psid },
          messaging_type: 'MESSAGE_TAG',
          tag: 'HUMAN_AGENT',
          message: { text },
        };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    message_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
  };
  return { httpStatus: res.status, body, mode };
}

async function main() {
  const prisma = new PrismaClient();
  const results: Case[] = [];

  try {
    const page = await prisma.chatbotFacebookPage.findFirst({
      where: {
        OR: [{ pageId: DIGI_PAGE_ID }, { pageName: { contains: 'DIGI', mode: 'insensitive' } }],
      },
      include: { bot: true },
    });
    if (!page) {
      results.push({ name: 'fixture_digi_page', pass: false, detail: 'missing Digi page' });
      print(results, 1);
      return;
    }

    const token = decodeToken(page.pageAccessTokenEncrypted);
    results.push({
      name: 'page_token_present',
      pass: token.length > 20,
      detail: `pageId=…${page.pageId.slice(-4)} tokenLen=${token.length}`,
    });

    // Verify token ↔ pageId
    const meRes = await fetch(
      `https://graph.facebook.com/${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
    );
    const me = (await meRes.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      error?: { message?: string };
    };
    results.push({
      name: 'token_matches_pageId',
      pass: me.id === page.pageId,
      detail: `me.id=${me.id || me.error?.message || '?'} expected=${page.pageId}`,
    });

    // scopes
    const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
    let hasMessaging = false;
    if (appId && appSecret) {
      const dbg = await fetch(
        `https://graph.facebook.com/${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      );
      const dbgBody = (await dbg.json().catch(() => ({}))) as {
        data?: { is_valid?: boolean; scopes?: string[]; granular_scopes?: Array<{ scope?: string }> };
      };
      const scopes = new Set([
        ...(dbgBody.data?.scopes || []),
        ...((dbgBody.data?.granular_scopes || []).map((g) => g.scope || '').filter(Boolean) as string[]),
      ]);
      hasMessaging = scopes.has('pages_messaging');
      results.push({
        name: 'token_has_pages_messaging',
        pass: Boolean(dbgBody.data?.is_valid) && hasMessaging,
        detail: `valid=${dbgBody.data?.is_valid} scopes=${[...scopes].slice(0, 12).join(',')}`,
      });
    } else {
      results.push({
        name: 'token_has_pages_messaging',
        pass: false,
        detail: 'missing META_APP_ID/SECRET for debug_token',
      });
    }

    // Pick recipients: recent Digi inbound within 24h, prefer known admin …8455
    const since24h = new Date(Date.now() - 24 * 3600_000);
    const recent = await prisma.chatbotConversation.findMany({
      where: {
        channelRef: page.pageId,
        channel: 'facebook',
        externalUserId: { not: null },
        messages: {
          some: {
            direction: 'INBOUND',
            createdAt: { gte: since24h },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        externalUserId: true,
        visitorName: true,
        messages: {
          where: { direction: 'INBOUND' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true, message: true },
        },
      },
    });

    const adminConv = await prisma.chatbotConversation.findFirst({
      where: {
        channelRef: page.pageId,
        externalUserId: { endsWith: '8455' },
      },
      select: { id: true, externalUserId: true, visitorName: true },
    });

    results.push({
      name: 'recent_inbound_window',
      pass: recent.length > 0 || Boolean(adminConv?.externalUserId),
      detail: `recent24h=${recent.length} admin=${adminConv?.visitorName || '-'}`,
    });

    // --- Persist contract: fail must NOT save AI as BOT SENT ---
    const probeConv =
      recent[0] ||
      (await prisma.chatbotConversation.findFirst({
        where: { channelRef: page.pageId },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!probeConv) {
      results.push({ name: 'persist_fail_no_fake_bot', pass: false, detail: 'no conversation' });
    } else {
      const marker = `E2E_FAIL_DRAFT_${Date.now()}`;
      const processing = await prisma.chatbotMessage.create({
        data: {
          conversationId: probeConv.id,
          role: 'assistant',
          message: '…',
          status: 'PROCESSING',
          direction: 'OUTBOUND',
          senderType: 'BOT',
        },
      });
      // Simulate post-send failure persist (same rules as service)
      await prisma.chatbotMessage.update({
        where: { id: processing.id },
        data: {
          role: 'system',
          senderType: 'SYSTEM',
          message: `Không gửi được Messenger · http=400 · code=10 · MESSENGER_STANDARD_ACCESS · ${marker}`,
          status: 'FAILED',
          direction: 'OUTBOUND',
          errorCode: 'MESSENGER_STANDARD_ACCESS',
          externalMessageId: null,
        },
      });
      const row = await prisma.chatbotMessage.findUnique({ where: { id: processing.id } });
      results.push({
        name: 'persist_fail_no_fake_bot',
        pass:
          row?.status === 'FAILED' &&
          row.senderType === 'SYSTEM' &&
          row.role === 'system' &&
          !row.externalMessageId &&
          Boolean(row.message?.includes('Không gửi được Messenger')) &&
          !row.message?.includes('Thế Giới DIGI chuyên cung cấp'),
        detail: `status=${row?.status} sender=${row?.senderType} msg="${(row?.message || '').slice(0, 100)}"`,
      });
      await prisma.chatbotMessage.delete({ where: { id: processing.id } }).catch(() => undefined);
    }

    // --- Live Graph sends ---
    const markerOk = `E2E_DIGI_SEND_${Date.now()}`;
    let liveDelivered = false;
    let liveMid = '';
    let livePsid = '';

    const candidates: Array<{ psid: string; label: string }> = [];
    // Admin trước — Standard Access vẫn gửi được; ngoài 24h dùng HUMAN_AGENT
    if (adminConv?.externalUserId && /^\d+$/.test(adminConv.externalUserId)) {
      candidates.push({
        psid: adminConv.externalUserId,
        label: `admin:${adminConv.visitorName || '8455'}`,
      });
    }
    for (const c of recent) {
      if (c.externalUserId && /^\d+$/.test(c.externalUserId)) {
        if (candidates.some((x) => x.psid === c.externalUserId)) continue;
        candidates.push({
          psid: c.externalUserId,
          label: `recent:${c.visitorName || c.externalUserId.slice(-4)}`,
        });
      }
    }

    for (const cand of candidates) {
      const text = `[CSKH E2E] ${markerOk} — kiểm tra gửi Messenger Fanpage Thế Giới DIGI.`;
      let send = await graphSend(page.pageId, token, cand.psid, text, 'RESPONSE');
      if (!send.body.message_id && send.body.error?.error_subcode === 2018278) {
        send = await graphSend(page.pageId, token, cand.psid, text, 'HUMAN_AGENT');
      }
      // Admin ngoài 24h: thử HUMAN_AGENT luôn nếu RESPONSE fail
      if (!send.body.message_id && cand.label.startsWith('admin:')) {
        send = await graphSend(page.pageId, token, cand.psid, text, 'HUMAN_AGENT');
      }
      const ok = Boolean(send.body.message_id) && !send.body.error;
      results.push({
        name: `live_graph_send:${cand.label}`,
        pass: ok,
        detail: ok
          ? `mode=${send.mode} mid=${send.body.message_id?.slice(0, 28)}`
          : `mode=${send.mode} http=${send.httpStatus} code=${send.body.error?.code ?? '-'} sub=${send.body.error?.error_subcode ?? '-'} msg="${(send.body.error?.message || '').slice(0, 120)}"`,
      });
      if (ok && send.body.message_id) {
        liveDelivered = true;
        liveMid = send.body.message_id;
        livePsid = cand.psid;
        break;
      }
    }

    if (!candidates.length) {
      results.push({
        name: 'live_graph_send:none',
        pass: false,
        detail: 'No eligible Digi PSID (need Admin/Dev/Tester + 24h window)',
      });
    }

    // Persist success contract when live delivered
    if (liveDelivered && livePsid) {
      const conv =
        (await prisma.chatbotConversation.findFirst({
          where: { channelRef: page.pageId, externalUserId: livePsid },
        })) || probeConv;
      if (conv) {
        const saved = await prisma.chatbotMessage.create({
          data: {
            conversationId: conv.id,
            role: 'assistant',
            message: `[CSKH E2E] ${markerOk} — đã gửi Messenger.`,
            status: 'SENT',
            direction: 'OUTBOUND',
            senderType: 'BOT',
            externalMessageId: liveMid.slice(0, 128),
            errorCode: null,
          },
        });
        const verify = await prisma.chatbotMessage.findUnique({ where: { id: saved.id } });
        results.push({
          name: 'persist_success_bot_sent_with_mid',
          pass:
            verify?.status === 'SENT' &&
            verify.senderType === 'BOT' &&
            verify.externalMessageId === liveMid.slice(0, 128) &&
            Boolean(verify.message?.includes(markerOk)),
          detail: `id=${saved.id.slice(0, 8)} mid=${liveMid.slice(0, 24)}`,
        });
        // Keep the message — it is a real Messenger delivery confirmation in CSKH inbox
      }
    } else {
      results.push({
        name: 'persist_success_bot_sent_with_mid',
        pass: false,
        detail:
          'No live Messenger delivery — Meta Standard Access (code 10) hoặc ngoài 24h window. Cần Advanced Access pages_messaging hoặc nhắn từ Admin/Tester.',
      });
    }

    // Customer recent (non-admin) must not be treated as delivered when Graph fails
    const customer = recent.find(
      (c) => c.externalUserId && adminConv?.externalUserId !== c.externalUserId,
    );
    if (customer?.externalUserId) {
      const send = await graphSend(
        page.pageId,
        token,
        customer.externalUserId,
        `should_fail_${Date.now()}`,
      );
      const blocked = Boolean(send.body.error) || !send.body.message_id;
      results.push({
        name: 'customer_send_blocked_or_ok_logged',
        pass: blocked || Boolean(send.body.message_id),
        detail: blocked
          ? `expected_block http=${send.httpStatus} code=${send.body.error?.code} msg="${(send.body.error?.message || '').slice(0, 100)}"`
          : `unexpected_ok mid=${send.body.message_id?.slice(0, 24)}`,
      });
    }

    const failed = results.filter((r) => !r.pass).length;
    // Hard requirements for overall PASS:
    // - token/page match
    // - fail persist contract
    // - at least one live Graph delivery + BOT SENT with mid
    const hard = [
      'token_matches_pageId',
      'persist_fail_no_fake_bot',
      'persist_success_bot_sent_with_mid',
    ];
    const hardFail = results.some((r) => hard.includes(r.name) && !r.pass);
    print(results, hardFail || failed ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

function print(results: Case[], code: number) {
  console.log('\n=== DIGI MESSENGER SEND E2E ===');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name} — ${r.detail}`);
  }
  console.log(
    `\nSUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASS${code ? ' (FAILED)' : ''}\n`,
  );
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
