import { Injectable, Logger } from '@nestjs/common';
import {
  defaultFromForProvider,
  type EmailSendMessage,
  type EmailSendPurpose,
  type EmailSendResult,
} from '@marketingspa/shared';
import { createEmailProvider } from '@marketingspa/shared/dist/email-providers/create';
import { PrismaService } from '../prisma/prisma.service';

export type SendRoutedEmailInput = {
  organizationId: string;
  purpose: EmailSendPurpose;
  to: string;
  subject: string;
  html?: string;
  text: string;
  from?: string;
  replyTo?: string;
  /** Chống gửi trùng khi retry — unique theo organizationId. */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

/**
 * Gửi email qua router SES/Brevo + ghi EmailOutboundMessage (multi-tenant, idempotent).
 * Không log API key/secret.
 */
@Injectable()
export class EmailRouterService {
  private readonly logger = new Logger(EmailRouterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(input: SendRoutedEmailInput): Promise<EmailSendResult & { deduped?: boolean }> {
    const existing = await this.prisma.emailOutboundMessage.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing?.status === 'SENT' && existing.providerMessageId) {
      return {
        provider: (existing.provider as EmailSendResult['provider']) || 'ses',
        messageId: existing.providerMessageId,
        deduped: true,
      };
    }

    const row =
      existing ||
      (await this.prisma.emailOutboundMessage.create({
        data: {
          organizationId: input.organizationId,
          purpose: input.purpose,
          toEmail: input.to.toLowerCase(),
          subject: input.subject,
          status: 'PENDING',
          idempotencyKey: input.idempotencyKey,
          metadata: (input.metadata || {}) as import('@marketingspa/database').Prisma.InputJsonValue,
        },
      }));

    const provider = createEmailProvider({ purpose: input.purpose });
    const from = input.from || defaultFromForProvider(provider.name);
    if (!from) {
      await this.prisma.emailOutboundMessage.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastError: 'missing_from_address',
          provider: provider.name,
        },
      });
      throw new Error('missing_from_address');
    }

    const message: EmailSendMessage = {
      to: input.to,
      from,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html || `<pre>${escapeHtml(input.text)}</pre>`,
      text: input.text,
      tags: {
        purpose: input.purpose,
        organizationId: input.organizationId.slice(0, 32),
      },
    };

    try {
      const result = await provider.send(message);
      await this.prisma.emailOutboundMessage.update({
        where: { id: row.id },
        data: {
          status: 'SENT',
          provider: result.provider,
          providerMessageId: result.messageId || null,
          sentAt: new Date(),
          failedAt: null,
          lastError: null,
        },
      });
      this.logger.log(
        `[email:sent] purpose=${input.purpose} provider=${result.provider} org=${input.organizationId.slice(0, 8)}… to=${maskEmail(input.to)}`,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.emailOutboundMessage.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastError: msg.slice(0, 500),
          provider: provider.name,
        },
      });
      this.logger.error(
        `[email:fail] purpose=${input.purpose} provider=${provider.name} org=${input.organizationId.slice(0, 8)}… ${msg.slice(0, 160)}`,
      );
      throw err;
    }
  }
}

function maskEmail(email: string): string {
  const [u, d] = email.split('@');
  if (!d) return '•••';
  return `${(u || '').slice(0, 2)}…@${d}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
