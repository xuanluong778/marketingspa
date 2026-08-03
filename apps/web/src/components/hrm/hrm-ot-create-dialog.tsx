'use client';

type HrmOtCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string | null;
  branchId?: string | null;
  isPending?: boolean;
  onSubmit: (body: {
    employeeId?: string;
    branchId?: string;
    workDate: string;
    startAt: string;
    endAt: string;
    breakMinutes?: number;
    reason?: string;
  }) => void;
};

export function HrmOtCreateDialog(_props: HrmOtCreateDialogProps) {
  return null;
}

export default HrmOtCreateDialog;
