'use client';

import type { CorrectAttendanceDayInput } from '@/types/hrm';

type HrmAttendanceCorrectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: { id: string } | null;
  isPending?: boolean;
  onSubmit: (payload: CorrectAttendanceDayInput & { id: string }) => void;
};

export function HrmAttendanceCorrectDialog(_props: HrmAttendanceCorrectDialogProps) {
  return null;
}

export default HrmAttendanceCorrectDialog;
