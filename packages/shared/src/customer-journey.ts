/** Prompt 13 — Customer Journey timeline (funnel-scoped) */

export type CustomerJourneyStepKind =
  | 'AD_CLICK'
  | 'FORM_SUBMIT'
  | 'CHATBOT'
  | 'LEAD'
  | 'STAGE_CHANGE'
  | 'SALE'
  | 'BOOKING'
  | 'VISIT'
  | 'PURCHASE';

export const CUSTOMER_JOURNEY_STEPS: Array<{ kind: CustomerJourneyStepKind; label: string }> = [
  { kind: 'AD_CLICK', label: 'Ad click' },
  { kind: 'FORM_SUBMIT', label: 'Form submit' },
  { kind: 'CHATBOT', label: 'Chatbot' },
  { kind: 'LEAD', label: 'Lead' },
  { kind: 'STAGE_CHANGE', label: 'Stage change' },
  { kind: 'SALE', label: 'Sale' },
  { kind: 'BOOKING', label: 'Booking' },
  { kind: 'VISIT', label: 'Visit' },
  { kind: 'PURCHASE', label: 'Purchase' },
];

export type JourneyTimelineItem = {
  id: string;
  kind: CustomerJourneyStepKind;
  label: string;
  title: string;
  occurredAt: string;
  organizationId: string;
  funnelId: string | null;
  leadId: string | null;
  source: 'funnel_event' | 'activity' | 'attribution' | 'chatbot';
  dedupeKey: string;
  metadata?: Record<string, unknown>;
};

export function funnelEventTypeToJourneyKind(eventType: string): CustomerJourneyStepKind | null {
  switch (eventType) {
    case 'AD_CLICK':
      return 'AD_CLICK';
    case 'FORM_SUBMIT':
      return 'FORM_SUBMIT';
    case 'CHATBOT':
      return 'CHATBOT';
    case 'LEAD_CREATED':
      return 'LEAD';
    case 'STAGE_CHANGED':
      return 'STAGE_CHANGE';
    case 'LEAD_QUALIFIED':
      return 'SALE';
    case 'APPOINTMENT_BOOKED':
    case 'APPOINTMENT_CONFIRMED':
      return 'BOOKING';
    case 'CUSTOMER_ARRIVED':
      return 'VISIT';
    case 'SERVICE_PURCHASED':
    case 'PAYMENT_COMPLETED':
      return 'PURCHASE';
    default:
      return null;
  }
}

export function activityActionToJourneyKind(action: string, metadata?: unknown): CustomerJourneyStepKind | null {
  const meta = metadata as { crossed?: string; eventType?: string; qualification?: string } | null;
  if (action === 'FORM_SUBMITTED') return 'FORM_SUBMIT';
  if (action === 'STATUS_CHANGED') return 'STAGE_CHANGE';
  if (action === 'MQL_REACHED' || action === 'SQL_REACHED' || action === 'SCORE_EVENT') {
    return 'SALE';
  }
  if (action === 'SCORE_CHANGED' && (meta?.crossed === 'MQL' || meta?.crossed === 'SQL' || meta?.qualification)) {
    return 'SALE';
  }
  if (action === 'CHATBOT_STARTED' || action === 'CHATBOT_REPLY') return 'CHATBOT';
  return null;
}

/** Merge timeline items — funnel_event wins; one item per journey kind */
export function mergeCustomerJourneyTimeline(items: JourneyTimelineItem[]): JourneyTimelineItem[] {
  const sourceRank: Record<JourneyTimelineItem['source'], number> = {
    funnel_event: 4,
    attribution: 3,
    chatbot: 2,
    activity: 1,
  };

  const byKey = new Map<string, JourneyTimelineItem>();
  for (const item of items) {
    const existing = byKey.get(item.dedupeKey);
    if (!existing || sourceRank[item.source] > sourceRank[existing.source]) {
      byKey.set(item.dedupeKey, item);
    }
  }

  const byKind = new Map<string, JourneyTimelineItem>();
  for (const item of byKey.values()) {
    const existing = byKind.get(item.kind);
    if (!existing || sourceRank[item.source] > sourceRank[existing.source]) {
      byKind.set(item.kind, item);
      continue;
    }
    if (
      sourceRank[item.source] === sourceRank[existing.source] &&
      new Date(item.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()
    ) {
      byKind.set(item.kind, item);
    }
  }

  return [...byKind.values()].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}

export function journeyStepLabel(kind: CustomerJourneyStepKind): string {
  return CUSTOMER_JOURNEY_STEPS.find((s) => s.kind === kind)?.label ?? kind;
}
