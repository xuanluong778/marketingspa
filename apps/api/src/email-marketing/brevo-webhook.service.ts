import { createHash, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  EmailContactStatus,
  EmailEventType,
  EmailRecipientStatus,
  EmailSuppressionReason,
  Prisma,
} from '@marketingspa/database';
import {
  brevoKindRequiresSuppression,
  brevoMessageIdVariants,
  flattenBrevoWebhookBodies,
  parseBrevoWebhookPayload,
  type BrevoWebhookKind,
  type ParsedBrevoWebhookEvent,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return '•••';
  const [u, d] = email.split('@');
  if (!d) return '•••';
  return `${(u || '').slice(0, 2)}…@${d}`;
}

/**
 * Brevo transactional webhook → EmailCampaignRecipient / EmailOutboundMessage / suppression.
 * Idempotent via EmailWebhookEvent.eventKey. Không log secret / full email.
 */
@Injectable()
export class BrevoWebhookService {
  private readonly logger = new Logger(BrevoWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  verifySecret(headerSecret: string | undefined): boolean {
    const expected = (process.env.BREVO_WEBHOOK_SECRET || '').trim();
    if (!expected) {
      if ((process.env.BREVO_WEBHOOK_ALLOW_UNSIGNED || '').trim() === '1') return true;
      return false;
    }
    const provided = (headerSecret || '').trim();
    if (!provided) return false;
    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(provided).digest();
    return timingSafeEqual(a, b);
  }

  async handlePayload(body: unknown): Promise<{
    ok: true;
    accepted: number;
    updated: number;
    suppressed: number;
    duplicates: number;
  }> {
    const items = flattenBrevoWebhookBodies(body);
    let accepted = 0;
    let updated = 0;
    let suppressed = 0;
    let duplicates = 0;

    for (const item of items) {
      const event = parseBrevoWebhookPayload(item);
      if (event.kind === 'ignored') {
        accepted += 1;
        continue;
      }
      accepted += 1;
      const result = await this.processOne(event);
      if (result.duplicate) duplicates += 1;
      else {
        updated += result.updated;
        suppressed += result.suppressed;
      }
    }

    this.logger.log(
      `[brevo-webhook] accepted=${accepted} updated=${updated} suppressed=${suppressed} dup=${duplicates}`,
    );
    return { ok: true, accepted, updated, suppressed, duplicates };
  }

  private async processOne(event: ParsedBrevoWebhookEvent): Promise<{
    duplicate: boolean;
    updated: number;
    suppressed: number;
  }> {
    try {
      await this.prisma.emailWebhookEvent.create({
        data: {
          provider: 'brevo',
          eventKey: event.eventKey,
          eventKind: event.kind,
          messageId: event.messageId,
          recipientId: event.recipientId,
          campaignId: event.campaignId,
          metadata: {
            rawEvent: event.rawEvent,
            hasEmail: Boolean(event.email),
            tagCount: event.tags.length,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { duplicate: true, updated: 0, suppressed: 0 };
      }
      throw err;
    }

    const recipients = await this.findRecipients(event);
    let updated = 0;
    let suppressed = 0;
    let organizationId: string | null = null;

    for (const recipient of recipients) {
      organizationId = recipient.organizationId;
      const changed = await this.applyToRecipient(recipient, event);
      if (changed) updated += 1;
      if (brevoKindRequiresSuppression(event.kind)) {
        await this.upsertSuppression(
          recipient.organizationId,
          recipient.email,
          this.suppressionReason(event.kind),
        );
        suppressed += 1;
      }
    }

    // Also update outbound transactional/marketing log by message id
    await this.applyToOutbound(event);

    // Suppress even if no recipient row matched (org from campaign tag / outbound)
    if (brevoKindRequiresSuppression(event.kind) && event.email) {
      if (!organizationId && event.campaignId) {
        const camp = await this.prisma.emailCampaign.findFirst({
          where: { id: event.campaignId },
          select: { organizationId: true },
        });
        organizationId = camp?.organizationId ?? null;
      }
      if (!organizationId && event.messageId) {
        const out = await this.prisma.emailOutboundMessage.findFirst({
          where: { providerMessageId: { in: brevoMessageIdVariants(event.messageId) } },
          select: { organizationId: true },
        });
        organizationId = out?.organizationId ?? null;
      }
      if (organizationId) {
        await this.upsertSuppression(
          organizationId,
          event.email,
          this.suppressionReason(event.kind),
        );
        suppressed += 1;
      }
    }

    if (organizationId) {
      await this.prisma.emailWebhookEvent.updateMany({
        where: { provider: 'brevo', eventKey: event.eventKey },
        data: { organizationId },
      });
    }

    return { duplicate: false, updated, suppressed };
  }

  private suppressionReason(kind: BrevoWebhookKind): EmailSuppressionReason {
    if (kind === 'complaint') return EmailSuppressionReason.COMPLAINT;
    if (kind === 'unsubscribed') return EmailSuppressionReason.UNSUBSCRIBE;
    return EmailSuppressionReason.BOUNCE;
  }

  private async findRecipients(event: ParsedBrevoWebhookEvent) {
    if (event.recipientId) {
      const row = await this.prisma.emailCampaignRecipient.findFirst({
        where: {
          id: event.recipientId,
          ...(event.campaignId ? { campaignId: event.campaignId } : {}),
        },
      });
      if (row) return [row];
    }

    const variants = brevoMessageIdVariants(event.messageId);
    if (variants.length) {
      const byMid = await this.prisma.emailCampaignRecipient.findMany({
        where: { providerMessageId: { in: variants } },
        take: 20,
      });
      if (byMid.length) return byMid;
    }

    if (event.email && event.campaignId) {
      return this.prisma.emailCampaignRecipient.findMany({
        where: {
          campaignId: event.campaignId,
          email: normalizeEmail(event.email),
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    }

    if (event.email) {
      // Recent SENT/DELIVERED for this email (narrow window) — last resort
      return this.prisma.emailCampaignRecipient.findMany({
        where: {
          email: normalizeEmail(event.email),
          status: {
            in: [
              EmailRecipientStatus.SENT,
              EmailRecipientStatus.DELIVERED,
              EmailRecipientStatus.OPENED,
              EmailRecipientStatus.CLICKED,
              EmailRecipientStatus.QUEUED,
            ],
          },
          sentAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
        },
        orderBy: { sentAt: 'desc' },
        take: 3,
      });
    }
    return [];
  }

  private async applyToRecipient(
    recipient: {
      id: string;
      organizationId: string;
      campaignId: string;
      contactId: string;
      email: string;
      status: EmailRecipientStatus;
      deliveredAt: Date | null;
      openedAt: Date | null;
      clickedAt: Date | null;
      providerMessageId: string | null;
    },
    event: ParsedBrevoWebhookEvent,
  ): Promise<boolean> {
    if (event.messageId && !recipient.providerMessageId) {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: { providerMessageId: event.messageId },
      });
    }

    const meta = {
      source: 'brevo_webhook',
      rawEvent: event.rawEvent,
      messageId: event.messageId,
    } as Prisma.InputJsonValue;

    if (event.kind === 'sent') {
      return this.ensureUniqueEvent(recipient, EmailEventType.SENT, meta);
    }

    if (event.kind === 'delivered') {
      if (recipient.deliveredAt) return false;
      if (
        recipient.status === EmailRecipientStatus.BOUNCED ||
        recipient.status === EmailRecipientStatus.FAILED ||
        recipient.status === EmailRecipientStatus.UNSUBSCRIBED
      ) {
        return false;
      }
      const created = await this.ensureUniqueEvent(recipient, EmailEventType.DELIVERED, meta);
      if (!created && recipient.deliveredAt) return false;
      await this.prisma.$transaction([
        this.prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            deliveredAt: new Date(),
            status:
              recipient.status === EmailRecipientStatus.OPENED ||
              recipient.status === EmailRecipientStatus.CLICKED
                ? recipient.status
                : EmailRecipientStatus.DELIVERED,
          },
        }),
        this.prisma.emailCampaign.update({
          where: { id: recipient.campaignId },
          data: { deliveredCount: { increment: created ? 1 : 0 } },
        }),
      ]);
      return true;
    }

    if (event.kind === 'opened') {
      if (recipient.openedAt) return false;
      if (
        recipient.status === EmailRecipientStatus.BOUNCED ||
        recipient.status === EmailRecipientStatus.FAILED ||
        recipient.status === EmailRecipientStatus.UNSUBSCRIBED
      ) {
        return false;
      }
      await this.prisma.$transaction([
        this.prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            openedAt: new Date(),
            status:
              recipient.status === EmailRecipientStatus.CLICKED
                ? recipient.status
                : EmailRecipientStatus.OPENED,
            deliveredAt: recipient.deliveredAt ?? new Date(),
          },
        }),
        this.prisma.emailEvent.create({
          data: {
            organizationId: recipient.organizationId,
            campaignId: recipient.campaignId,
            recipientId: recipient.id,
            contactId: recipient.contactId,
            type: EmailEventType.OPEN,
            metadata: meta,
          },
        }),
        this.prisma.emailCampaign.update({
          where: { id: recipient.campaignId },
          data: { openCount: { increment: 1 } },
        }),
      ]);
      return true;
    }

    if (event.kind === 'clicked') {
      if (recipient.clickedAt) return false;
      await this.prisma.$transaction([
        this.prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            clickedAt: new Date(),
            openedAt: recipient.openedAt ?? new Date(),
            deliveredAt: recipient.deliveredAt ?? new Date(),
            status: EmailRecipientStatus.CLICKED,
          },
        }),
        this.prisma.emailEvent.create({
          data: {
            organizationId: recipient.organizationId,
            campaignId: recipient.campaignId,
            recipientId: recipient.id,
            contactId: recipient.contactId,
            type: EmailEventType.CLICK,
            metadata: { ...Object(meta), link: event.link },
          },
        }),
        this.prisma.emailCampaign.update({
          where: { id: recipient.campaignId },
          data: { clickCount: { increment: 1 } },
        }),
      ]);
      return true;
    }

    if (
      event.kind === 'bounce_hard' ||
      event.kind === 'invalid' ||
      event.kind === 'complaint'
    ) {
      const isComplaint = event.kind === 'complaint';
      const already = recipient.status === EmailRecipientStatus.BOUNCED;
      if (!already) {
        await this.prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: EmailRecipientStatus.BOUNCED,
            bouncedAt: new Date(),
            failedAt: new Date(),
            lastError: `brevo_${event.kind}`,
          },
        });
      }
      await this.markContact(
        recipient.organizationId,
        recipient.contactId,
        isComplaint ? EmailContactStatus.UNSUBSCRIBED : EmailContactStatus.BOUNCED,
      );
      const created = await this.ensureUniqueEvent(
        recipient,
        isComplaint ? EmailEventType.COMPLAINT : EmailEventType.BOUNCE,
        meta,
      );
      if (created && !already) {
        await this.prisma.emailCampaign.update({
          where: { id: recipient.campaignId },
          data: { bounceCount: { increment: 1 } },
        });
      }
      return created || !already;
    }

    if (event.kind === 'unsubscribed') {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: { status: EmailRecipientStatus.UNSUBSCRIBED },
      });
      await this.markContact(
        recipient.organizationId,
        recipient.contactId,
        EmailContactStatus.UNSUBSCRIBED,
      );
      const created = await this.ensureUniqueEvent(
        recipient,
        EmailEventType.UNSUBSCRIBE,
        meta,
      );
      if (created) {
        await this.prisma.emailCampaign.update({
          where: { id: recipient.campaignId },
          data: { unsubscribeCount: { increment: 1 } },
        });
      }
      return created;
    }

    if (
      event.kind === 'bounce_soft' ||
      event.kind === 'blocked' ||
      event.kind === 'error' ||
      event.kind === 'deferred'
    ) {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          lastError: `brevo_${event.kind}`,
          ...(event.kind === 'error' || event.kind === 'blocked'
            ? {
                status: EmailRecipientStatus.FAILED,
                failedAt: new Date(),
              }
            : {}),
        },
      });
      if (event.kind === 'error' || event.kind === 'blocked') {
        await this.ensureUniqueEvent(recipient, EmailEventType.FAILED, meta);
      }
      this.logger.warn(
        `[brevo-webhook] soft/fail kind=${event.kind} recipient=${recipient.id.slice(0, 8)}… to=${maskEmail(recipient.email)}`,
      );
      return true;
    }

    return false;
  }

  private async applyToOutbound(event: ParsedBrevoWebhookEvent) {
    const variants = brevoMessageIdVariants(event.messageId);
    if (!variants.length) return;
    const rows = await this.prisma.emailOutboundMessage.findMany({
      where: { providerMessageId: { in: variants } },
      take: 5,
    });
    for (const row of rows) {
      if (event.kind === 'delivered' && !row.deliveredAt) {
        await this.prisma.emailOutboundMessage.update({
          where: { id: row.id },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
      } else if (
        (event.kind === 'bounce_hard' ||
          event.kind === 'invalid' ||
          event.kind === 'complaint' ||
          event.kind === 'error' ||
          event.kind === 'blocked') &&
        row.status !== 'FAILED'
      ) {
        await this.prisma.emailOutboundMessage.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            lastError: `brevo_${event.kind}`,
          },
        });
      }
    }
  }

  private async ensureUniqueEvent(
    recipient: {
      id: string;
      organizationId: string;
      campaignId: string;
      contactId: string;
    },
    type: EmailEventType,
    metadata?: Prisma.InputJsonValue,
  ) {
    const exists = await this.prisma.emailEvent.findFirst({
      where: { recipientId: recipient.id, type },
      select: { id: true },
    });
    if (exists) {
      // Upgrade metadata source if webhook arrives after send-side SENT
      if (type === EmailEventType.DELIVERED || type === EmailEventType.OPEN) {
        return false;
      }
      return false;
    }
    await this.prisma.emailEvent.create({
      data: {
        organizationId: recipient.organizationId,
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        contactId: recipient.contactId,
        type,
        metadata: metadata ?? {},
      },
    });
    return true;
  }

  private async upsertSuppression(
    organizationId: string,
    email: string,
    reason: EmailSuppressionReason,
  ) {
    const normalized = normalizeEmail(email);
    const existing = await this.prisma.emailSuppression.findUnique({
      where: { organizationId_email: { organizationId, email: normalized } },
    });
    if (!existing) {
      await this.prisma.emailSuppression.create({
        data: { organizationId, email: normalized, reason, note: 'brevo_webhook' },
      });
      return;
    }
    const rank = (r: EmailSuppressionReason) =>
      r === EmailSuppressionReason.COMPLAINT
        ? 3
        : r === EmailSuppressionReason.UNSUBSCRIBE
          ? 2
          : r === EmailSuppressionReason.BOUNCE
            ? 1
            : 0;
    if (rank(reason) > rank(existing.reason)) {
      await this.prisma.emailSuppression.update({
        where: { id: existing.id },
        data: { reason, note: 'brevo_webhook' },
      });
    }
  }

  private async markContact(
    organizationId: string,
    contactId: string,
    status: EmailContactStatus,
  ) {
    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, organizationId },
      select: { status: true },
    });
    if (!contact || contact.status === EmailContactStatus.UNSUBSCRIBED) return;
    await this.prisma.emailContact.update({
      where: { id: contactId },
      data: {
        status,
        unsubscribedAt: status === EmailContactStatus.UNSUBSCRIBED ? new Date() : undefined,
      },
    });
  }
}
