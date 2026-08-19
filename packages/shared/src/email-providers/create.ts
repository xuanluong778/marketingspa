import type { EmailProvider } from '../email-provider';
import { resolveEmailProviderName, type EmailProviderName } from '../email-provider';
import { SesEmailProvider } from './ses';
import { SmtpEmailProvider } from './smtp';

let cached: EmailProvider | null = null;
let cachedName: EmailProviderName | null = null;

/** Factory — campaign/worker không phụ thuộc SES hay SMTP. */
export function createEmailProvider(): EmailProvider {
  const name = resolveEmailProviderName();
  if (cached && cachedName === name) return cached;
  cached = name === 'smtp' ? new SmtpEmailProvider() : new SesEmailProvider();
  cachedName = name;
  return cached;
}

export { SesEmailProvider } from './ses';
export { SmtpEmailProvider } from './smtp';
