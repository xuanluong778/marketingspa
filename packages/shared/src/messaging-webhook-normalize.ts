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
  for (const entry of body.entry ?? []) {
    const pageId = entry.id ?? accountRef;
    for (const m of entry.messaging ?? []) {
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

export function normalizeZaloWebhook(
  payload: unknown,
  accountRef: string,
): NormalizedWebhookEvent[] {
  const body = payload as {
    oa_id?: string;
    event_name?: string;
    timestamp?: number;
    sender?: { id?: string; name?: string };
    message?: { text?: string; msg_id?: string };
    follower?: { id?: string };
  };
  const oaId = body.oa_id ?? accountRef;
  const events: NormalizedWebhookEvent[] = [];
  const ts = body.timestamp ? new Date(body.timestamp) : new Date();
  const userId = body.sender?.id ?? body.follower?.id;
  if (!userId) return events;

  if (body.event_name === 'user_send_text' || body.message?.text) {
    events.push({
      channel: 'ZALO',
      accountRef: oaId,
      externalUserId: userId,
      externalConversationId: `${oaId}:${userId}`,
      eventType: 'message',
      direction: 'inbound',
      text: body.message?.text,
      displayName: body.sender?.name,
      timestamp: ts,
      rawEventKey: `zalo:${oaId}:${body.message?.msg_id ?? `${userId}:${ts.getTime()}`}`,
    });
  } else if (body.event_name === 'follow') {
    events.push({
      channel: 'ZALO',
      accountRef: oaId,
      externalUserId: userId,
      eventType: 'follow',
      direction: 'inbound',
      followStatus: 'FOLLOWING',
      timestamp: ts,
      rawEventKey: `zalo:${oaId}:follow:${userId}:${ts.getTime()}`,
    });
  } else if (body.event_name === 'unfollow') {
    events.push({
      channel: 'ZALO',
      accountRef: oaId,
      externalUserId: userId,
      eventType: 'unfollow',
      direction: 'inbound',
      followStatus: 'UNFOLLOWED',
      timestamp: ts,
      rawEventKey: `zalo:${oaId}:unfollow:${userId}:${ts.getTime()}`,
    });
  }
  return events;
}
