/** Brevo transactional webhook parse + event mapping (no secrets). */

export const BREVO_WEBHOOK_EVENTS = [
  'sent',
  'request',
  'delivered',
  'hardBounce',
  'softBounce',
  'blocked',
  'invalid',
  'spam',
  'complaint',
  'unsubscribed',
  'error',
  'opened',
  'uniqueOpened',
  'clicked',
  'click',
  'deferred',
] as const;

export type BrevoWebhookEventName = (typeof BREVO_WEBHOOK_EVENTS)[number];

export type BrevoWebhookKind =
  | 'sent'
  | 'delivered'
  | 'bounce_hard'
  | 'bounce_soft'
  | 'blocked'
  | 'invalid'
  | 'complaint'
  | 'unsubscribed'
  | 'error'
  | 'opened'
  | 'clicked'
  | 'deferred'
  | 'ignored';

export type ParsedBrevoWebhookEvent = {
  kind: BrevoWebhookKind;
  rawEvent: string;
  messageId: string | null;
  email: string | null;
  link: string | null;
  tsEvent: number | null;
  webhookId: string | null;
  tags: string[];
  campaignId: string | null;
  recipientId: string | null;
  /** Stable idempotency key — no PII beyond hashed/truncated ids */
  eventKey: string;
};

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      return [raw.trim()];
    }
  }
  return [];
}

function tagValue(tags: string[], prefix: string): string | null {
  const hit = tags.find((t) => t.startsWith(`${prefix}:`) || t.startsWith(`${prefix}=`));
  if (!hit) return null;
  const sep = hit.includes(':') ? ':' : '=';
  return hit.slice(hit.indexOf(sep) + 1).trim() || null;
}

export function normalizeBrevoMessageId(messageId: string | null | undefined): string | null {
  if (!messageId) return null;
  const raw = String(messageId).trim();
  if (!raw) return null;
  return raw.replace(/^<|>$/g, '').trim() || raw;
}

export function brevoMessageIdVariants(messageId: string | null | undefined): string[] {
  const norm = normalizeBrevoMessageId(messageId);
  if (!norm) return [];
  const withAngles = `<${norm}>`;
  return [...new Set([norm, withAngles, messageId!.trim()].filter(Boolean))];
}

export function mapBrevoEventKind(rawEvent: string): BrevoWebhookKind {
  const e = rawEvent.trim();
  switch (e) {
    case 'sent':
    case 'request':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'hardBounce':
      return 'bounce_hard';
    case 'softBounce':
      return 'bounce_soft';
    case 'blocked':
      return 'blocked';
    case 'invalid':
      return 'invalid';
    case 'spam':
    case 'complaint':
      return 'complaint';
    case 'unsubscribed':
      return 'unsubscribed';
    case 'error':
      return 'error';
    case 'opened':
    case 'uniqueOpened':
      return 'opened';
    case 'clicked':
    case 'click':
      return 'clicked';
    case 'deferred':
      return 'deferred';
    default:
      return 'ignored';
  }
}

/** Events that must suppress marketing re-sends. */
export function brevoKindRequiresSuppression(kind: BrevoWebhookKind): boolean {
  return (
    kind === 'bounce_hard' ||
    kind === 'invalid' ||
    kind === 'complaint' ||
    kind === 'unsubscribed'
  );
}

export function parseBrevoWebhookPayload(input: unknown): ParsedBrevoWebhookEvent {
  const body = asRecord(input);
  // Brevo may batch as { events: [...] } — caller should flatten; single-event here.
  const rawEvent = pickString(body, ['event', 'Event']) || 'ignored';
  const kind = mapBrevoEventKind(rawEvent);
  const messageId = pickString(body, ['message-id', 'messageId', 'message_id']);
  const email = pickString(body, ['email', 'Email']);
  const link = pickString(body, ['link', 'url']);
  const tsRaw = pickString(body, ['ts_event', 'ts', 'ts_epoch', 'date']);
  const tsEvent = tsRaw && /^\d+$/.test(tsRaw) ? Number(tsRaw) : null;
  const webhookId = pickString(body, ['id', 'webhook_id']);
  const tags = normalizeTags(body.tags ?? body.tag);
  let campaignId =
    tagValue(tags, 'campaignId') ||
    tagValue(tags, 'campaign_id') ||
    pickString(body, ['campaignId', 'campaign_id']);
  let recipientId =
    tagValue(tags, 'recipientId') ||
    tagValue(tags, 'recipient_id') ||
    pickString(body, ['recipientId', 'recipient_id']);

  const custom = pickString(body, ['X-Mailin-custom', 'x-mailin-custom']);
  if (custom) {
    try {
      const parsed = JSON.parse(custom) as Record<string, unknown>;
      if (!campaignId && typeof parsed.campaignId === 'string') campaignId = parsed.campaignId;
      if (!recipientId && typeof parsed.recipientId === 'string') recipientId = parsed.recipientId;
    } catch {
      /* ignore */
    }
  }

  const midNorm = normalizeBrevoMessageId(messageId) || 'none';
  const dateFallback = pickString(body, ['date']) || 'na';
  const eventKey = [
    'brevo',
    midNorm,
    kind,
    String(tsEvent ?? webhookId ?? dateFallback),
    (email || '').toLowerCase().slice(0, 3) || 'x',
  ].join(':');

  return {
    kind,
    rawEvent,
    messageId: messageId ? messageId.trim() : null,
    email: email ? email.toLowerCase() : null,
    link,
    tsEvent,
    webhookId,
    tags,
    campaignId,
    recipientId,
    eventKey: eventKey.slice(0, 240),
  };
}

export function flattenBrevoWebhookBodies(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  const body = asRecord(input);
  if (Array.isArray(body.events)) return body.events;
  return [input];
}
