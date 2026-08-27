import {
  emailProviderStubEnabled,
  resolveEmailProviderName,
  type EmailProvider,
  type EmailProviderName,
  type EmailSendMessage,
  type EmailSendPurpose,
  type EmailSendResult,
} from '../email-provider';
import { BrevoEmailProvider } from './brevo';
import { SesEmailProvider } from './ses';
import { SmtpEmailProvider } from './smtp';

class StubEmailProvider implements EmailProvider {
  constructor(readonly name: EmailProviderName) {}
  isConfigured(): boolean {
    return true;
  }
  async send(_message: EmailSendMessage): Promise<EmailSendResult> {
    return {
      provider: this.name,
      messageId: `stub-${this.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
  async sendBatch(messages: EmailSendMessage[]): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = [];
    for (const message of messages) {
      results.push(await this.send(message));
    }
    return results;
  }
}

const cache = new Map<string, EmailProvider>();

function instantiate(name: EmailProviderName): EmailProvider {
  if (emailProviderStubEnabled()) return new StubEmailProvider(name);
  if (name === 'brevo') return new BrevoEmailProvider();
  if (name === 'smtp') return new SmtpEmailProvider();
  return new SesEmailProvider();
}

export type CreateEmailProviderOptions = {
  /** transactional → SES ưu tiên; marketing → Brevo ưu tiên. Default marketing. */
  purpose?: EmailSendPurpose;
};

/** Factory — campaign/worker/auth không phụ thuộc trực tiếp SES/Brevo/SMTP. */
export function createEmailProvider(opts?: CreateEmailProviderOptions): EmailProvider {
  const purpose: EmailSendPurpose = opts?.purpose ?? 'marketing';
  const name = resolveEmailProviderName(purpose);
  const cacheKey = `${purpose}:${name}:stub=${emailProviderStubEnabled() ? '1' : '0'}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const provider = instantiate(name);
  cache.set(cacheKey, provider);
  return provider;
}

/** Test helper — clear factory cache between cases. */
export function resetEmailProviderCache(): void {
  cache.clear();
}

export { SesEmailProvider } from './ses';
export { SmtpEmailProvider } from './smtp';
export { BrevoEmailProvider } from './brevo';
