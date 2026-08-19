import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import {
  EmailProviderError,
  EmailProviderNotConfiguredError,
  formatEmailSendError,
  isPermanentEmailError,
  sesConfigurationSetName,
  sesFromEmail,
  sesIsConfigured,
  sesRegion,
  type EmailProvider,
  type EmailSendMessage,
  type EmailSendResult,
} from '../email-provider';

function region() {
  return sesRegion();
}

function defaultFrom() {
  return sesFromEmail();
}

export class SesEmailProvider implements EmailProvider {
  readonly name = 'ses' as const;
  private client: SESv2Client | null = null;

  isConfigured(): boolean {
    return sesIsConfigured();
  }

  private getClient(): SESv2Client {
    if (this.client) return this.client;
    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
    this.client = new SESv2Client({
      region: region(),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
    return this.client;
  }

  async send(message: EmailSendMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) throw new EmailProviderNotConfiguredError('ses');
    const from = message.from || defaultFrom();
    if (!from) throw new EmailProviderNotConfiguredError('ses');
    const configurationSet = sesConfigurationSetName();
    if (!configurationSet) {
      throw new EmailProviderNotConfiguredError('ses');
    }
    try {
      const result = await this.getClient().send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [message.to] },
          ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
          ConfigurationSetName: configurationSet,
          EmailTags: message.tags
            ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value: String(Value).slice(0, 256) }))
            : undefined,
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: {
                Html: { Data: message.html, Charset: 'UTF-8' },
                ...(message.text
                  ? { Text: { Data: message.text, Charset: 'UTF-8' } }
                  : {}),
              },
              Headers: message.headers
                ? Object.entries(message.headers).map(([Name, Value]) => ({ Name, Value }))
                : undefined,
            },
          },
        }),
      );
      return { provider: 'ses', messageId: result.MessageId || '' };
    } catch (err) {
      throw new EmailProviderError(formatEmailSendError(err, 'ses'), {
        retryable: !isPermanentEmailError(err),
        code: (err as { name?: string })?.name || 'SES_SEND_FAILED',
      });
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
