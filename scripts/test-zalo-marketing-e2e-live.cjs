/**
 * Zalo Marketing live E2E (no mock/stub; never logs tokens).
 *
 * Run:
 *   node scripts/with-root-env.cjs node scripts/test-zalo-marketing-e2e-live.cjs
 *
 * Optional:
 *   ZALO_E2E_PHONE / ZALO_E2E_USER_ID — for ZBS test + CS reply
 *   MESSAGING_LIVE_OA_IDS — must include OA/ZBS accountRef for live send
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');

const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const SUPER_EMAIL = process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com';

const rows = [];
function record(category, pass, evidence, error, fix) {
  rows.push({
    category,
    result: pass ? 'PASS' : 'FAIL',
    evidence: String(evidence || '').slice(0, 280),
    error: String(error || '').slice(0, 220),
    fix: String(fix || '').slice(0, 220),
  });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${category} | ${evidence}${error ? ' | ERR: ' + error : ''}`);
}

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mint(user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 1800,
    }),
  );
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function api(path, token, init = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!JWT_SECRET) throw new Error('JWT_SECRET missing');

  const oa = await prisma.messagingChannelConnection.findFirst({
    where: {
      channel: 'ZALO',
      providerKind: 'ZALO_OA',
      status: 'ACTIVE',
      isPaused: false,
      encryptedCredentials: { not: null },
    },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  if (!oa) {
    record('0. OA ACTIVE', false, 'no ACTIVE OA with credentials', 'missing OA', 'Kết nối OA ACTIVE trong Settings → Kết nối');
    printSummary();
    await prisma.$disconnect();
    process.exit(1);
  }

  record(
    '0. OA ACTIVE',
    true,
    `org=${oa.organization.name} oa=${oa.accountRef} name=${oa.displayName || ''} expires=${oa.tokenExpiresAt?.toISOString() || 'n/a'}`,
    '',
    '',
  );

  const orgId = oa.organizationId;
  let user = await prisma.user.findFirst({
    where: { email: SUPER_EMAIL, organizationId: orgId, deletedAt: null },
    include: { role: true },
  });
  if (!user) {
    user = await prisma.user.findFirst({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  if (!user) {
    user = await prisma.user.findFirst({
      where: { email: SUPER_EMAIL, deletedAt: null },
      include: { role: true },
    });
  }
  if (!user) {
    record('0. Auth', false, 'no user for OA org', 'no_user', 'Thêm user vào org');
    printSummary();
    await prisma.$disconnect();
    process.exit(1);
  }

  const roleName = user.role?.name || 'OWNER';
  const token = mint({
    id: user.id,
    email: user.email,
    organizationId: orgId,
    role: roleName,
  });
  record('0. Auth', true, `user=${user.email} role=${roleName}`, '', '');

  const liveSend = process.env.MESSAGING_LIVE_SEND === 'true';
  const liveOaIds = (process.env.MESSAGING_LIVE_OA_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const oaLive = liveSend || liveOaIds.includes(oa.accountRef);
  record(
    '0. Live-send gate',
    true,
    `MESSAGING_LIVE_SEND=${liveSend} OA_in_allowlist=${liveOaIds.includes(oa.accountRef)} effectiveLive=${oaLive}`,
    oaLive ? '' : 'live send OFF for this OA',
    oaLive
      ? ''
      : `Thêm ${oa.accountRef} vào MESSAGING_LIVE_OA_IDS hoặc bật MESSAGING_LIVE_SEND=true rồi restart api/worker`,
  );

  // OA connectivity
  const testRes = await api(`/zalo/connections/${oa.id}/test`, token, { method: 'POST', body: '{}' });
  const testPass = testRes.status >= 200 && testRes.status < 300 && testRes.json?.valid === true;
  record(
    '0. OA test API',
    testPass,
    `http=${testRes.status} valid=${testRes.json?.valid} name=${testRes.json?.displayName || ''}`,
    testPass ? '' : JSON.stringify(testRes.json).slice(0, 180),
    testPass ? '' : 'Refresh OA token / kiểm tra ZALO_APP_ID+SECRET',
  );

  // ---------- 1. ZBS templates ----------
  const zbs = await prisma.messagingChannelConnection.findFirst({
    where: {
      organizationId: orgId,
      channel: 'ZALO',
      providerKind: 'ZBS_TEMPLATE',
      status: 'ACTIVE',
      encryptedCredentials: { not: null },
    },
  });

  if (!zbs) {
    record(
      '1. Mẫu ZBS',
      false,
      `org=${oa.organization.name} không có ZBS_TEMPLATE connection có credentials`,
      'missing_zbs_connection',
      'Kết nối ZBS (appId/secretKey/accessToken) tại Zalo Marketing → OA/ZBS rồi Sync templates',
    );
    record(
      '2. Gửi ZBS test',
      false,
      'blocked — chưa có ZBS connection',
      'missing_zbs_connection',
      'Kết nối ZBS trước, set ZALO_E2E_PHONE hoặc ZALO_E2E_USER_ID, bật MESSAGING_LIVE_OA_IDS',
    );
  } else {
    const sync = await api('/zalo-marketing/templates/sync', token, {
      method: 'POST',
      body: JSON.stringify({ connectionId: zbs.id }),
    });
    const list = await api(`/zalo-marketing/templates?connectionId=${encodeURIComponent(zbs.id)}`, token);
    const items = Array.isArray(list.json) ? list.json : list.json?.items || list.json?.data || [];
    const syncOk = sync.status < 300;
    const hasTemplates = items.length > 0;
    record(
      '1. Mẫu ZBS',
      syncOk && hasTemplates,
      `syncHttp=${sync.status} listHttp=${list.status} count=${items.length} sample=${items
        .slice(0, 3)
        .map((t) => `${t.providerTemplateId || t.id}:${t.approvalStatus || t.approval}`)
        .join(',')}`,
      syncOk ? (hasTemplates ? '' : 'empty_template_list') : JSON.stringify(sync.json).slice(0, 180),
      syncOk ? (hasTemplates ? '' : 'Tạo/duyệt template trên Zalo Business') : 'Kiểm tra ZBS accessToken + quyền template/all',
    );

    // ---------- 2. ZBS test send ----------
    const phone = (process.env.ZALO_E2E_PHONE || '').trim();
    const userId = (process.env.ZALO_E2E_USER_ID || '').trim();
    const approved = items.find((t) => (t.approvalStatus || t.approval) === 'APPROVED' || t.isActive);
    const templateId = approved?.providerTemplateId || items[0]?.providerTemplateId;
    if (!phone && !userId) {
      record(
        '2. Gửi ZBS test',
        false,
        'thiếu ZALO_E2E_PHONE hoặc ZALO_E2E_USER_ID',
        'missing_recipient',
        'Set ZALO_E2E_PHONE=84… hoặc ZALO_E2E_USER_ID rồi chạy lại',
      );
    } else if (!templateId) {
      record('2. Gửi ZBS test', false, 'không có templateId', 'no_template', 'Sync template APPROVED trước');
    } else {
      const zbsLive =
        liveSend || liveOaIds.includes(zbs.accountRef) || liveOaIds.includes(oa.accountRef);
      if (!zbsLive) {
        record(
          '2. Gửi ZBS test',
          false,
          `dry-run gate — templateId=${templateId}`,
          'MESSAGING_LIVE_SEND/OA_IDS off',
          `Thêm ${zbs.accountRef} hoặc ${oa.accountRef} vào MESSAGING_LIVE_OA_IDS + restart`,
        );
      } else {
        const vars = approved?.variables || items[0]?.variables || [];
        const templateData = {};
        for (const v of Array.isArray(vars) ? vars : []) {
          templateData[typeof v === 'string' ? v : v.key] = 'E2E';
        }
        const send = await api('/zalo-marketing/test/zbs', token, {
          method: 'POST',
          body: JSON.stringify({
            connectionId: zbs.id,
            templateId: String(templateId),
            phone: phone || undefined,
            userId: userId || undefined,
            templateData,
          }),
        });
        const mid = send.json?.messageId || send.json?.msg_id || send.json?.data?.msg_id;
        const dry = send.json?.dryRun === true;
        const ok = send.status < 300 && !dry && Boolean(mid);
        record(
          '2. Gửi ZBS test',
          ok,
          `http=${send.status} dryRun=${dry} messageId=${mid ? '…' + String(mid).slice(-6) : 'none'}`,
          ok ? '' : JSON.stringify(send.json).slice(0, 200),
          ok ? '' : 'Xem lỗi Zalo (quota/SĐT chưa follow/template data) và sửa payload',
        );
      }
    }
  }

  // ---------- 3. Webhook / Chat ----------
  const recentWh = await prisma.messagingWebhookEvent.count({
    where: {
      organizationId: orgId,
      channel: 'ZALO',
      receivedAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
    },
  });
  const convs = await prisma.chatbotConversation.findMany({
    where: { organizationId: orgId, channel: 'zalo', channelRef: oa.accountRef },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, externalUserId: true, visitorName: true, updatedAt: true },
  });
  const identities = await prisma.messagingContactIdentity.findMany({
    where: {
      organizationId: orgId,
      channel: 'ZALO',
      integrationScopeKey: { contains: oa.accountRef },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, externalUserId: true, followStatus: true, lastInboundAt: true },
  });

  // Public webhook health: unsigned probe still returns 200
  const whProbe = await fetch(`${API}/api/v1/webhooks/zalo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_name: 'user_send_text',
      oa_id: 'nonexistent-oa-e2e',
      timestamp: String(Date.now()),
      sender: { id: 'e2e-probe' },
      message: { text: 'probe', msg_id: `probe-${Date.now()}` },
    }),
  });
  const whBody = await whProbe.json().catch(() => ({}));
  const endpointOk = whProbe.status === 200 && whBody?.ok === true;

  const e2eUser = (process.env.ZALO_E2E_USER_ID || '').trim();
  let replyOk = false;
  let replyDetail = 'skipped_no_ZALO_E2E_USER_ID';
  if (e2eUser && oaLive) {
    const reply = await api(`/zalo/connections/${oa.id}/messages`, token, {
      method: 'POST',
      body: JSON.stringify({
        userId: e2eUser,
        text: `E2E reply ${new Date().toISOString()} — MarketingAutoAZ`,
      }),
    });
    const mid = reply.json?.messageId || reply.json?.message_id;
    replyOk = reply.status < 300 && Boolean(mid);
    replyDetail = `http=${reply.status} messageId=${mid ? '…' + String(mid).slice(-6) : 'none'} ${JSON.stringify(reply.json).slice(0, 120)}`;
  } else if (e2eUser && !oaLive) {
    replyDetail = 'live gate OFF — không gửi CS thật';
  }

  const inboundEvidence =
    recentWh > 0 ||
    convs.some((c) => c.updatedAt.getTime() > Date.now() - 7 * 24 * 3600_000) ||
    identities.some((i) => i.lastInboundAt && i.lastInboundAt.getTime() > Date.now() - 7 * 24 * 3600_000);

  const chatPass = endpointOk && inboundEvidence && (e2eUser ? replyOk : false);
  // Stricter: user asked real message + reply. Without inbound + reply = FAIL
  record(
    '3. Webhook/Chat',
    chatPass,
    `webhookEndpointOk=${endpointOk} wh7d=${recentWh} convs=${convs.length} identities=${identities.length} inboundEvidence=${inboundEvidence} reply=${replyDetail}`,
    chatPass
      ? ''
      : !inboundEvidence
        ? 'no_real_inbound_7d'
        : !e2eUser
          ? 'missing_ZALO_E2E_USER_ID'
          : !oaLive
            ? 'live_gate_off'
            : 'reply_failed',
    !inboundEvidence
      ? 'Nhắn 1 tin thật từ Zalo cá nhân vào OA; đảm bảo OA Secret Key đã lưu để verify signature'
      : !e2eUser
        ? 'Set ZALO_E2E_USER_ID=uid người vừa nhắn'
        : !oaLive
          ? `Thêm ${oa.accountRef} vào MESSAGING_LIVE_OA_IDS + restart`
          : 'Xem lỗi CS API (ngoài cửa sổ tư vấn / chưa follow)',
  );

  // ---------- 4. Broadcast OA ----------
  const following = await prisma.messagingContactIdentity.count({
    where: {
      organizationId: orgId,
      channel: 'ZALO',
      integrationScopeKey: { contains: oa.accountRef },
      followStatus: 'FOLLOWING',
      optedOut: false,
    },
  });

  if (!oaLive) {
    record(
      '4. Broadcast OA',
      false,
      `followers FOLLOWING=${following} — live gate OFF`,
      'live_gate_off',
      `Thêm ${oa.accountRef} vào MESSAGING_LIVE_OA_IDS + restart api/worker`,
    );
  } else if (following === 0 && !e2eUser) {
    record(
      '4. Broadcast OA',
      false,
      'không có follower/identity đủ điều kiện trong DB',
      'empty_audience',
      'Import audience hoặc có user follow OA + webhook follow event; hoặc set ZALO_E2E_USER_ID',
    );
  } else {
    // Create tiny draft campaign targeting FOLLOWING
    const created = await api('/zalo-marketing/campaigns', token, {
      method: 'POST',
      body: JSON.stringify({
        name: `E2E Broadcast ${Date.now()}`,
        campaignType: 'BROADCAST',
        channelConnectionId: oa.id,
        variables: { body: `E2E broadcast test ${new Date().toISOString()}` },
        segmentConfig: {
          followStatuses: ['FOLLOWING'],
          requireOptIn: false,
          excludeSuppressed: true,
          ...(e2eUser
            ? {}
            : {}),
        },
      }),
    });
    const campaignId = created.json?.id;
    if (!campaignId) {
      record(
        '4. Broadcast OA',
        false,
        `createHttp=${created.status}`,
        JSON.stringify(created.json).slice(0, 180),
        'Sửa payload campaign / quyền automation.campaign',
      );
    } else {
      // If we have a specific user, import/limit via preview then start only if audience tiny
      const preview = await api(`/zalo-marketing/campaigns/${campaignId}/preview-eligibility`, token, {
        method: 'POST',
        body: JSON.stringify({ limit: 5 }),
      });
      const eligible =
        preview.json?.eligibleCount ??
        preview.json?.eligible ??
        preview.json?.summary?.eligible ??
        null;

      // Safety: do not start mass broadcast if eligible > 3 without explicit allow
      const allowMass = process.env.ZALO_E2E_ALLOW_BROADCAST === '1';
      if (eligible != null && eligible > 3 && !allowMass) {
        record(
          '4. Broadcast OA',
          false,
          `campaign=${campaignId.slice(0, 8)}… eligible=${eligible} — chặn gửi hàng loạt`,
          'audience_too_large_without_allow',
          'Set ZALO_E2E_ALLOW_BROADCAST=1 để gửi, hoặc thu hẹp segment / import 1 UID',
        );
        await api(`/zalo-marketing/campaigns/${campaignId}`, token, { method: 'DELETE' }).catch(() => null);
      } else {
        const start = await api(`/zalo-marketing/campaigns/${campaignId}/start`, token, {
          method: 'POST',
          body: '{}',
        });
        // Wait for worker
        let dash = null;
        for (let i = 0; i < 12; i++) {
          await sleep(2500);
          const d = await api(`/zalo-marketing/campaigns/${campaignId}/dashboard`, token);
          dash = d.json;
          const sent = dash?.sentCount ?? dash?.campaign?.sentCount ?? 0;
          const failed = dash?.failedCount ?? dash?.campaign?.failedCount ?? 0;
          const status = dash?.status ?? dash?.campaign?.status;
          if (['COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED'].includes(status) || sent + failed > 0) break;
        }
        const sent = dash?.sentCount ?? dash?.campaign?.sentCount ?? 0;
        const failed = dash?.failedCount ?? dash?.campaign?.failedCount ?? 0;
        const queued = dash?.queuedCount ?? dash?.campaign?.queuedCount ?? 0;
        const status = dash?.status ?? dash?.campaign?.status;
        const recipients = await prisma.messagingCampaignRecipient.findMany({
          where: { campaignId },
          take: 5,
          select: { status: true, providerMessageId: true, lastError: true },
        });
        const hasRealMid = recipients.some(
          (r) => r.providerMessageId && !String(r.providerMessageId).startsWith('dryrun:'),
        );
        const ok = start.status < 300 && sent > 0 && hasRealMid;
        record(
          '4. Broadcast OA',
          ok,
          `campaign=${campaignId.slice(0, 8)}… startHttp=${start.status} status=${status} queued=${queued} sent=${sent} failed=${failed} realMid=${hasRealMid} errSample=${recipients.find((r) => r.lastError)?.lastError || ''}`,
          ok ? '' : JSON.stringify({ start: start.json, dash }).slice(0, 200),
          ok ? '' : 'Kiểm tra follower/consult policy + live gate + lỗi recipient',
        );
      }
    }
  }

  // ---------- 5. Reports ----------
  const reports = await api('/zalo-marketing/reports', token);
  const reportItems = Array.isArray(reports.json)
    ? reports.json
    : reports.json?.campaigns || reports.json?.items || [];
  const overview = await api('/zalo-marketing/overview', token);
  const hasReportData =
    reports.status < 300 &&
    (reportItems.some((c) => (c.sentCount || 0) + (c.failedCount || 0) + (c.queuedCount || 0) > 0) ||
      (overview.json?.campaignsCompleted || 0) > 0 ||
      (overview.json?.campaignsRunning || 0) > 0);

  // Prefer evidence from campaigns we just touched
  const recentCamp = await prisma.messagingCampaign.findFirst({
    where: { organizationId: orgId, channel: 'ZALO', name: { startsWith: 'E2E Broadcast' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      queuedCount: true,
      sentCount: true,
      deliveredCount: true,
      failedCount: true,
      startedAt: true,
      channelConnectionId: true,
    },
  });

  const reportPass =
    reports.status < 300 &&
    Boolean(recentCamp) &&
    ((recentCamp.sentCount || 0) + (recentCamp.failedCount || 0) + (recentCamp.queuedCount || 0) > 0);

  record(
    '5. Báo cáo',
    reportPass,
    `reportsHttp=${reports.status} items=${reportItems.length} e2eCampaign=${recentCamp ? `${recentCamp.name} q=${recentCamp.queuedCount} s=${recentCamp.sentCount} d=${recentCamp.deliveredCount} f=${recentCamp.failedCount}` : 'none'} overviewKeys=${Object.keys(overview.json || {}).join(',')}`,
    reportPass ? '' : hasReportData ? 'e2e_campaign_metrics_empty' : 'no_report_data',
    reportPass
      ? ''
      : 'Chạy thành công mục 2 hoặc 4 trước; metrics lấy từ MessagingCampaign aggregates',
  );

  printSummary();
  await prisma.$disconnect();
  const failed = rows.filter((r) => r.result === 'FAIL' && !r.category.startsWith('0.')).length;
  // Core 5 categories
  const core = rows.filter((r) => /^[1-5]\./.test(r.category));
  const coreFail = core.filter((r) => r.result === 'FAIL').length;
  process.exit(coreFail ? 1 : 0);
}

function printSummary() {
  console.log('\n=== ZALO MARKETING E2E TABLE ===');
  console.log('Hạng mục | PASS/FAIL | Bằng chứng | Lỗi | Cách sửa');
  console.log('---|---|---|---|---');
  for (const r of rows) {
    console.log(
      `${r.category} | ${r.result} | ${r.evidence.replace(/\|/g, '/')} | ${r.error.replace(/\|/g, '/')} | ${r.fix.replace(/\|/g, '/')}`,
    );
  }
  const core = rows.filter((r) => /^[1-5]\./.test(r.category));
  const coreFail = core.filter((r) => r.result === 'FAIL').length;
  console.log(coreFail === 0 ? '\nZALO MARKETING E2E: PASS' : '\nZALO MARKETING E2E: FAIL');
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  console.log('\nZALO MARKETING E2E: FAIL');
  process.exit(1);
});
