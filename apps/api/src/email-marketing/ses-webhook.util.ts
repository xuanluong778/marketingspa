type SnsEnvelope = {
  Type?: string;
  Message?: string;
  SubscribeURL?: string;
  TopicArn?: string;
  UnsubscribeURL?: string;
};

type SesEventPayload = {
  notificationType?: string;
  eventType?: string;
  mail?: {
    messageId?: string;
    destination?: string[];
    tags?: Record<string, string[]>;
  };
  bounce?: {
    bounceType?: string;
    bouncedRecipients?: Array<{ emailAddress?: string }>;
  };
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>;
  };
  delivery?: {
    recipients?: string[];
  };
  click?: {
    link?: string;
  };
  subscription?: {
    newStatus?: string;
    source?: string;
  };
};

export type ParsedSesEventKind =
  | 'sns_confirm'
  | 'send'
  | 'delivery'
  | 'open'
  | 'click'
  | 'bounce'
  | 'complaint'
  | 'unsubscribe'
  | 'ignored';

export type ParsedSesEvent = {
  kind: ParsedSesEventKind;
  messageId?: string;
  recipientIds?: string[];
  campaignIds?: string[];
  emails?: string[];
  link?: string;
  permanent?: boolean;
  subscribeUrl?: string;
  rawType?: string;
};

function parseJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function tagValues(tags: Record<string, string[]> | undefined, key: string): string[] {
  if (!tags) return [];
  const match = Object.entries(tags).find(([k]) => k.toLowerCase() === key.toLowerCase());
  return [...new Set((match?.[1] ?? []).map((v) => String(v).trim()).filter(Boolean))];
}

function extractEmail(raw: string): string | null {
  const angle = raw.match(/<([^>]+)>/);
  const value = (angle?.[1] || raw).trim().toLowerCase();
  return value.includes('@') ? value : null;
}

function normalizeEventEmails(values: Array<string | undefined> | undefined, fallback: string[] = []): string[] {
  const out: string[] = [];
  for (const raw of [...(values ?? []), ...fallback]) {
    if (!raw) continue;
    const email = extractEmail(raw);
    if (email) out.push(email);
  }
  return [...new Set(out)];
}

export function parseSesWebhookPayload(input: unknown): ParsedSesEvent {
  const root = parseJson(input);
  if (!root) return { kind: 'ignored' };

  const type = String(root.Type || '');
  if (type === 'SubscriptionConfirmation') {
    return {
      kind: 'sns_confirm',
      subscribeUrl: typeof root.SubscribeURL === 'string' ? root.SubscribeURL : undefined,
      rawType: type,
    };
  }
  if (type === 'UnsubscribeConfirmation') {
    return { kind: 'ignored', rawType: type };
  }

  const inner = type === 'Notification' ? parseJson(root.Message) : root;
  if (!inner) return { kind: 'ignored', rawType: type || 'unknown' };

  const envelope = inner as unknown as SesEventPayload;
  const eventType = String(envelope.eventType || envelope.notificationType || '').toLowerCase();
  const messageId = envelope.mail?.messageId;
  const recipientIds = tagValues(envelope.mail?.tags, 'recipientId');
  const campaignIds = tagValues(envelope.mail?.tags, 'campaignId');
  const dest = envelope.mail?.destination ?? [];

  const base = { messageId, recipientIds, campaignIds, rawType: eventType };

  if (eventType === 'send') {
    return { kind: 'send', ...base, emails: normalizeEventEmails(dest) };
  }
  if (eventType === 'delivery') {
    return {
      kind: 'delivery',
      ...base,
      emails: normalizeEventEmails(envelope.delivery?.recipients, dest),
    };
  }
  if (eventType === 'open') {
    return { kind: 'open', ...base, emails: normalizeEventEmails(dest) };
  }
  if (eventType === 'click') {
    return {
      kind: 'click',
      ...base,
      emails: normalizeEventEmails(dest),
      link: envelope.click?.link,
    };
  }
  if (eventType === 'bounce') {
    return {
      kind: 'bounce',
      ...base,
      emails: normalizeEventEmails(
        envelope.bounce?.bouncedRecipients?.map((r) => r.emailAddress),
        dest,
      ),
      permanent: (envelope.bounce?.bounceType || '').toLowerCase() !== 'transient',
    };
  }
  if (eventType === 'complaint') {
    return {
      kind: 'complaint',
      ...base,
      emails: normalizeEventEmails(
        envelope.complaint?.complainedRecipients?.map((r) => r.emailAddress),
        dest,
      ),
      permanent: true,
    };
  }
  if (eventType === 'subscription' || eventType === 'unsubscribe') {
    return {
      kind: 'unsubscribe',
      ...base,
      emails: normalizeEventEmails(dest),
      permanent: true,
    };
  }
  return { kind: 'ignored', messageId, rawType: eventType || type };
}

export function isAllowedSnsSubscribeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('.amazonaws.com') && host.startsWith('sns.');
  } catch {
    return false;
  }
}

export function expectedSnsTopicMatches(topicArn?: string): boolean {
  const expected = expectedSnsTopicArn();
  if (!expected) return false;
  return Boolean(topicArn && topicArn === expected);
}

/** Required SNS topic ARN — fail-closed when unset. */
export function expectedSnsTopicArn(): string {
  return (process.env.SES_SNS_TOPIC_ARN || '').trim();
}

export function snsTopicArnFrom(input: unknown): string | undefined {
  const root = parseJson(input);
  return typeof root?.TopicArn === 'string' ? root.TopicArn : undefined;
}

export type { SnsEnvelope };
