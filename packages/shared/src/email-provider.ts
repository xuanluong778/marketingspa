/** Amazon SES is the default campaign email provider. `smtp` is the fallback. */
export const EMAIL_PROVIDER_NAMES = ['ses', 'smtp'] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDER_NAMES)[number];

export function emailSendBatchSize(): number {
  return Math.min(50, Math.max(1, Number(process.env.EMAIL_SEND_BATCH_SIZE || 20) || 20));
}

export function emailSendRatePerSec(): number {
  return Math.max(1, Number(process.env.EMAIL_SEND_RATE_PER_SEC || 14) || 14);
}

export const EMAIL_SEND_ATTEMPTS = 8;
export const EMAIL_SEND_BACKOFF_MS = 2500;

export type EmailSendMessage = {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export type EmailSendResult = {
  provider: EmailProviderName;
  messageId: string;
};

export interface EmailProvider {
  readonly name: EmailProviderName;
  isConfigured(): boolean;
  send(message: EmailSendMessage): Promise<EmailSendResult>;
  sendBatch(messages: EmailSendMessage[]): Promise<EmailSendResult[]>;
}

export class EmailProviderError extends Error {
  retryable: boolean;
  code: string;

  constructor(message: string, opts?: { retryable?: boolean; code?: string }) {
    super(message);
    this.name = 'EmailProviderError';
    this.retryable = opts?.retryable ?? true;
    this.code = opts?.code || 'EMAIL_PROVIDER';
  }
}

export class EmailProviderNotConfiguredError extends EmailProviderError {
  constructor(provider: string) {
    super(
      provider === 'ses'
        ? 'Chưa cấu hình Amazon SES (AWS_REGION + credentials + SES_FROM_EMAIL).'
        : 'Chưa cấu hình SMTP.',
      { retryable: false, code: 'EMAIL_PROVIDER_NOT_CONFIGURED' },
    );
    this.name = 'EmailProviderNotConfiguredError';
  }
}

const PERMANENT_SES_CODES = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSendingPausedException',
  'InvalidParameterValue',
  'InvalidParameterValueException',
  'NotFoundException',
  'BadRequestException',
]);

const PERMANENT_MESSAGE = [
  /email address is not verified/i,
  /invalid.*address/i,
  /message rejected/i,
  /domain.*not verified/i,
  /sending paused/i,
  /account is in sandbox/i,
  /sandbox/i,
];

export function isPermanentEmailError(err: unknown): boolean {
  if (err instanceof EmailProviderError && !err.retryable) return true;
  if (err instanceof EmailProviderNotConfiguredError) return true;
  const name = err && typeof err === 'object' ? String((err as { name?: string }).name || '') : '';
  if (PERMANENT_SES_CODES.has(name)) return true;
  const code =
    err && typeof err === 'object'
      ? String((err as { Code?: string; code?: string }).Code || (err as { code?: string }).code || '')
      : '';
  if (PERMANENT_SES_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return PERMANENT_MESSAGE.some((re) => re.test(message));
}

export function smtpIsConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_HOST || '').trim() &&
      (process.env.SMTP_USER || '').trim() &&
      (process.env.SMTP_PASS || '').trim(),
  );
}

export function sesRegion(): string {
  return (
    process.env.AWS_REGION ||
    process.env.SES_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    'ap-southeast-1'
  ).trim();
}

export function sesFromEmail(): string {
  return (process.env.SES_FROM_EMAIL || '').trim();
}

export function sesConfigurationSetName(): string {
  return (process.env.SES_CONFIGURATION_SET || '').trim();
}

export function sesSnsTopicArn(): string {
  return (process.env.SES_SNS_TOPIC_ARN || '').trim();
}

/** Keys thiếu khi EMAIL_PROVIDER=ses — không log giá trị secret. */
export function describeSesConfigGap(): string[] {
  const missing: string[] = [];
  if (!(process.env.AWS_ACCESS_KEY_ID || '').trim() && !(process.env.AWS_PROFILE || '').trim()) {
    missing.push('AWS_ACCESS_KEY_ID');
  }
  if (!(process.env.AWS_SECRET_ACCESS_KEY || '').trim() && !(process.env.AWS_PROFILE || '').trim()) {
    missing.push('AWS_SECRET_ACCESS_KEY');
  }
  if (!sesFromEmail()) missing.push('SES_FROM_EMAIL');
  if (!sesRegion()) missing.push('AWS_REGION');
  return missing;
}

/** Marketing SES send + SNS webhook feedback loop — checked at runtime from process.env. */
export function describeSesEventLoopGap(): string[] {
  const missing = [...describeSesConfigGap()];
  if (!sesConfigurationSetName()) missing.push('SES_CONFIGURATION_SET');
  if (!sesSnsTopicArn()) missing.push('SES_SNS_TOPIC_ARN');
  return [...new Set(missing)];
}

export function sesEventLoopConfigured(): boolean {
  return sesIsConfigured() && Boolean(sesConfigurationSetName()) && Boolean(sesSnsTopicArn());
}

export function sesIsConfigured(): boolean {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const profile = (process.env.AWS_PROFILE || '').trim();
  const hasCreds = Boolean((accessKeyId && secretAccessKey) || profile);
  return Boolean(sesRegion() && sesFromEmail() && hasCreds);
}

export const SES_SANDBOX_NOTE =
  'SES Sandbox/Under review: chỉ gửi tới email đã verify trong AWS SES; giới hạn ~200 email/ngày. Đây là giới hạn AWS, không phải lỗi code.';

export type EmailProviderHealth = {
  requested: 'ses' | 'smtp' | 'auto';
  resolved: EmailProviderName;
  configured: boolean;
  eventLoopConfigured: boolean;
  configurationSet: string | null;
  snsTopicArnConfigured: boolean;
  region: string | null;
  fromConfigured: boolean;
  missingEnv: string[];
  eventLoopMissingEnv: string[];
  sandboxNote: string | null;
};

export function getEmailProviderHealth(): EmailProviderHealth {
  const raw = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const requested = raw === 'smtp' ? 'smtp' : raw === 'ses' ? 'ses' : 'auto';
  const resolved = resolveEmailProviderName();
  const configured = resolved === 'smtp' ? smtpIsConfigured() : sesIsConfigured();
  const eventLoopMissingEnv = resolved === 'ses' ? describeSesEventLoopGap() : [];
  return {
    requested,
    resolved,
    configured,
    eventLoopConfigured: resolved === 'ses' ? sesEventLoopConfigured() : false,
    configurationSet: resolved === 'ses' ? sesConfigurationSetName() || null : null,
    snsTopicArnConfigured: resolved === 'ses' ? Boolean(sesSnsTopicArn()) : false,
    region: resolved === 'ses' ? sesRegion() : null,
    fromConfigured: resolved === 'ses' ? Boolean(sesFromEmail()) : smtpIsConfigured(),
    missingEnv: resolved === 'ses' ? describeSesConfigGap() : [],
    eventLoopMissingEnv,
    sandboxNote: resolved === 'ses' ? SES_SANDBOX_NOTE : null,
  };
}

export function resolveEmailProviderName(): EmailProviderName {
  const raw = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (raw === 'smtp') return 'smtp';
  if (raw === 'ses') return 'ses';
  if (sesIsConfigured()) return 'ses';
  if (smtpIsConfigured()) return 'smtp';
  return 'ses';
}

export function formatEmailSendError(err: unknown, provider: EmailProviderName): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (provider !== 'ses') return raw;
  if (/credentials from any providers/i.test(raw)) {
    return `Thiếu AWS credentials (${describeSesConfigGap().join(', ') || 'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY'}).`;
  }
  if (
    /sandbox/i.test(raw) ||
    /email address is not verified/i.test(raw) ||
    /messagerejected/i.test(raw) ||
    /account is in sandbox/i.test(raw)
  ) {
    return `${raw} — ${SES_SANDBOX_NOTE}`;
  }
  return raw;
}

export function sesNotConfiguredMessage(): string {
  const gap = describeSesConfigGap();
  const eventGap = describeSesEventLoopGap().filter(
    (k) => !describeSesConfigGap().includes(k),
  );
  const base =
    'EMAIL_PROVIDER=ses nhưng Amazon SES chưa sẵn sàng. Thêm vào .env: AWS_REGION=ap-southeast-1, SES_FROM_EMAIL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_CONFIGURATION_SET, SES_SNS_TOPIC_ARN.';
  const parts = [...gap, ...eventGap];
  return parts.length ? `${base} Thiếu: ${parts.join(', ')}.` : base;
}
