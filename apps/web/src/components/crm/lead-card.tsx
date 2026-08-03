'use client';

import type { Lead } from '@/types/api';

/** Lead card shape used by kanban/list views. */
export type KanbanLead = Lead & { id: string };

type LeadCardProps = {
  lead?: KanbanLead;
  onOpen?: (lead: KanbanLead) => void;
};

export function LeadCard(_props: LeadCardProps) {
  return null;
}

export default LeadCard;
