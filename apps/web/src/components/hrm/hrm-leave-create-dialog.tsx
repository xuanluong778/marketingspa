'use client';

type HrmLeaveCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string | null;
  balanceHint?: unknown;
  isPending?: boolean;
  onSubmit: (fd: FormData) => void;
};

export function HrmLeaveCreateDialog(_props: HrmLeaveCreateDialogProps) {
  return null;
}

export default HrmLeaveCreateDialog;
