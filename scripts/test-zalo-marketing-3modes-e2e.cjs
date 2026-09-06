/**
 * Zalo Marketing 3-mode E2E (Digi OA) — no fake SENT.
 * Run: node scripts/with-root-env.cjs node scripts/test-zalo-marketing-3modes-e2e.cjs
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');
const {
  evaluateMessagingEligibility,
  sendZaloOaHttp,
  sendZaloBroadcastHttp,
} = require('../packages/shared/dist');

const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const DIGI_ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const DIGI_OA = '526368405518511676';
const OTHER_ORG = '17bcecd3-3333-4fed-a41f-1623d542fdef';

const verdict = {
  BROADCAST: 'FAIL',
  CONSULT: 'FAIL',
  ZBS: 'FAIL',
  ELIGIBILITY: 'FAIL',
  SCHEDULE_QUEUE: 'FAIL',
  WEBHOOK_STATUS: 'FAIL',
  MULTI_TENANT: 'FAIL',
};

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
  console.log('=== Zalo Marketing 3-mode E2E (Digi) ===');

  // --- ELIGIBILITY unit ---
  const eBroadcastOk = evaluateMessagingEligibility({
    organizationId: DIGI_ORG,
    channel: 'ZALO',
    campaignType: 'broadcast',
    identity: {
      externalUserId: 'u1',
      followStatus: 'FOLLOWING',
      consentStatus: 'OPTED_IN',
    },
    connection: { status: 'ACTIVE', isPaused: false },
  });
  const eBroadcastBad = evaluateMessagingEligibility({
    organizationId: DIGI_ORG,
    channel: 'ZALO',
    campaignType: 'broadcast',
    identity: {
      externalUserId: 'u2',
      followStatus: 'UNKNOWN',
      consentStatus: 'OPTED_IN',
    },
    connection: { status: 'ACTIVE', isPaused: false },
  });
  const eConsultOk = evaluateMessagingEligibility({
    organizationId: DIGI_ORG,
    channel: 'ZALO',
    campaignType: 'transactional',
    identity: {
      externalUserId: 'u3',
      followStatus: 'FOLLOWING',
      consentStatus: 'OPTED_IN',
      lastInboundAt: new Date(),
    },
    connection: { status: 'ACTIVE', isPaused: false },
  });
  const eConsultOut = evaluateMessagingEligibility({
    organizationId: DIGI_ORG,
    channel: 'ZALO',
    campaignType: 'transactional',
    identity: {
      externalUserId: 'u4',
      followStatus: 'FOLLOWING',
      consentStatus: 'OPTED_IN',
      lastInboundAt: new Date(Date.now() - 72 * 3600 * 1000),
    },
    connection: { status: 'ACTIVE', isPaused: false },
  });
  if (
    eBroadcastOk.eligible &&
    !eBroadcastBad.eligible &&
    eConsultOk.eligible &&
    !eConsultOut.eligible &&
    eBroadcastOk.providerMode === 'ZALO_OA_BROADCAST' &&
    eConsultOk.providerMode === 'ZALO_OA_CONSULT'
  ) {
    verdict.ELIGIBILITY = 'PASS';
    console.log('PASS ELIGIBILITY (broadcast FOLLOWING-only + consult 48h)');
  } else {
    console.log('FAIL ELIGIBILITY', { eBroadcastOk, eBroadcastBad, eConsultOk, eConsultOut });
  }

  const SUPER_EMAIL = process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com';
  let user = await prisma.user.findFirst({
    where: { organizationId: DIGI_ORG, deletedAt: null, isActive: true },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    user = await prisma.user.findFirst({
      where: { email: SUPER_EMAIL, deletedAt: null },
      include: { role: true },
    });
  }
  if (!user) throw new Error('No Digi admin user');
  const roleName = user.role?.name || 'OWNER';
  const token = mint({
    id: user.id,
    email: user.email,
    organizationId: DIGI_ORG,
    role: roleName,
  });

  const oa = await prisma.messagingChannelConnection.findFirst({
    where: {
      organizationId: DIGI_ORG,
      accountRef: DIGI_OA,
      providerKind: 'ZALO_OA',
      status: 'ACTIVE',
    },
  });
  if (!oa) throw new Error('Digi OA missing');

  // --- MULTI-TENANT ---
  const otherUser = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      organizationId: { not: DIGI_ORG },
    },
    include: { role: true },
  });
  if (otherUser) {
    const otherToken = mint({
      id: otherUser.id,
      email: otherUser.email,
      organizationId: otherUser.organizationId,
      role: otherUser.role?.name || 'OWNER',
    });
    const cross = await api(`/zalo-marketing/campaigns`, otherToken, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cross tenant should fail',
        campaignType: 'BROADCAST',
        channelConnectionId: oa.id,
        variables: { body: 'x' },
      }),
    });
    const listOther = await api('/zalo-marketing/oa', otherToken);
    const seesDigi = Array.isArray(listOther.json)
      ? listOther.json.some((c) => c.accountRef === DIGI_OA)
      : false;
    if ((cross.status === 404 || cross.status === 403 || cross.status === 400) && !seesDigi) {
      verdict.MULTI_TENANT = 'PASS';
      console.log(
        'PASS MULTI_TENANT (Digi OA hidden from other org; create rejected)',
        otherUser.organizationId.slice(0, 8),
      );
    } else {
      console.log('FAIL MULTI_TENANT', cross.status, seesDigi, cross.json);
    }
  } else {
    console.log('FAIL MULTI_TENANT (no other org user)');
  }

  // --- Preview audience / create BROADCAST ---
  const previewBc = await api('/zalo-marketing/audience/preview', token, {
    method: 'POST',
    body: JSON.stringify({
      channelConnectionId: oa.id,
      campaignType: 'BROADCAST',
      segmentConfig: { followStatuses: ['FOLLOWING'], excludeSuppressed: true },
    }),
  });
  const bcCreate = await api('/zalo-marketing/campaigns', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E Broadcast ${Date.now()}`,
      campaignType: 'BROADCAST',
      channelConnectionId: oa.id,
      segmentConfig: { followStatuses: ['FOLLOWING'], excludeSuppressed: true },
      variables: { body: 'E2E Broadcast Digi — không fake SENT' },
    }),
  });
  const broadcastCreated =
    bcCreate.status < 300 && bcCreate.json?.id && bcCreate.json?.campaignType === 'BROADCAST';
  const broadcastPreviewOk =
    previewBc.status < 300 &&
    previewBc.json?.conditions &&
    typeof previewBc.json?.eligible === 'number';

  // Live probe promotion API only if we have a FOLLOWING identity
  const follower = await prisma.messagingContactIdentity.findFirst({
    where: {
      organizationId: DIGI_ORG,
      channel: 'ZALO',
      followStatus: 'FOLLOWING',
      isBlocked: false,
      optedOut: false,
    },
    orderBy: { updatedAt: 'desc' },
  });

  let broadcastSendEvidence = 'no_follower_identity';
  if (follower && broadcastCreated) {
    // schedule + start to exercise queue (eligibility may skip all)
    const schedAt = new Date(Date.now() + 60_000).toISOString();
    const sched = await api(`/zalo-marketing/campaigns/${bcCreate.json.id}/schedule`, token, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt: schedAt }),
    });
    if (sched.status < 300) {
      verdict.SCHEDULE_QUEUE = 'PASS';
      console.log('PASS SCHEDULE/QUEUE (schedule API accepted)');
    } else {
      // try start instead
      const start = await api(`/zalo-marketing/campaigns/${bcCreate.json.id}/start`, token, {
        method: 'POST',
        body: '{}',
      });
      if (start.status < 300) {
        verdict.SCHEDULE_QUEUE = 'PASS';
        console.log('PASS SCHEDULE/QUEUE (start → plan/dispatch)');
        await sleep(4000);
      } else {
        console.log('FAIL SCHEDULE/QUEUE', sched.status, start.status, start.json);
      }
    }

    // Direct HTTP promotion (honest — may fail -224)
    const { parseConnectionCredentials } = require('../apps/worker/dist/lib/encryption');
    let accessToken = '';
    try {
      const creds = parseConnectionCredentials(oa.encryptedCredentials);
      accessToken = creds.accessToken || creds.oaAccessToken || '';
    } catch {
      accessToken = '';
    }
    if (accessToken) {
      const promo = await sendZaloBroadcastHttp({
        accessToken,
        recipientId: follower.externalUserId,
        text: `E2E promo ${Date.now()}`,
      });
      broadcastSendEvidence = promo.success
        ? `sent messageId=${promo.messageId}`
        : `provider_reject: ${promo.message}`;
      if (promo.success) verdict.BROADCAST = 'PASS';
      else if (/ -224|upgrade OA Tier|gói Zalo/i.test(promo.message || '')) {
        // Code path correct; OA package blocks — mark FAIL with clear reason
        verdict.BROADCAST = 'FAIL';
        console.log('FAIL BROADCAST live send (OA tier/package):', promo.message);
      } else {
        console.log('FAIL BROADCAST live send:', promo.message);
      }
    }
  } else if (broadcastCreated && broadcastPreviewOk) {
    // Pipeline OK but cannot prove live send
    verdict.BROADCAST = 'FAIL';
    broadcastSendEvidence = 'campaign_created_but_no_following_identity_for_live_send';
    console.log('FAIL BROADCAST (UI/API OK, thiếu follower FOLLOWING để gửi thật)');
    // Still exercise schedule on empty audience campaign
    const start = await api(`/zalo-marketing/campaigns/${bcCreate.json.id}/start`, token, {
      method: 'POST',
      body: '{}',
    });
    if (start.status < 300) {
      verdict.SCHEDULE_QUEUE = 'PASS';
      console.log('PASS SCHEDULE/QUEUE (start accepted)');
    }
  }
  console.log('BROADCAST evidence:', broadcastSendEvidence, 'preview', previewBc.status);

  if (broadcastCreated && broadcastPreviewOk && verdict.BROADCAST === 'FAIL' && /sent messageId=/.test(broadcastSendEvidence)) {
    verdict.BROADCAST = 'PASS';
  }
  // If code path + create + eligibility mode wiring works and only ops blocks, still FAIL honestly
  if (broadcastCreated && broadcastPreviewOk) {
    console.log('Broadcast campaign create+preview OK');
  }

  // --- CONSULT (TRANSACTIONAL) ---
  const consultCreate = await api('/zalo-marketing/campaigns', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E Tư vấn ${Date.now()}`,
      campaignType: 'TRANSACTIONAL',
      channelConnectionId: oa.id,
      segmentConfig: { requireOptIn: true, excludeSuppressed: true },
      variables: { body: 'E2E tin tư vấn Digi' },
    }),
  });
  const consultPreview = await api('/zalo-marketing/audience/preview', token, {
    method: 'POST',
    body: JSON.stringify({
      channelConnectionId: oa.id,
      campaignType: 'TRANSACTIONAL',
      segmentConfig: { requireOptIn: true, excludeSuppressed: true },
    }),
  });

  const consultIdentity = await prisma.messagingContactIdentity.findFirst({
    where: {
      organizationId: DIGI_ORG,
      channel: 'ZALO',
      lastInboundAt: { gte: new Date(Date.now() - 48 * 3600 * 1000) },
      optedOut: false,
      isBlocked: false,
    },
  });

  if (consultCreate.status < 300 && consultCreate.json?.campaignType === 'TRANSACTIONAL') {
    console.log('Consult campaign created');
    if (consultIdentity) {
      try {
        const { parseConnectionCredentials } = require('../apps/worker/dist/lib/encryption');
        const creds = parseConnectionCredentials(oa.encryptedCredentials);
        const cs = await sendZaloOaHttp({
          accessToken: creds.accessToken || creds.oaAccessToken || '',
          recipientId: consultIdentity.externalUserId,
          text: `E2E CS ${Date.now()}`,
        });
        if (cs.success) {
          verdict.CONSULT = 'PASS';
          console.log('PASS TƯ VẤN live CS', cs.messageId);
        } else {
          console.log('FAIL TƯ VẤN live CS', cs.message);
        }
      } catch (e) {
        console.log('FAIL TƯ VẤN', e.message);
      }
    } else {
      console.log('FAIL TƯ VẤN (no identity in 48h window)');
    }
  } else {
    console.log('FAIL TƯ VẤN create', consultCreate.status, consultCreate.json);
  }
  void consultPreview;

  // --- ZBS ---
  const zbs = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: DIGI_ORG, providerKind: 'ZBS_TEMPLATE', status: 'ACTIVE' },
  });
  const templates = await api(
    `/zalo-marketing/templates${zbs ? `?connectionId=${zbs.id}` : ''}`,
    token,
  );
  if (!zbs) {
    console.log('FAIL ZBS (Digi chưa kết nối ZBS_TEMPLATE)');
  } else if (templates.status < 300) {
    const approved = (templates.json || []).find(
      (t) => t.approvalStatus === 'APPROVED' || t.isActive,
    );
    if (!approved) {
      console.log('FAIL ZBS (có kết nối nhưng chưa có template duyệt)');
    } else {
      const zbsCamp = await api('/zalo-marketing/campaigns', token, {
        method: 'POST',
        body: JSON.stringify({
          name: `E2E ZBS ${Date.now()}`,
          campaignType: 'TEMPLATE',
          channelConnectionId: oa.id,
          zbsConnectionId: zbs.id,
          messageTemplateId: approved.id,
          segmentConfig: { excludeSuppressed: true },
          variables: { name: 'Test', phone: '0900000000' },
        }),
      });
      if (zbsCamp.status < 300) {
        const phone = process.env.ZALO_E2E_PHONE;
        const uid = process.env.ZALO_E2E_USER_ID || follower?.externalUserId;
        const test = await api('/zalo-marketing/test/zbs', token, {
          method: 'POST',
          body: JSON.stringify({
            connectionId: zbs.id,
            templateId: approved.providerTemplateId || approved.id,
            phone: phone || undefined,
            userId: phone ? undefined : uid,
            templateData: { name: 'E2E' },
          }),
        });
        if (test.status < 300 && test.json?.success) {
          verdict.ZBS = 'PASS';
          console.log('PASS ZBS live send');
        } else {
          console.log('FAIL ZBS send', test.status, test.json);
          // create path OK but send failed
        }
      } else {
        console.log('FAIL ZBS create', zbsCamp.status, zbsCamp.json);
      }
    }
  } else {
    console.log('FAIL ZBS templates list', templates.status);
  }

  // --- WEBHOOK STATUS ---
  const events7d = await prisma.messagingWebhookEvent.count({
    where: {
      organizationId: DIGI_ORG,
      receivedAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    },
  });
  const deliveredOrRead = await prisma.messagingCampaignRecipient.count({
    where: {
      organizationId: DIGI_ORG,
      OR: [{ deliveredAt: { not: null } }, { readAt: { not: null } }],
      updatedAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    },
  });
  const webhookProbe = await fetch(`${API}/api/v1/webhooks/zalo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: 'user_send_text', message: { text: 'probe' } }),
  });
  // Endpoint exists; real DELIVERED/SEEN needs OA traffic
  if (webhookProbe.status < 500 && (events7d > 0 || deliveredOrRead > 0)) {
    verdict.WEBHOOK_STATUS = 'PASS';
    console.log('PASS WEBHOOK STATUS', { events7d, deliveredOrRead });
  } else if (webhookProbe.status < 500) {
    console.log('FAIL WEBHOOK STATUS (endpoint OK, no real delivered/seen in 7d)', {
      events7d,
      deliveredOrRead,
      http: webhookProbe.status,
    });
  } else {
    console.log('FAIL WEBHOOK STATUS endpoint', webhookProbe.status);
  }

  // If schedule wasn't set earlier, try schedule on consult draft
  if (verdict.SCHEDULE_QUEUE !== 'PASS' && consultCreate.json?.id) {
    const sched = await api(`/zalo-marketing/campaigns/${consultCreate.json.id}/schedule`, token, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt: new Date(Date.now() + 120_000).toISOString() }),
    });
    if (sched.status < 300) {
      verdict.SCHEDULE_QUEUE = 'PASS';
      console.log('PASS SCHEDULE/QUEUE (consult schedule)');
    }
  }

  const ready =
    verdict.BROADCAST === 'PASS' &&
    verdict.CONSULT === 'PASS' &&
    verdict.ZBS === 'PASS' &&
    verdict.ELIGIBILITY === 'PASS' &&
    verdict.SCHEDULE_QUEUE === 'PASS' &&
    verdict.WEBHOOK_STATUS === 'PASS' &&
    verdict.MULTI_TENANT === 'PASS';

  console.log('\n======== REPORT ========');
  console.log(`BROADCAST: ${verdict.BROADCAST}`);
  console.log(`TƯ VẤN: ${verdict.CONSULT}`);
  console.log(`ZBS: ${verdict.ZBS}`);
  console.log(`ELIGIBILITY: ${verdict.ELIGIBILITY}`);
  console.log(`SCHEDULE/QUEUE: ${verdict.SCHEDULE_QUEUE}`);
  console.log(`WEBHOOK STATUS: ${verdict.WEBHOOK_STATUS}`);
  console.log(`MULTI-TENANT: ${verdict.MULTI_TENANT}`);
  console.log(`ZALO MARKETING READY: ${ready ? 'YES' : 'NO'}`);
  console.log('========================\n');

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
