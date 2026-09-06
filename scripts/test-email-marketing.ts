/**
 * Email Marketing smoke test (org-scoped, no mocked PASS).
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-email-marketing.ts
 */
import {
  buildSignedSnsEnvelope,
  buildSnsTestHmac,
} from '../packages/shared/dist/sns-test-signing';

type Case = { name: string; ok: boolean; detail?: string };

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);
const SNS_TOPIC = (process.env.SES_SNS_TOPIC_ARN || '').trim();
const SNS_TEST_KEY = (process.env.SES_SNS_WEBHOOK_TEST_SIGNING_KEY || 'p0-local-test-signing-key').trim();

function signedSnsNotification(inner: Record<string, unknown>, topicArn = SNS_TOPIC) {
  return buildSignedSnsEnvelope({
    Type: 'Notification',
    MessageId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    TopicArn: topicArn,
    Timestamp: new Date().toISOString(),
    Message: JSON.stringify(inner),
  });
}

async function postSes(inner: Record<string, unknown>, topicArn = SNS_TOPIC) {
  const envelope = signedSnsNotification(inner, topicArn);
  const raw = JSON.stringify(envelope);
  const res = await fetch(`${API}/api/v1/email-marketing/public/ses-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SNS-Test-Signature': buildSnsTestHmac(raw, SNS_TEST_KEY),
    },
    body: raw,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function okStatus(s: number) {
  return s === 200 || s === 201;
}

function print(results: Case[]) {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

async function main() {
  const results: Case[] = [];
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  if (!email || !password) {
    results.push({ name: 'live_skip', ok: false, detail: 'missing META_REVIEWER credentials' });
    print(results);
    process.exit(1);
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = login.json?.accessToken as string | undefined;
  results.push({ name: 'login', ok: okStatus(login.status) && !!token, detail: `status=${login.status}` });
  if (!token) {
    print(results);
    process.exit(1);
  }

  const me = await api('/auth/me', token);
  const orgId = me.json?.organizationId as string | undefined;
  results.push({ name: 'tenant_org', ok: !!orgId, detail: orgId });

  const overview = await api('/email-marketing/overview', token);
  results.push({
    name: 'overview',
    ok: okStatus(overview.status) && typeof overview.json?.contacts === 'number',
    detail: `status=${overview.status} contacts=${overview.json?.contacts}`,
  });

  const health = await api('/health');
  const ep = health.json?.emailProvider as {
    resolved?: string;
    configured?: boolean;
    eventLoopConfigured?: boolean;
    eventLoopMissingEnv?: string[];
  } | undefined;
  results.push({
    name: 'health_email_provider',
    ok:
      health.status === 200 &&
      ep?.resolved === 'ses' &&
      typeof ep?.configured === 'boolean' &&
      typeof ep?.eventLoopConfigured === 'boolean',
    detail: `resolved=${ep?.resolved} configured=${ep?.configured} eventLoop=${ep?.eventLoopConfigured}`,
  });

  const stamp = Date.now();
  const contactEmail = `em-test-${stamp}@example.com`;
  const contact = await api('/email-marketing/contacts', token, {
    method: 'POST',
    body: JSON.stringify({
      email: contactEmail,
      name: 'Email Test Contact',
      phone: '0901111222',
      source: 'Test',
      tags: ['VIP', 'spa'],
    }),
  });
  const contactId = contact.json?.id as string | undefined;
  results.push({
    name: 'create_contact',
    ok:
      okStatus(contact.status) &&
      !!contactId &&
      contact.json?.organizationId === orgId &&
      Array.isArray(contact.json?.tags) &&
      contact.json.tags.includes('VIP'),
    detail: `status=${contact.status} id=${contactId} tags=${JSON.stringify(contact.json?.tags)}`,
  });

  const template = await api('/email-marketing/templates', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Mẫu test ${stamp}`,
      subject: 'Xin chào {{name}}',
      htmlBody: '<p>Hi {{name}}</p>',
    }),
  });
  const templateId = template.json?.id as string | undefined;
  results.push({
    name: 'create_template',
    ok: okStatus(template.status) && !!templateId && template.json?.organizationId === orgId,
    detail: `status=${template.status}`,
  });

  const generated = await api('/email-marketing/generate', token, {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Ưu đãi 30% liệu trình giảm béo tuần này, kêu gọi đặt lịch.',
    }),
  });
  results.push({
    name: 'generate_email_content',
    ok:
      okStatus(generated.status) &&
      typeof generated.json?.subject === 'string' &&
      generated.json.subject.length > 0 &&
      typeof generated.json?.previewText === 'string' &&
      typeof generated.json?.heading === 'string' &&
      typeof generated.json?.body === 'string' &&
      typeof generated.json?.ctaLabel === 'string',
    detail: `status=${generated.status} subject=${generated.json?.subject || generated.json?.message || ''}`,
  });

  const badTest = await api('/email-marketing/send-test', token, {
    method: 'POST',
    body: JSON.stringify({ to: 'not-an-email', subject: 'Hi', htmlBody: '<p>Hi {{firstName}}</p>' }),
  });
  results.push({
    name: 'send_test_invalid_email',
    ok: badTest.status === 400,
    detail: `status=${badTest.status}`,
  });

  const sesSend = await postSes({ eventType: 'Send', mail: { messageId: 'unknown-test-id' } });
  results.push({
    name: 'ses_webhook_send_unknown',
    ok: sesSend.status === 200 && sesSend.json?.ok === true && sesSend.json?.type === 'send' && sesSend.json?.updated === 0,
    detail: `status=${sesSend.status} type=${sesSend.json?.type} updated=${sesSend.json?.updated}`,
  });

  const sesDelivery = await postSes({
    eventType: 'Delivery',
    mail: { messageId: 'missing-test-id' },
  });
  results.push({
    name: 'ses_webhook_delivery_unknown',
    ok: sesDelivery.status === 200 && sesDelivery.json?.ok === true && sesDelivery.json?.updated === 0,
    detail: `status=${sesDelivery.status} updated=${sesDelivery.json?.updated}`,
  });

  const sesBadSubRaw = JSON.stringify(
    buildSignedSnsEnvelope({
      Type: 'SubscriptionConfirmation',
      MessageId: `sub-bad-${Date.now()}`,
      TopicArn: SNS_TOPIC,
      Timestamp: new Date().toISOString(),
      Token: 'test-token',
      SubscribeURL: 'http://127.0.0.1/evil',
      Message: 'confirm',
    }),
  );
  const sesBadSub = await fetch(`${API}/api/v1/email-marketing/public/ses-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SNS-Test-Signature': buildSnsTestHmac(sesBadSubRaw, SNS_TEST_KEY),
    },
    body: sesBadSubRaw,
  });
  const sesBadSubJson = await sesBadSub.json().catch(() => ({}));
  results.push({
    name: 'ses_webhook_rejects_bad_subscribe_url',
    ok: sesBadSub.status === 403 && sesBadSubJson?.ok === false,
    detail: `status=${sesBadSub.status} reason=${sesBadSubJson?.reason || ''}`,
  });

  const testDoc = await api('/email-marketing/templates', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Editor ${stamp}`,
      subject: 'Chào {{firstName}}',
      previewText: 'Ưu đãi cho {{company}}',
      htmlBody: '<!--EMAIL_EDITOR_V1:%7B%22v%22%3A1%2C%22blocks%22%3A%5B%5D%7D--><p>Hi {{firstName}} {{email}} {{company}}</p>',
    }),
  });
  const editorTemplateId = testDoc.json?.id as string | undefined;
  results.push({
    name: 'create_template_merge_tags',
    ok:
      okStatus(testDoc.status) &&
      typeof testDoc.json?.htmlBody === 'string' &&
      testDoc.json.htmlBody.includes('{{firstName}}'),
    detail: `status=${testDoc.status}`,
  });

  const list = await api('/email-marketing/lists', token, {
    method: 'POST',
    body: JSON.stringify({ name: `List test ${stamp}` }),
  });
  const listId = list.json?.id as string | undefined;
  results.push({
    name: 'create_list',
    ok: okStatus(list.status) && !!listId && list.json?.organizationId === orgId,
    detail: `status=${list.status}`,
  });

  if (listId && contactEmail) {
    const member = await api(`/email-marketing/lists/${listId}/members`, token, {
      method: 'POST',
      body: JSON.stringify({ email: contactEmail }),
    });
    results.push({
      name: 'add_list_member',
      ok: okStatus(member.status) && member.json?.organizationId === orgId,
      detail: `status=${member.status}`,
    });
  } else {
    results.push({ name: 'add_list_member', ok: false, detail: 'missing list/contact' });
  }

  const previewAll = await api('/email-marketing/audience-preview', token);
  results.push({
    name: 'audience_preview_all',
    ok: okStatus(previewAll.status) && typeof previewAll.json?.eligible === 'number' && previewAll.json.eligible >= 1,
    detail: `status=${previewAll.status} eligible=${previewAll.json?.eligible}`,
  });

  const previewList = await api(
    `/email-marketing/audience-preview${listId ? `?listId=${listId}` : ''}`,
    token,
  );
  results.push({
    name: 'audience_preview_list',
    ok: okStatus(previewList.status) && previewList.json?.eligible >= 1,
    detail: `status=${previewList.status} eligible=${previewList.json?.eligible}`,
  });

  const domainName = `spa-${stamp}.example.com`;
  const badDomain = await api('/email-marketing/domains', token, {
    method: 'POST',
    body: JSON.stringify({
      domain: domainName,
      fromName: 'Spa Test',
      fromEmail: 'hello@gmail.com',
    }),
  });
  results.push({
    name: 'domain_from_email_must_match',
    ok: badDomain.status === 400,
    detail: `status=${badDomain.status}`,
  });

  const createdDomain = await api('/email-marketing/domains', token, {
    method: 'POST',
    body: JSON.stringify({
      domain: `https://www.${domainName}/`,
      fromName: 'Spa Test',
      fromEmail: `hello@${domainName}`,
      replyTo: `cskh@${domainName}`,
    }),
  });
  const domainId = createdDomain.json?.id as string | undefined;
  const dnsRecords =
    (createdDomain.json?.dnsRecords as Array<{ purpose: string; type: string; host: string; value: string }> | undefined) ??
    [];
  results.push({
    name: 'create_sender_domain',
    ok:
      okStatus(createdDomain.status) &&
      createdDomain.json?.domain === domainName &&
      createdDomain.json?.fromName === 'Spa Test' &&
      createdDomain.json?.fromEmail === `hello@${domainName}` &&
      createdDomain.json?.replyTo === `cskh@${domainName}` &&
      createdDomain.json?.domainVerified === false &&
      dnsRecords.some((r) => r.purpose === 'SPF' && r.value.includes('amazonses.com')) &&
      dnsRecords.some((r) => r.purpose === 'DMARC' && r.host === '_dmarc'),
    detail: `status=${createdDomain.status} domain=${createdDomain.json?.domain} records=${dnsRecords.length}`,
  });

  const dupDomain = await api('/email-marketing/domains', token, {
    method: 'POST',
    body: JSON.stringify({
      domain: domainName,
      fromName: 'Spa Test',
      fromEmail: `hello@${domainName}`,
    }),
  });
  results.push({
    name: 'domain_duplicate_rejected',
    ok: dupDomain.status === 400,
    detail: `status=${dupDomain.status}`,
  });

  const checkedDomain = await api(`/email-marketing/domains/${domainId}/check`, token, { method: 'POST' });
  results.push({
    name: 'domain_auto_check',
    ok:
      okStatus(checkedDomain.status) &&
      checkedDomain.json?.dkimVerified === false &&
      checkedDomain.json?.spfVerified === false &&
      checkedDomain.json?.dmarcVerified === false &&
      checkedDomain.json?.domainVerified === false &&
      typeof checkedDomain.json?.lastCheckedAt === 'string',
    detail: `status=${checkedDomain.status} dkim=${checkedDomain.json?.dkimVerified} spf=${checkedDomain.json?.spfVerified} dmarc=${checkedDomain.json?.dmarcVerified} verified=${checkedDomain.json?.domainVerified}`,
  });

  const patchedDomain = await api(`/email-marketing/domains/${domainId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fromName: 'Spa Hoa Sen', fromEmail: `noreply@${domainName}` }),
  });
  results.push({
    name: 'domain_update_from',
    ok:
      okStatus(patchedDomain.status) &&
      patchedDomain.json?.fromName === 'Spa Hoa Sen' &&
      patchedDomain.json?.fromEmail === `noreply@${domainName}`,
    detail: `status=${patchedDomain.status} from=${patchedDomain.json?.fromEmail}`,
  });

  const listedDomains = await api('/email-marketing/domains', token);
  results.push({
    name: 'list_sender_domains',
    ok:
      okStatus(listedDomains.status) &&
      Array.isArray(listedDomains.json) &&
      (listedDomains.json as Array<{ id: string }>).some((d) => d.id === domainId),
    detail: `status=${listedDomains.status} n=${Array.isArray(listedDomains.json) ? listedDomains.json.length : 0}`,
  });

  const campaign = await api('/email-marketing/campaigns', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Campaign test ${stamp}`,
      templateId,
      listId,
    }),
  });
  const campaignId = campaign.json?.id as string | undefined;
  results.push({
    name: 'create_campaign',
    ok: okStatus(campaign.status) && !!campaignId && campaign.json?.organizationId === orgId,
    detail: `status=${campaign.status} campaignStatus=${campaign.json?.status}`,
  });

  async function postSesEvent(inner: Record<string, unknown>) {
    return postSes(inner);
  }

  const sesOpen = await postSesEvent({
    eventType: 'Open',
    mail: { messageId: `open-${stamp}`, tags: { campaignId: [campaignId || 'missing'] } },
  });
  results.push({
    name: 'ses_webhook_open',
    ok: sesOpen.status === 200 && sesOpen.json?.ok === true && sesOpen.json?.type === 'open',
    detail: `status=${sesOpen.status} type=${sesOpen.json?.type} updated=${sesOpen.json?.updated}`,
  });

  const sesClick = await postSesEvent({
    eventType: 'Click',
    mail: { messageId: `click-${stamp}`, tags: { campaignId: [campaignId || 'missing'] } },
    click: { link: 'https://marketingautoaz.com' },
  });
  results.push({
    name: 'ses_webhook_click',
    ok: sesClick.status === 200 && sesClick.json?.ok === true && sesClick.json?.type === 'click',
    detail: `status=${sesClick.status} type=${sesClick.json?.type}`,
  });

  const bounce = await postSesEvent({
    eventType: 'Bounce',
    mail: {
      messageId: `bounce-${stamp}`,
      destination: [contactEmail],
      tags: { campaignId: [campaignId || 'missing'] },
    },
    bounce: {
      bounceType: 'Permanent',
      bouncedRecipients: [{ emailAddress: contactEmail }],
    },
  });
  results.push({
    name: 'ses_webhook_bounce_suppress',
    ok: bounce.status === 200 && bounce.json?.ok === true && bounce.json?.type === 'bounce' && bounce.json?.suppressed >= 1,
    detail: `status=${bounce.status} type=${bounce.json?.type} suppressed=${bounce.json?.suppressed}`,
  });

  const bounceAgain = await postSesEvent({
    eventType: 'Bounce',
    mail: {
      messageId: `bounce-dup-${stamp}`,
      destination: [contactEmail],
      tags: { campaignId: [campaignId || 'missing'] },
    },
    bounce: {
      bounceType: 'Permanent',
      bouncedRecipients: [{ emailAddress: contactEmail }],
    },
  });
  results.push({
    name: 'ses_webhook_bounce_idempotent',
    ok: bounceAgain.status === 200 && bounceAgain.json?.ok === true,
    detail: `status=${bounceAgain.status} suppressed=${bounceAgain.json?.suppressed}`,
  });

  const suppressedBounce = await api(
    '/email-marketing/suppressions?search=' + encodeURIComponent(contactEmail),
    token,
  );
  const suppressedBounceRows =
    (suppressedBounce.json?.items as Array<{ email: string; reason: string }> | undefined) ?? [];
  results.push({
    name: 'suppression_after_bounce',
    ok:
      okStatus(suppressedBounce.status) &&
      suppressedBounceRows.some((r) => r.email === contactEmail && r.reason === 'BOUNCE'),
    detail: `status=${suppressedBounce.status} n=${suppressedBounceRows.length} reason=${suppressedBounceRows[0]?.reason || ''}`,
  });

  const previewAfterBounce = await api(
    `/email-marketing/audience-preview${listId ? `?listId=${listId}` : ''}`,
    token,
  );
  results.push({
    name: 'audience_skips_bounced',
    ok: okStatus(previewAfterBounce.status) && previewAfterBounce.json?.eligible === 0,
    detail: `status=${previewAfterBounce.status} eligible=${previewAfterBounce.json?.eligible} skippedUnsubscribed=${previewAfterBounce.json?.skippedUnsubscribed} skippedSuppressed=${previewAfterBounce.json?.skippedSuppressed}`,
  });

  const complaintEmail = `em-complaint-${stamp}@example.com`;
  const complaintContact = await api('/email-marketing/contacts', token, {
    method: 'POST',
    body: JSON.stringify({ email: complaintEmail, name: 'Complaint Contact', listId }),
  });
  const complaintContactId = complaintContact.json?.id as string | undefined;
  const complaint = await postSesEvent({
    eventType: 'Complaint',
    mail: {
      messageId: `complaint-${stamp}`,
      destination: [complaintEmail],
      tags: { campaignId: [campaignId || 'missing'] },
    },
    complaint: { complainedRecipients: [{ emailAddress: complaintEmail }] },
  });
  const suppressedComplaint = await api(
    '/email-marketing/suppressions?search=' + encodeURIComponent(complaintEmail),
    token,
  );
  const complaintRows =
    (suppressedComplaint.json?.items as Array<{ email: string; reason: string }> | undefined) ?? [];
  results.push({
    name: 'ses_webhook_complaint_suppress',
    ok:
      complaint.status === 200 &&
      complaint.json?.type === 'complaint' &&
      complaintRows.some((r) => r.email === complaintEmail && r.reason === 'COMPLAINT'),
    detail: `status=${complaint.status} reason=${complaintRows[0]?.reason || ''}`,
  });

  const unsubEmail = `em-unsub-${stamp}@example.com`;
  const unsubContact = await api('/email-marketing/contacts', token, {
    method: 'POST',
    body: JSON.stringify({ email: unsubEmail, name: 'Unsub Contact', listId }),
  });
  const unsubContactId = unsubContact.json?.id as string | undefined;
  const unsub = await postSesEvent({
    eventType: 'Subscription',
    mail: {
      messageId: `unsub-${stamp}`,
      destination: [unsubEmail],
      tags: { campaignId: [campaignId || 'missing'] },
    },
  });
  const suppressedUnsub = await api(
    '/email-marketing/suppressions?search=' + encodeURIComponent(unsubEmail),
    token,
  );
  const unsubRows = (suppressedUnsub.json?.items as Array<{ email: string; reason: string }> | undefined) ?? [];
  results.push({
    name: 'ses_webhook_unsubscribe_suppress',
    ok:
      unsub.status === 200 &&
      unsub.json?.type === 'unsubscribe' &&
      unsubRows.some((r) => r.email === unsubEmail && r.reason === 'UNSUBSCRIBE'),
    detail: `status=${unsub.status} reason=${unsubRows[0]?.reason || ''}`,
  });

  const metricOk = [];
  for (const metric of ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed']) {
    const listed = await api(`/email-marketing/campaigns/${campaignId}/recipients?metric=${metric}`, token);
    metricOk.push(okStatus(listed.status) && Array.isArray(listed.json?.items));
  }
  results.push({
    name: 'campaign_recipients_metrics',
    ok: !!campaignId && metricOk.every(Boolean),
    detail: `ok=${metricOk.filter(Boolean).length}/6`,
  });

  const badMetric = await api(`/email-marketing/campaigns/${campaignId}/recipients?metric=foo`, token);
  results.push({
    name: 'campaign_recipients_metric_invalid',
    ok: badMetric.status === 400,
    detail: `status=${badMetric.status}`,
  });

  const snap = await api('/email-marketing/templates', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Chiến dịch: wizard ${stamp}`,
      subject: 'Xác nhận gửi',
      htmlBody: '<p>Xin chào {{name}}</p>',
      category: 'campaign',
      isActive: false,
    }),
  });
  const snapId = snap.json?.id as string | undefined;
  const wizardCamp = await api('/email-marketing/campaigns', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `Wizard ${stamp}`,
      subject: 'Xác nhận gửi',
      templateId: snapId,
      listId,
    }),
  });
  const wizardId = wizardCamp.json?.id as string | undefined;
  results.push({
    name: 'wizard_create_campaign',
    ok:
      okStatus(wizardCamp.status) &&
      wizardCamp.json?.status === 'DRAFT' &&
      wizardCamp.json?.listId === listId,
    detail: `status=${wizardCamp.status} id=${wizardId}`,
  });

  const allAudienceCamp = await api('/email-marketing/campaigns', token, {
    method: 'POST',
    body: JSON.stringify({
      name: `All audience ${stamp}`,
      subject: 'Toàn bộ danh bạ',
      templateId: snapId || templateId,
    }),
  });
  const allAudienceId = allAudienceCamp.json?.id as string | undefined;
  results.push({
    name: 'create_campaign_all_audience',
    ok:
      okStatus(allAudienceCamp.status) &&
      allAudienceCamp.json?.status === 'DRAFT' &&
      allAudienceCamp.json?.listId == null &&
      allAudienceCamp.json?.segmentId == null,
    detail: `status=${allAudienceCamp.status} listId=${allAudienceCamp.json?.listId}`,
  });

  const when = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const scheduled = await api(`/email-marketing/campaigns/${wizardId}/schedule`, token, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt: when }),
  });
  results.push({
    name: 'wizard_schedule',
    ok: okStatus(scheduled.status) && scheduled.json?.status === 'SCHEDULED',
    detail: `status=${scheduled.status} campaign=${scheduled.json?.status}`,
  });

  const reports = await api('/email-marketing/reports', token);
  results.push({
    name: 'reports',
    ok: okStatus(reports.status) && Array.isArray(reports.json?.campaigns),
    detail: `status=${reports.status} n=${reports.json?.campaigns?.length}`,
  });

  const automations = await api('/email-marketing/automations', token);
  results.push({
    name: 'list_automations',
    ok: okStatus(automations.status) && Array.isArray(automations.json),
    detail: `status=${automations.status}`,
  });

  const automationRecipes = await api('/email-marketing/automations/recipes', token);
  results.push({
    name: 'automation_recipes',
    ok:
      okStatus(automationRecipes.status) &&
      Array.isArray(automationRecipes.json) &&
      automationRecipes.json.length === 7,
    detail: `status=${automationRecipes.status} n=${automationRecipes.json?.length}`,
  });

  const crmStages = await api('/email-marketing/automations/crm-stages', token);
  results.push({
    name: 'automation_crm_stages',
    ok: okStatus(crmStages.status) && Array.isArray(crmStages.json),
    detail: `status=${crmStages.status} n=${crmStages.json?.length}`,
  });

  const presetTemplates = await api('/email-marketing/templates?pageSize=50', token);
  const presetCount = (
    (presetTemplates.json?.items as Array<{ category?: string }> | undefined) ?? []
  ).filter((t) => t.category?.startsWith('preset:')).length;
  results.push({
    name: 'preset_templates',
    ok: okStatus(presetTemplates.status) && presetCount >= 5,
    detail: `status=${presetTemplates.status} presets=${presetCount}`,
  });

  if (listId) {
    const fromRecipe = await api('/email-marketing/automations/from-recipe', token, {
      method: 'POST',
      body: JSON.stringify({
        recipeId: 'new-lead',
        listId,
        activate: true,
      }),
    });
    const recipeAutomationId = fromRecipe.json?.id as string | undefined;
    results.push({
      name: 'create_automation_from_recipe',
      ok:
        okStatus(fromRecipe.status) &&
        !!recipeAutomationId &&
        fromRecipe.json?.recipeId === 'new-lead' &&
        fromRecipe.json?.status === 'ACTIVE',
      detail: `status=${fromRecipe.status} id=${recipeAutomationId}`,
    });

    const upsertRecipe = await api('/email-marketing/automations/from-recipe', token, {
      method: 'POST',
      body: JSON.stringify({
        recipeId: 'new-lead',
        listId,
        activate: false,
      }),
    });
    results.push({
      name: 'upsert_automation_from_recipe',
      ok:
        okStatus(upsertRecipe.status) &&
        upsertRecipe.json?.id === recipeAutomationId &&
        upsertRecipe.json?.status === 'DRAFT',
      detail: `status=${upsertRecipe.status} sameId=${upsertRecipe.json?.id === recipeAutomationId}`,
    });

    if (recipeAutomationId) {
      await api(`/email-marketing/automations/${recipeAutomationId}`, token, { method: 'DELETE' });
    }
  }

  const fakeOrgGet = await api(`/email-marketing/campaigns/${campaignId || 'missing'}`, token);
  results.push({
    name: 'get_campaign_same_org',
    ok:
      okStatus(fakeOrgGet.status) &&
      fakeOrgGet.json?.organizationId === orgId &&
      typeof fakeOrgGet.json?.openRate === 'number' &&
      typeof fakeOrgGet.json?.clickRate === 'number',
    detail: `status=${fakeOrgGet.status} openRate=${fakeOrgGet.json?.openRate}`,
  });

  const missing = await api('/email-marketing/campaigns/00000000-0000-0000-0000-000000000000', token);
  results.push({
    name: 'tenant_isolation_missing_id',
    ok: missing.status === 404,
    detail: `status=${missing.status}`,
  });

  const listed = await api('/email-marketing/contacts?search=' + encodeURIComponent(contactEmail), token);
  const listedItems = (listed.json?.items as Array<{ id: string; organizationId: string; email: string }> | undefined) ?? [];
  results.push({
    name: 'tenant_list_own_contact',
    ok:
      okStatus(listed.status) &&
      listedItems.some((c) => c.id === contactId && c.organizationId === orgId && c.email === contactEmail),
    detail: `status=${listed.status} n=${listedItems.length}`,
  });

  const tagged = await api('/email-marketing/contacts?tag=VIP&search=' + encodeURIComponent(contactEmail), token);
  results.push({
    name: 'filter_tag',
    ok: okStatus(tagged.status) && (tagged.json?.items as { id: string }[] | undefined)?.some((c) => c.id === contactId),
    detail: `status=${tagged.status}`,
  });

  const facets = await api('/email-marketing/contacts/facets', token);
  results.push({
    name: 'contact_facets',
    ok: okStatus(facets.status) && Array.isArray(facets.json?.tags) && facets.json.tags.includes('VIP'),
    detail: `status=${facets.status} tags=${(facets.json?.tags || []).join(',')}`,
  });

  const csv = `Tên,Email,Điện thoại,Nguồn,Tag,Nhóm\nImport CSV,em-csv-${stamp}@example.com,0900000001,Excel,import,Nhóm CSV ${stamp}\n`;
  const fd = new FormData();
  fd.append('file', new File([csv], 'danh-ba.csv', { type: 'text/csv' }));
  const importRes = await fetch(`${API}/api/v1/email-marketing/contacts/import-file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const importJson = await importRes.json().catch(() => ({}));
  results.push({
    name: 'import_csv',
    ok: (importRes.status === 200 || importRes.status === 201) && importJson.imported >= 1,
    detail: `status=${importRes.status} imported=${importJson.imported}`,
  });

  const importedContact = await api(
    '/email-marketing/contacts?search=' + encodeURIComponent(`em-csv-${stamp}@example.com`),
    token,
  );
  const importedRow = (importedContact.json?.items as Array<{ id: string; source: string }> | undefined)?.[0];
  results.push({
    name: 'import_csv_row',
    ok: !!importedRow && importedRow.source === 'Excel',
    detail: `source=${importedRow?.source ?? ''}`,
  });

  const sync = await api('/email-marketing/contacts/sync-crm', token, { method: 'POST' });
  results.push({
    name: 'sync_crm',
    ok: okStatus(sync.status) && typeof sync.json?.imported === 'number',
    detail: `status=${sync.status} imported=${sync.json?.imported} updated=${sync.json?.updated}`,
  });

  if (domainId) {
    await api(`/email-marketing/domains/${domainId}`, token, { method: 'DELETE' });
  }
  if (importedRow?.id) {
    await api(`/email-marketing/contacts/${importedRow.id}`, token, { method: 'DELETE' });
  }
  const csvList = await api('/email-marketing/lists?search=' + encodeURIComponent(`Nhóm CSV ${stamp}`), token);
  const csvListId = (csvList.json?.items as Array<{ id: string }> | undefined)?.[0]?.id;
  if (csvListId) {
    await api(`/email-marketing/lists/${csvListId}`, token, { method: 'DELETE' });
  }
  if (wizardId) {
    await api(`/email-marketing/campaigns/${wizardId}`, token, { method: 'DELETE' });
  }
  if (allAudienceId) {
    await api(`/email-marketing/campaigns/${allAudienceId}`, token, { method: 'DELETE' });
  }
  if (campaignId) {
    await api(`/email-marketing/campaigns/${campaignId}`, token, { method: 'DELETE' });
  }
  for (const emailToClear of [contactEmail, complaintEmail, unsubEmail]) {
    const rows = await api(
      '/email-marketing/suppressions?search=' + encodeURIComponent(emailToClear),
      token,
    );
    for (const row of (rows.json?.items as Array<{ id: string }> | undefined) ?? []) {
      await api(`/email-marketing/suppressions/${row.id}`, token, { method: 'DELETE' });
    }
  }
  if (complaintContactId) {
    await api(`/email-marketing/contacts/${complaintContactId}`, token, { method: 'DELETE' });
  }
  if (unsubContactId) {
    await api(`/email-marketing/contacts/${unsubContactId}`, token, { method: 'DELETE' });
  }
  if (listId) {
    await api(`/email-marketing/lists/${listId}`, token, { method: 'DELETE' });
  }
  if (snapId) {
    await api(`/email-marketing/templates/${snapId}`, token, { method: 'DELETE' });
  }
  if (editorTemplateId) {
    await api(`/email-marketing/templates/${editorTemplateId}`, token, { method: 'DELETE' });
  }
  if (templateId) {
    await api(`/email-marketing/templates/${templateId}`, token, { method: 'DELETE' });
  }
  if (contactId) {
    await api(`/email-marketing/contacts/${contactId}`, token, { method: 'DELETE' });
  }

  print(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
