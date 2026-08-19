'use client';

import { CUSTOMER_JOURNEY_STEPS } from '@marketingspa/shared';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import type { JourneyTimelineItem, CustomerJourneyStepKind } from '@/types/customer-journey';
import {
  MousePointerClick,
  FileInput,
  MessageCircle,
  UserPlus,
  GitBranch,
  BadgeDollarSign,
  CalendarCheck,
  MapPin,
  ShoppingBag,
  Check,
} from 'lucide-react';

const STEP_ICONS: Record<CustomerJourneyStepKind, typeof MousePointerClick> = {
  AD_CLICK: MousePointerClick,
  FORM_SUBMIT: FileInput,
  CHATBOT: MessageCircle,
  LEAD: UserPlus,
  STAGE_CHANGE: GitBranch,
  SALE: BadgeDollarSign,
  BOOKING: CalendarCheck,
  VISIT: MapPin,
  PURCHASE: ShoppingBag,
};

type Props = {
  timeline: JourneyTimelineItem[];
  stepsCompleted?: CustomerJourneyStepKind[];
  compact?: boolean;
};

export function CustomerJourneyTimeline({ timeline, stepsCompleted, compact }: Props) {
  const completed = new Set(stepsCompleted ?? timeline.map((t) => t.kind));
  const events = [...timeline].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2">
        {CUSTOMER_JOURNEY_STEPS.map((step) => {
          const done = completed.has(step.kind);
          const Icon = STEP_ICONS[step.kind];
          return (
            <li
              key={step.kind}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                done
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border bg-muted/50 text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3 w-3 text-primary" /> : <Icon className="h-3 w-3" />}
              {step.label}
            </li>
          );
        })}
      </ol>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có sự kiện trên hành trình.</p>
      ) : (
        <ol className={cn('relative', compact ? 'space-y-0' : 'pt-1')}>
          {events.map((event, idx) => {
            const Icon = STEP_ICONS[event.kind] ?? UserPlus;
            const isLast = idx === events.length - 1;
            return (
              <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                {!isLast && (
                  <div className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-0.5 bg-primary/30" />
                )}
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1 rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{event.label}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(event.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground/90">{event.title}</p>
                  {!compact && event.metadata ? (
                    <JourneyMetadata kind={event.kind} metadata={event.metadata} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function formExtrasFromJourney(timeline: JourneyTimelineItem[]) {
  const submit = [...timeline].reverse().find((t) => t.kind === 'FORM_SUBMIT');
  const meta = submit?.metadata ?? {};
  const rows: Array<{ label: string; value: string }> = [];
  if (meta.name) rows.push({ label: 'Họ tên', value: String(meta.name) });
  if (meta.phone) rows.push({ label: 'SĐT', value: String(meta.phone) });
  if (meta.email) rows.push({ label: 'Email', value: String(meta.email) });
  if (Array.isArray(meta.extra)) {
    for (const item of meta.extra) {
      if (!item || typeof item !== 'object') continue;
      const row = item as { label?: unknown; value?: unknown };
      if (row.label != null && row.value != null) {
        rows.push({ label: String(row.label), value: String(row.value) });
      }
    }
  }
  return { rows, formId: meta.formId ? String(meta.formId) : null };
}

function JourneyMetadata({
  kind,
  metadata,
}: {
  kind: CustomerJourneyStepKind;
  metadata: Record<string, unknown>;
}) {
  const rows: string[] = [];
  if (kind === 'FORM_SUBMIT') {
    if (metadata.name) rows.push(`Họ tên: ${metadata.name}`);
    if (metadata.phone) rows.push(`SĐT: ${metadata.phone}`);
    if (metadata.email) rows.push(`Email: ${metadata.email}`);
    const extra = metadata.extra;
    if (Array.isArray(extra)) {
      for (const item of extra) {
        if (!item || typeof item !== 'object') continue;
        const row = item as { label?: unknown; value?: unknown };
        if (row.label != null && row.value != null) {
          rows.push(`${String(row.label)}: ${String(row.value)}`);
        }
      }
    }
  }
  if (kind === 'AD_CLICK') {
    if (metadata.utmSource) rows.push(`UTM: ${metadata.utmSource}`);
    if (metadata.utmCampaign) rows.push(`Campaign: ${metadata.utmCampaign}`);
    if (metadata.fbclid) rows.push('fbclid ✓');
    if (metadata.gclid) rows.push('gclid ✓');
    if (metadata.landingPage) rows.push(String(metadata.landingPage).slice(0, 80));
  }
  if (kind === 'STAGE_CHANGE' && metadata.fromValue && metadata.toValue) {
    rows.push(`${metadata.fromValue} → ${metadata.toValue}`);
  }
  if (kind === 'SALE' && metadata.crossed) rows.push(String(metadata.crossed));
  if (kind === 'PURCHASE' && metadata.amount) rows.push(`₫${metadata.amount}`);

  if (!rows.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
      {rows.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
}
