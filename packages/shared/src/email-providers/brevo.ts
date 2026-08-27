import {
  EmailProviderError,
  EmailProviderNotConfiguredError,
  brevoFromEmail,
  brevoIsConfigured,
  formatEmailSendError,
  isPermanentEmailError,
  type EmailProvider,
  type EmailSendMessage,
  type EmailSendResult,
} from '../email-provider';

function parseFrom(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m?.[1] != null && m[2]) {
    const name = m[1].replace(/^["']|["']$/g, '').trim();
    return { email: m[2].trim(), name: name || undefined };
  }
  return { email: from.trim() };
}

/**
 * Brevo (Sendinblue) transactional SMTP API.
 * Docs: POST https://api.brevo.com/v3/smtp/email
 * Không log API key.
 */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo' as const;

  isConfigured(): boolean {
    return brevoIsConfigured();
  }

  async send(message: EmailSendMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) throw new EmailProviderNotConfiguredError('brevo');
    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    const fromRaw = message.from || brevoFromEmail();
    if (!fromRaw) throw new EmailProviderNotConfiguredError('brevo');
    const sender = parseFrom(fromRaw);
    // Prefer explicit BREVO_FROM_NAME when from is bare email
    if (!sender.name) {
      const n = (process.env.BREVO_FROM_NAME || '').trim();
      if (n) sender.name = n;
    }
    const reply = message.replyTo ? parseFrom(message.replyTo) : undefined;

    const body: Record<string, unknown> = {
      sender: sender.name ? { email: sender.email, name: sender.name } : { email: sender.email },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      ...(message.text ? { textContent: message.text } : {}),
      ...(reply ? { replyTo: { email: reply.email, ...(reply.name ? { name: reply.name } : {}) } } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
      ...(message.tags
        ? { tags: Object.entries(message.tags).map(([k, v]) => `${k}:${String(v)}`.slice(0, 50)) }
        : {}),
    };

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messageId?: string;
        message?: string;
        code?: string;
      };
      if (!res.ok) {
        const msg = formatEmailSendError(
          new Error(json.message || `Brevo HTTP ${res.status}`),
          'brevo',
        );
        throw new EmailProviderError(msg, {
          retryable: res.status >= 500 || res.status === 429,
          code: json.code || `BREVO_HTTP_${res.status}`,
        });
      }
      return { provider: 'brevo', messageId: String(json.messageId || '') };
    } catch (err) {
      if (err instanceof EmailProviderError) throw err;
      throw new EmailProviderError(formatEmailSendError(err, 'brevo'), {
        retryable: !isPermanentEmailError(err),
        code: 'BREVO_SEND_FAILED',
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
