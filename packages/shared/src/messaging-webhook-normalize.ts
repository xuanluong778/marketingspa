export type MessagingChannelCode = 'MESSENGER' | 'ZALO';

export type NormalizedWebhookEventType =
  'message' | 'follow' | 'unfollow' | 'delivery' | 'read' | 'unknown';

export type MessagingFollowStatusCode = 'UNKNOWN' | 'FOLLOWING' | 'UNFOLLOWED';

export interface NormalizedWebhookEvent {
  channel: MessagingChannelCode;
  accountRef: string;
  externalUserId: string;
  externalConversationId?: string;
  eventType: NormalizedWebhookEventType;
  direction: 'inbound' | 'outbound';
  text?: string;
  displayName?: string;
  avatarUrl?: string;
  isBlocked?: boolean;
  followStatus?: MessagingFollowStatusCode;
  providerMessageIds?: string[];
  timestamp: Date;
  rawEventKey: string;
}

export function normalizeMessengerWebhook(
  payload: unknown,
  accountRef: string,
): NormalizedWebhookEvent[] {
  const body = payload as {
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: number;
        message?: { mid?: string; text?: string; is_echo?: boolean };
        delivery?: { mids?: string[] };
        read?: { watermark?: number };
      }>;
    }>;
  };
  const events: NormalizedWebhookEvent[] = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const pageId = entry.id ?? accountRef;
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const m of messaging) {
      const senderId = m.sender?.id ?? '';
      const recipientId = m.recipient?.id ?? '';
      const isEcho = m.message?.is_echo === true;
      const externalUserId = isEcho ? recipientId : senderId;
      if (!externalUserId) continue;

      const ts = m.timestamp ? new Date(m.timestamp) : new Date();
      const mid = m.message?.mid ?? `delivery-${m.delivery?.mids?.[0] ?? ts.getTime()}`;

      if (m.message?.text !== undefined) {
        events.push({
          channel: 'MESSENGER',
          accountRef: pageId,
          externalUserId,
          externalConversationId: `${pageId}:${externalUserId}`,
          eventType: 'message',
          direction: isEcho ? 'outbound' : 'inbound',
          text: m.message.text,
          timestamp: ts,
          rawEventKey: `messenger:${pageId}:${mid}`,
        });
      } else if (m.delivery) {
        events.push({
          channel: 'MESSENGER',
          accountRef: pageId,
          externalUserId,
          eventType: 'delivery',
          direction: 'outbound',
          providerMessageIds: m.delivery.mids,
          timestamp: ts,
          rawEventKey: `messenger:${pageId}:delivery:${m.delivery.mids?.[0] ?? ts.getTime()}`,
        });
      } else if (m.read) {
        events.push({
          channel: 'MESSENGER',
          accountRef: pageId,
          externalUserId,
          eventType: 'read',
          direction: 'inbound',
          timestamp: ts,
          rawEventKey: `messenger:${pageId}:read:${m.read.watermark ?? ts.getTime()}`,
        });
      }
    }
  }
  return events;
}

const ZALO_USER_SEND_EVENTS = new Set([
  'user_send_text',
  'user_send_image',
  'user_send_file',
  'user_send_link',
  'user_send_audio',
  'user_send_video',
  'user_send_sticker',
  'user_send_location',
  'user_send_gif',
  'user_send_business_card',
  'user_send_list',
  'user_send_msgcare',
]);

const ZALO_OA_SEND_PREFIX = 'oa_send_';

function zaloAttachmentPlaceholder(eventName: string): string | undefined {
  if (eventName.includes('image')) return '[image]';
  if (eventName.includes('file')) return '[file]';
  if (eventName.includes('audio')) return '[audio]';
  if (eventName.includes('video')) return '[video]';
  if (eventName.includes('link')) return '[link]';
  if (eventName.includes('sticker')) return '[sticker]';
  if (eventName.includes('location')) return '[location]';
  if (eventName.includes('gif')) return '[gif]';
  return undefined;
}

export function normalizeZaloWebhook(
  payload: unknown,
  accountRef: string,
): NormalizedWebhookEvent[] {
  const body = payload as {
    oa_id?: string;
    event_name?: string;
    timestamp?: number | string;
    sender?: { id?: string; name?: string };
    recipient?: { id?: string };
    message?: {
      text?: string;
      msg_id?: string;
      msg_ids?: string[];
      attachments?: unknown[];
      href?: string;
      url?: string;
    };
    follower?: { id?: string };
  };
  const oaId = String(
    body.oa_id ??
      (body as { oaId?: string }).oaId ??
      body.recipient?.id ??
      (body as { recipient_id?: string }).recipient_id ??
      accountRef,
  );
  const events: NormalizedWebhookEvent[] = [];
  const tsNum = Number(body.timestamp);
  const ts = Number.isFinite(tsNum) && tsNum > 0 ? new Date(tsNum) : new Date();
  const eventName = String(body.event_name || '').trim();

  if (eventName === 'follow' || eventName === 'unfollow') {
    const userId = String(body.follower?.id || body.sender?.id || '').trim();
    if (!userId) return events;
    const isFollow = eventName === 'follow';
    events.push({
      channel: 'ZALO',
      accountRef: oaId,
      externalUserId: userId,
      eventType: isFollow ? 'follow' : 'unfollow',
      direction: 'inbound',
      followStatus: isFollow ? 'FOLLOWING' : 'UNFOLLOWED',
      timestamp: ts,
      rawEventKey: `zalo:${oaId}:${eventName}:${userId}:${ts.getTime()}`,
    });
    return events;
  }

  if (eventName === 'user_seen_message') {
    const userId = String(body.sender?.id || '').trim();
    if (!userId) return events;
    const msgIds = Array.isArray(body.message?.msg_ids)
      ? body.message!.msg_ids!.map((id) => String(id)).filter(Boolean)
      : [];
    const mid = String(body.message?.msg_id || msgIds[0] || '').trim();
    events.push({
      channel: 'ZALO',
      accountRef: oaId,
      externalUserId: userId,
      eventType: 'read',
      direction: 'inbound',
      providerMessageIds: msgIds.length ? msgIds : mid ? [mid] : undefined,
      timestamp: ts,
      rawEventKey: `zalo:${oaId}:seen:${userId}:${mid || ts.getTime()}`,
    });
    return events;
  }

  if (eventName === 'user_received_message') {
    const userId = String(body.sender?.id || body.recipient?.id || '').trim();
    if (!userId) return events;
    const msgIds = Array.isArray(body.message?.msg_ids)
      ? body.message!.msg_ids!.map((id) => String(id)).filter(Boolean)
      : [];
    const mid = String(body.message?.msg_id || msgIds[0] || '').trim();
    events.push({
      channel: 'ZALO',
      accountRef: oaId,
      externalUserId: userId,
      eventType: 'delivery',
      direction: 'outbound',
      providerMessageIds: msgIds.length ? msgIds : mid ? [mid] : undefined,
      timestamp: ts,
      rawEventKey: `zalo:${oaId}:received:${userId}:${mid || ts.getTime()}`,
    });
    return events;
  }

  const isUserSend =
    ZALO_USER_SEND_EVENTS.has(eventName) ||
    (!eventName && Boolean(body.message?.text || body.message?.msg_id));
  const isOaSend = eventName.startsWith(ZALO_OA_SEND_PREFIX);

  if (isUserSend || isOaSend) {
    const userId = String(
      isOaSend
        ? body.recipient?.id || body.sender?.id
        : body.sender?.id || (body as { user_id?: string }).user_id,
    ).trim();
    if (!userId) return events;
    const mid = String(body.message?.msg_id || '').trim();
    const text =
      typeof body.message?.text === 'string'
        ? body.message.text
        : typeof body.message?.href === 'string'
          ? body.message.href
          : typeof body.message?.url === 'string'
            ? body.message.url
            : zaloAttachmentPlaceholder(eventName);
    const sender = body.sender as
      | { id?: string; name?: string; display_name?: string; avatar?: string }
      | undefined;
    const displayName =
      String(sender?.name || sender?.display_name || '')
        .trim()
        .slice(0, 200) || undefined;
    const avatarUrl =
      String(sender?.avatar || '')
        .trim()
        .slice(0, 2000) || undefined;
    events.push({
      channel: 'ZALO',
      accountRef: oaId,
      externalUserId: userId,
      externalConversationId: `${oaId}:${userId}`,
      eventType: 'message',
      direction: isOaSend ? 'outbound' : 'inbound',
      text,
      displayName,
      avatarUrl,
      providerMessageIds: mid ? [mid] : undefined,
      timestamp: ts,
      rawEventKey: `zalo:${oaId}:${eventName || 'message'}:${mid || `${userId}:${ts.getTime()}`}`,
    });
  }

  return events;
}
