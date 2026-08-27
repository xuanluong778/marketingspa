import type { CustomerJourneyStepKind } from '@marketingspa/shared';

export type { CustomerJourneyStepKind };

export interface JourneyTimelineItem {
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
}

export interface CustomerJourneyResponse {
  leadId: string;
  leadName: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  organizationId: string;
  funnelId: string | null;
  funnel?: { id: string; prompt: string; selectedSlug: string | null } | null;
  timeline: JourneyTimelineItem[];
  stepsCompleted: CustomerJourneyStepKind[];
}

export interface FunnelJourneySummary {
  funnel: { id: string; prompt: string; selectedSlug: string | null };
  leads: Array<{
    leadId: string;
    leadName: string;
    phone?: string | null;
    email?: string | null;
    note?: string | null;
    pipelineStatus: string;
    createdAt: string;
    stepsCompleted: CustomerJourneyStepKind[];
    lastStep: JourneyTimelineItem | null;
  }>;
}
