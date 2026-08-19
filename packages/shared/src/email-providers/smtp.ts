import nodemailer from 'nodemailer';
import {
  EmailProviderError,
  EmailProviderNotConfiguredError,
  smtpIsConfigured,
  type EmailProvider,
  type EmailSendMessage,
  type EmailSendResult,
} from '../email-provider';

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp' as const;

  isConfigured(): boolean {
    return smtpIsConfigured();
  }

  async send(message: EmailSendMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) throw new EmailProviderNotConfiguredError('smtp');
    const host = (process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || '587');
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    try {
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
      });
      return { provider: 'smtp', messageId: String(info.messageId || '') };
    } catch (err) {
      throw new EmailProviderError(err instanceof Error ? err.message : String(err), {
        retryable: true,
        code: 'SMTP_SEND_FAILED',
      });
    } finally {
      transporter.close();
    }
  }

  async sendBatch(messages: EmailSendMessage[]): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = [];
    for (const message of messages) {
      results.push(await this.send(message));
    }
    return results;
  }
}
