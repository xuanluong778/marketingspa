/** Email multi-provider: SES (transactional) + Brevo (marketing) + SMTP fallback. */
export const EMAIL_PROVIDER_NAMES = ['ses', 'brevo', 'smtp'] as const;
export type EmailProviderName = (typeof EMAIL_PROVIDER_NAMES)[number];

export const EMAIL_SEND_PURPOSES = ['transactional', 'marketing'] as const;
export type EmailSendPurpose = (typeof EMAIL_SEND_PURPOSES)[number];

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
    const msg =
      provider === 'ses'
        ? 'Chưa cấu hình Amazon SES (AWS_REGION + credentials + SES_FROM_EMAIL).'
        : provider === 'brevo'
          ? 'Chưa cấu hình Brevo (BREVO_API_KEY + BREVO_FROM_EMAIL hoặc SES_FROM_EMAIL).'
          : 'Chưa cấu hình SMTP.';
    super(msg, { retryable: false, code: 'EMAIL_PROVIDER_NOT_CONFIGURED' });
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
  /invalid_parameter/i,
  /unauthorized/i,
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

export function brevoApiKeyConfigured(): boolean {
  return Boolean((process.env.BREVO_API_KEY || '').trim());
}

export function brevoFromEmail(): string {
  const raw = (process.env.BREVO_FROM_EMAIL || '').trim();
  if (!raw) {
    return (process.env.SES_FROM_EMAIL || process.env.SMTP_FROM || '').trim();
  }
  // Already "Name <email>" form
  if (/<[^>]+>/.test(raw)) return raw;
  const name = (process.env.BREVO_FROM_NAME || '').trim();
  return name ? `${name} <${raw}>` : raw;
}

export function brevoFromName(): string {
  return (process.env.BREVO_FROM_NAME || '').trim();
}

export function brevoIsConfigured(): boolean {
  return brevoApiKeyConfigured() && Boolean(brevoFromEmail());
}

/** Keys thiếu — không log giá trị secret. */
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

export function describeBrevoConfigGap(): string[] {
  const missing: string[] = [];
  if (!brevoApiKeyConfigured()) missing.push('BREVO_API_KEY');
  if (!brevoFromEmail()) missing.push('BREVO_FROM_EMAIL');
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

export function emailProviderStubEnabled(): boolean {
  return (process.env.EMAIL_PROVIDER_STUB || '').trim() === '1';
}

export function isEmailProviderConfigured(name: EmailProviderName): boolean {
  if (emailProviderStubEnabled()) return true;
  if (name === 'ses') return sesIsConfigured();
  if (name === 'brevo') return brevoIsConfigured();
  return smtpIsConfigured();
}

export const SES_SANDBOX_NOTE =
  'SES Sandbox/Under review: chỉ gửi tới email đã verify trong AWS SES; giới hạn ~200 email/ngày. Đây là giới hạn AWS, không phải lỗi code.';

function parseProviderName(raw: string): EmailProviderName | null {
  const v = raw.trim().toLowerCase();
  if (v === 'ses' || v === 'brevo' || v === 'smtp') return v;
  return null;
}

/** Preferred chain: transactional → SES; marketing → Brevo. */
export function preferredProvidersForPurpose(purpose: EmailSendPurpose): EmailProviderName[] {
  const purposeEnv =
    purpose === 'transactional'
      ? (process.env.EMAIL_TRANSACTIONAL_PROVIDER || '').trim()
      : (
          process.env.EMAIL_MARKETING_PROVIDER ||
          process.env.MARKETING_EMAIL_PROVIDER ||
          ''
        ).trim();
  const forcedPurpose = parseProviderName(purposeEnv);
  const legacyRaw = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const legacy = parseProviderName(legacyRaw);
  const legacyForcesSingle = Boolean(legacy && legacyRaw !== 'auto');

  const defaultPreferred: EmailProviderName =
    forcedPurpose || (purpose === 'transactional' ? 'ses' : 'brevo');

  // Dual-provider mode (auto / empty EMAIL_PROVIDER, or purpose-specific set):
  // transactional: SES → SMTP → Brevo
  // marketing: Brevo → SES → SMTP
  if (forcedPurpose || !legacyForcesSingle) {
    if (purpose === 'transactional') {
      return uniqueProviders([defaultPreferred, 'ses', 'smtp', 'brevo']);
    }
    return uniqueProviders([defaultPreferred, 'brevo', 'ses', 'smtp']);
  }

  // Legacy EMAIL_PROVIDER=ses|smtp|brevo forces that provider first,
  // but still allow dual when the preferred cloud provider for the purpose is configured.
  if (purpose === 'marketing' && brevoIsConfigured()) {
    return uniqueProviders(['brevo', legacy!, 'ses', 'smtp']);
  }
  if (purpose === 'transactional' && sesIsConfigured()) {
    return uniqueProviders(['ses', legacy!, 'smtp', 'brevo']);
  }
  return uniqueProviders([legacy!, defaultPreferred, 'ses', 'brevo', 'smtp']);
}

function uniqueProviders(list: EmailProviderName[]): EmailProviderName[] {
  const out: EmailProviderName[] = [];
  for (const p of list) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * Resolve provider for a send purpose.
 * Transactional ưu tiên SES; Marketing ưu tiên Brevo.
 */
export function resolveEmailProviderName(
  purpose: EmailSendPurpose = 'marketing',
): EmailProviderName {
  const chain = preferredProvidersForPurpose(purpose);
  for (const name of chain) {
    if (isEmailProviderConfigured(name)) return name;
  }
  return chain[0] || (purpose === 'transactional' ? 'ses' : 'brevo');
}

export type EmailProviderHealth = {
  requested: 'ses' | 'smtp' | 'brevo' | 'auto';
  resolved: EmailProviderName;
  transactional: EmailProviderName;
  marketing: EmailProviderName;
  configured: boolean;
  eventLoopConfigured: boolean;
  configurationSet: string | null;
  snsTopicArnConfigured: boolean;
  region: string | null;
  fromConfigured: boolean;
  brevoConfigured: boolean;
  missingEnv: string[];
  eventLoopMissingEnv: string[];
  sandboxNote: string | null;
};

export function getEmailProviderHealth(): EmailProviderHealth {
  const raw = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const requested =
    raw === 'smtp' || raw === 'ses' || raw === 'brevo' ? raw : 'auto';
  const transactional = resolveEmailProviderName('transactional');
  const marketing = resolveEmailProviderName('marketing');
  const resolved = marketing;
  const configured = isEmailProviderConfigured(resolved);
  const eventLoopMissingEnv = resolved === 'ses' ? describeSesEventLoopGap() : [];
  return {
    requested,
    resolved,
    transactional,
    marketing,
    configured,
    eventLoopConfigured: resolved === 'ses' ? sesEventLoopConfigured() : false,
    configurationSet: resolved === 'ses' ? sesConfigurationSetName() || null : null,
    snsTopicArnConfigured: resolved === 'ses' ? Boolean(sesSnsTopicArn()) : false,
    region: resolved === 'ses' ? sesRegion() : null,
    fromConfigured:
      resolved === 'ses'
        ? Boolean(sesFromEmail())
        : resolved === 'brevo'
          ? Boolean(brevoFromEmail())
          : smtpIsConfigured(),
    brevoConfigured: brevoIsConfigured(),
    missingEnv:
      resolved === 'ses'
        ? describeSesConfigGap()
        : resolved === 'brevo'
          ? describeBrevoConfigGap()
          : [],
    eventLoopMissingEnv,
    sandboxNote: resolved === 'ses' ? SES_SANDBOX_NOTE : null,
  };
}

export function formatEmailSendError(err: unknown, provider: EmailProviderName): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (provider === 'ses') {
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
  }
  if (provider === 'brevo' && /unauthorized|api.?key/i.test(raw)) {
    return 'Brevo API key không hợp lệ hoặc thiếu (BREVO_API_KEY).';
  }
  return raw;
}

export function sesNotConfiguredMessage(): string {
  const gap = describeSesConfigGap();
  const eventGap = describeSesEventLoopGap().filter(
    (k) => !describeSesConfigGap().includes(k),
  );
  const base =
    'Amazon SES chưa sẵn sàng. Thêm vào .env: AWS_REGION=ap-southeast-1, SES_FROM_EMAIL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_CONFIGURATION_SET, SES_SNS_TOPIC_ARN.';
  const parts = [...gap, ...eventGap];
  return parts.length ? `${base} Thiếu: ${parts.join(', ')}.` : base;
}

export function defaultFromForProvider(provider: EmailProviderName): string {
  if (provider === 'ses') return sesFromEmail();
  if (provider === 'brevo') return brevoFromEmail();
  return (process.env.SMTP_FROM || '').trim();
}
