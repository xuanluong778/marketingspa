'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { FunnelLeadDashboard } from '@/components/funnel/funnel-lead-dashboard';
import { useT } from '@/i18n/i18n-provider';

type LeadDetailDrawerProps = {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign?: () => void;
  onCreateAppointment?: () => void;
  onEdit?: () => void;
};

export function LeadDetailDrawer({
  leadId,
  open,
  onOpenChange,
  onEdit,
}: LeadDetailDrawerProps) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('crm.leadDetail')}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {leadId ? (
            <FunnelLeadDashboard
              leadId={leadId}
              compact
              onEdit={onEdit}
              onBack={() => onOpenChange(false)}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default LeadDetailDrawer;
