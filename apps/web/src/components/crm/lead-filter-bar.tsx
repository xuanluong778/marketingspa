'use client';

export type LeadFilters = {
  search?: string;
  pipelineStatus?: string;
  pipelineStatusIn?: string;
  qualification?: string;
  qualificationIn?: string;
  leadSourceId?: string;
  assignedToId?: string;
  branchId?: string;
  createdFrom?: string;
  createdTo?: string;
  [key: string]: string | undefined;
};

export const EMPTY_LEAD_FILTERS: LeadFilters = {};

export function leadFiltersToQuery(filters: LeadFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '') out[k] = String(v);
  }
  return out;
}

type LeadFilterBarProps = {
  filters: LeadFilters;
  onChange: (filters: LeadFilters) => void;
  leadSources?: unknown[];
  branches?: unknown[];
  employees?: unknown[];
};

export function LeadFilterBar(_props: LeadFilterBarProps) {
  return null;
}

export default LeadFilterBar;
