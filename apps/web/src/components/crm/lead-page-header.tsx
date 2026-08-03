'use client';

type LeadPageHeaderProps = {
  kpis?: { total: number; newCount: number; booked: number; stale: number };
  onAdd?: () => void;
  onImport?: () => void;
  onExport?: () => void;
};

/** Contract stub — preserves current null UI until a stable restore is available. */
export function LeadPageHeader(_props: LeadPageHeaderProps) {
  return null;
}

export default LeadPageHeader;
