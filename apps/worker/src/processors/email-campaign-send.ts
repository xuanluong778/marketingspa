import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import type Redis from 'ioredis';
import { Queue } from 'bullmq';
import {
  EmailAutomationAction,
  EmailAutomationStatus,
  EmailAutomationTrigger,
  EmailCampaignStatus,
  EmailContactStatus,
  EmailDomainStatus,
  EmailEventType,
  EmailRecipientStatus,
  prisma,
} from '@marketingspa/database';
import {
  EMAIL_SEND_ATTEMPTS,
  EMAIL_SEND_BACKOFF_MS,
  QUEUE_NAMES,
  isPermanentEmailError,
  resolveEmailProviderName,
  rewriteEmailTrackedLinks,
  sesFromEmail,
  type EmailSendMessage,
} from '@marketingspa/shared';
import { createEmailProvider } from '@marketingspa/shared/dist/email-providers/create';
import { acquireEmailSendRateLimit } from '../lib/email-rate-limit';
import { bullConnection, queuePrefix } from '../config';

export type EmailSendJob = {
  organizationId: string;
  campaignId: string;
  recipientId?: string;
  recipientIds?: string[];
};

export type EmailNotOpenFollowupJob = {
  organizationId: string;
  automationId: string;
  recipientId: string;
};

const ALREADY_SENT: EmailRecipientStatus[] = [
  EmailRecipientStatus.SENT,
  EmailRecipientStatus.DELIVERED,
  EmailRecipientStatus.OPENED,
  EmailRecipientStatus.CLICKED,
  EmailRecipientStatus.BOUNCED,
  EmailRecipientStatus.UNSUBSCRIBED,
  EmailRecipientStatus.SKIPPED,
];

function renderMerge(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

function publicApiBase(): string {
  const app = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
  return `${app}/api/v1/email-marketing/public`;
}

function unsubscribePageUrl(recipientId: string) {
  const app = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
  return `${app}/email-unsubscribe?rid=${encodeURIComponent(recipientId)}`;
}

function fromAddress(fromName?: string | null, fromEmail?: string | null): string {
  if (fromName && fromEmail) return `${fromName} <${fromEmail}>`;
  if (fromEmail) return fromEmail;
  if (resolveEmailProviderName() === 'ses') return sesFromEmail();
  return (process.env.SMTP_FROM || '').trim();
}

function mergeVars(contact: {
  name?: string | null;
  email: string;
  customFields?: unknown;
}) {
  const name = contact.name?.trim() || contact.email;
  const firstName = name.split(/\s+/)[0] || name;
  const fields =
    contact.customFields && typeof contact.customFields === 'object' && !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};
  const companyRaw = fields.company ?? fields.companyName ?? '';
  return {
    name,
    firstName,
    email: contact.email,
    company: typeof companyRaw === 'string' ? companyRaw.trim() : '',
  };
}

export async function processEmailCampaignSend(job: Job<EmailSendJob>, redis: Redis) {
  const { organizationId, campaignId } = job.data;
  const recipientIds = [
    ...new Set(
      (job.data.recipientIds?.length
        ? job.data.recipientIds
        : job.data.recipientId
          ? [job.data.recipientId]
          : []
      ).filter(Boolean),
    ),
  ];
  if (!recipientIds.length) return { skipped: true, reason: 'empty_batch' };

  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { template: true, senderDomain: true },
  });
  if (!campaign) return { skipped: true, reason: 'campaign_not_found' };
  if (
    campaign.status === EmailCampaignStatus.PAUSED ||
    campaign.status === EmailCampaignStatus.CANCELLED
  ) {
    return { skipped: true, reason: 'campaign_not_running', status: campaign.status };
  }

  const template = campaign.template;
  if (!template) {
    await prisma.emailCampaignRecipient.updateMany({
      where: { id: { in: recipientIds }, organizationId, campaignId },
      data: { status: EmailRecipientStatus.FAILED, lastError: 'missing_template' },
    });
    return { skipped: true, reason: 'missing_template' };
  }

  const provider = createEmailProvider();
  if (!provider.isConfigured()) {
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? EMAIL_SEND_ATTEMPTS);
    const reason = `provider_not_configured:${provider.name}`;
    if (lastAttempt) {
      for (const id of recipientIds) {
        const row = await prisma.emailCampaignRecipient.findFirst({
          where: { id, organizationId, campaignId },
        });
        if (row && !ALREADY_SENT.includes(row.status)) {
          await failRecipient(row.id, campaignId, organizationId, row.contactId, reason);
        }
      }
      throw new UnrecoverableError(reason);
    }
    throw new Error(reason);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let retryError: Error | null = null;

  for (const recipientId of recipientIds) {
    const recipient = await prisma.emailCampaignRecipient.findFirst({
      where: { id: recipientId, organizationId, campaignId },
      include: { contact: true },
    });
    if (!recipient) {
      skipped += 1;
      continue;
    }
    if (ALREADY_SENT.includes(recipient.status)) {
      skipped += 1;
      continue;
    }

    const suppressed = await prisma.emailSuppression.findFirst({
      where: { organizationId, email: recipient.email.toLowerCase() },
      select: { id: true },
    });
    if (suppressed || recipient.contact.status !== EmailContactStatus.SUBSCRIBED) {
      await skipRecipient(
        recipient.id,
        suppressed ? 'suppressed' : 'not_subscribed',
      );
      skipped += 1;
      continue;
    }

    const claimed = await prisma.emailCampaignRecipient.updateMany({
      where: {
        id: recipient.id,
        status: { in: [EmailRecipientStatus.QUEUED, EmailRecipientStatus.FAILED, EmailRecipientStatus.PENDING] },
      },
      data: { attemptCount: { increment: 1 } },
    });
    if (claimed.count === 0) {
      skipped += 1;
      continue;
    }

    const vars = mergeVars(recipient.contact);
    const subject = renderMerge(campaign.subject || template.subject, vars);
    const unsub = unsubscribePageUrl(recipient.id);
    const pixel = `${publicApiBase()}/open/${recipient.id}`;
    let html = renderMerge(template.htmlBody, vars);
    const clickBase = `${publicApiBase()}/click/${recipient.id}`;
    html = rewriteEmailTrackedLinks(html, clickBase, unsub);
    html += `<p style="font-size:12px;color:#888;margin-top:24px">Nếu không muốn nhận email nữa, <a href="${unsub}">hủy đăng ký</a>.</p>`;
    html += `<img src="${pixel}" width="1" height="1" alt="" />`;
    const text =
      renderMerge(template.textBody || '', vars) || `${subject}\n\nHủy đăng ký: ${unsub}`;

    const verifiedDomain =
      campaign.senderDomain?.status === EmailDomainStatus.VERIFIED ? campaign.senderDomain : null;
    const payload: EmailSendMessage = {
      to: recipient.email,
      from: fromAddress(verifiedDomain?.fromName, verifiedDomain?.fromEmail),
      replyTo: verifiedDomain?.replyTo || undefined,
      subject,
      html,
      text,
      headers: { 'List-Unsubscribe': `<${unsub}>` },
      tags: { campaignId, recipientId: recipient.id },
    };
    if (!payload.from) {
      await failRecipient(recipient.id, campaignId, organizationId, recipient.contactId, 'missing_from_address');
      failed += 1;
      continue;
    }

    try {
      await acquireEmailSendRateLimit(redis, provider.name, organizationId);
      const result = await provider.send(payload);
      await prisma.$transaction([
        prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: EmailRecipientStatus.SENT,
            sentAt: new Date(),
            lastError: null,
            provider: result.provider,
            providerMessageId: result.messageId || null,
          },
        }),
        prisma.emailEvent.create({
          data: {
            organizationId,
            campaignId,
            recipientId: recipient.id,
            contactId: recipient.contactId,
            type: EmailEventType.SENT,
            metadata: { provider: result.provider, messageId: result.messageId },
          },
        }),
        prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { sentCount: { increment: 1 } },
        }),
      ]);
      sent += 1;
      await scheduleNotOpenFollowups(organizationId, recipient.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? EMAIL_SEND_ATTEMPTS);
      if (isPermanentEmailError(err) || lastAttempt) {
        await failRecipient(recipient.id, campaignId, organizationId, recipient.contactId, message);
        failed += 1;
        if (isPermanentEmailError(err)) continue;
      }
      retryError = err instanceof Error ? err : new Error(message);
    }
  }

  const pending = await prisma.emailCampaignRecipient.count({
    where: {
      campaignId,
      organizationId,
      status: { in: [EmailRecipientStatus.PENDING, EmailRecipientStatus.QUEUED] },
    },
  });
  if (pending === 0) {
    await prisma.emailCampaign.updateMany({
      where: { id: campaignId, organizationId, status: EmailCampaignStatus.RUNNING },
      data: { status: EmailCampaignStatus.COMPLETED, completedAt: new Date() },
    });
  }

  if (retryError) throw retryError;
  return { ok: true, sent, skipped, failed, batch: recipientIds.length };
}

export async function processEmailNotOpenFollowup(job: Job<EmailNotOpenFollowupJob>, redis: Redis) {
  const { organizationId, automationId, recipientId } = job.data;

  const original = await prisma.emailCampaignRecipient.findFirst({
    where: { id: recipientId, organizationId },
    include: { contact: true },
  });
  if (!original) return { skipped: true, reason: 'recipient_not_found' };
  if (original.openedAt) return { skipped: true, reason: 'already_opened' };

  const automation = await prisma.emailAutomation.findFirst({
    where: {
      id: automationId,
      organizationId,
      trigger: EmailAutomationTrigger.EMAIL_NOT_OPENED,
      status: EmailAutomationStatus.ACTIVE,
      action: EmailAutomationAction.SEND_EMAIL,
    },
    include: { template: true },
  });
  if (!automation?.templateId || !automation.template) {
    return { skipped: true, reason: 'automation_inactive' };
  }

  if (automation.listId) {
    const member = await prisma.emailListMember.findFirst({
      where: {
        organizationId,
        listId: automation.listId,
        contactId: original.contactId,
      },
    });
    if (!member) return { skipped: true, reason: 'not_in_list' };
  }

  const campaignName = `[Tự động] ${automation.name}`;
  const alreadySent = await prisma.emailCampaignRecipient.findFirst({
    where: {
      organizationId,
      contactId: original.contactId,
      campaign: { name: campaignName },
    },
    select: { id: true },
  });
  if (alreadySent) return { skipped: true, reason: 'already_sent' };

  const normalized = original.email.toLowerCase();
  const suppressed = await prisma.emailSuppression.findFirst({
    where: { organizationId, email: normalized },
    select: { id: true },
  });
  if (suppressed || original.contact.status !== EmailContactStatus.SUBSCRIBED) {
    return { skipped: true, reason: 'suppressed_or_unsubscribed' };
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId,
      name: campaignName,
      templateId: automation.templateId,
      status: EmailCampaignStatus.RUNNING,
      startedAt: new Date(),
      totalRecipients: 1,
      queuedCount: 1,
    },
  });
  const followRecipient = await prisma.emailCampaignRecipient.create({
    data: {
      organizationId,
      campaignId: campaign.id,
      contactId: original.contactId,
      email: normalized,
      status: EmailRecipientStatus.QUEUED,
      queuedAt: new Date(),
    },
  });

  return processEmailCampaignSend(
    {
      ...job,
      name: 'send-email',
      data: {
        organizationId,
        campaignId: campaign.id,
        recipientIds: [followRecipient.id],
      },
    } as Job<EmailSendJob>,
    redis,
  );
}

async function scheduleNotOpenFollowups(organizationId: string, recipientId: string) {
  const automations = await prisma.emailAutomation.findMany({
    where: {
      organizationId,
      trigger: EmailAutomationTrigger.EMAIL_NOT_OPENED,
      status: EmailAutomationStatus.ACTIVE,
      action: EmailAutomationAction.SEND_EMAIL,
    },
    select: { id: true, templateId: true, waitDays: true },
  });
  if (!automations.length) return;

  const sendQueue = new Queue(QUEUE_NAMES.EMAIL_CAMPAIGN_SEND, {
    connection: bullConnection,
    prefix: queuePrefix,
  });
  try {
    for (const automation of automations) {
      if (!automation.templateId) continue;
      const delayMs = Math.max(0, automation.waitDays) * 86_400_000;
      const jobId = `email-notopen-${automation.id}-${recipientId}`;
      const existingJob = await sendQueue.getJob(jobId);
      if (existingJob) continue;
      await sendQueue.add(
        'email-not-open-followup',
        { organizationId, automationId: automation.id, recipientId },
        {
          jobId,
          delay: delayMs > 0 ? delayMs : undefined,
          attempts: EMAIL_SEND_ATTEMPTS,
          backoff: { type: 'exponential', delay: EMAIL_SEND_BACKOFF_MS },
          removeOnComplete: 10_000,
          removeOnFail: 20_000,
        },
      );
    }
  } finally {
    await sendQueue.close();
  }
}

async function skipRecipient(recipientId: string, skipReason: string) {
  await prisma.emailCampaignRecipient.update({
    where: { id: recipientId },
    data: { status: EmailRecipientStatus.SKIPPED, skipReason, lastError: null },
  });
}

async function failRecipient(
  recipientId: string,
  campaignId: string,
  organizationId: string,
  contactId: string,
  lastError: string,
) {
  const current = await prisma.emailCampaignRecipient.findFirst({
    where: { id: recipientId },
    select: { status: true },
  });
  if (current?.status === EmailRecipientStatus.FAILED) return;
  if (current && ALREADY_SENT.includes(current.status)) return;
  await prisma.$transaction([
    prisma.emailCampaignRecipient.update({
      where: { id: recipientId },
      data: { status: EmailRecipientStatus.FAILED, lastError: lastError.slice(0, 500) },
    }),
    prisma.emailEvent.create({
      data: {
        organizationId,
        campaignId,
        recipientId,
        contactId,
        type: EmailEventType.FAILED,
        metadata: { error: lastError.slice(0, 500) },
      },
    }),
    prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { failCount: { increment: 1 } },
    }),
  ]);
}
