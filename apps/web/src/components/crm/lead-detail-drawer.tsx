'use client';

type LeadDetailDrawerProps = {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign?: () => void;
  onCreateAppointment?: () => void;
  onEdit?: () => void;
};

export function LeadDetailDrawer(_props: LeadDetailDrawerProps) {
  return null;
}

export default LeadDetailDrawer;
