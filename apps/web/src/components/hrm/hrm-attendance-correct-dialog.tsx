'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ATTENDANCE_DAY_STATUS_OPTIONS,
  type AttendanceDayStatus,
  type CorrectAttendanceDayInput,
  type HrmAttendanceDay,
} from '@/types/hrm';

type HrmAttendanceCorrectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: HrmAttendanceDay | null;
  isPending?: boolean;
  onSubmit: (payload: CorrectAttendanceDayInput & { id: string }) => void;
};

function toLocalInputValue(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Dialog sửa ngày công — luôn export named + default để tránh bundle `undefined`. */
export function HrmAttendanceCorrectDialog({
  open,
  onOpenChange,
  day,
  isPending,
  onSubmit,
}: HrmAttendanceCorrectDialogProps) {
  const [checkInAt, setCheckInAt] = useState('');
  const [checkOutAt, setCheckOutAt] = useState('');
  const [status, setStatus] = useState<AttendanceDayStatus>('PRESENT');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open || !day) return;
    setCheckInAt(toLocalInputValue(day.checkInAt));
    setCheckOutAt(toLocalInputValue(day.checkOutAt));
    setStatus(day.status);
    setReason('');
  }, [open, day]);

  if (!day) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa ngày công</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Giờ vào</Label>
            <Input
              type="datetime-local"
              value={checkInAt}
              onChange={(e) => setCheckInAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Giờ ra</Label>
            <Input
              type="datetime-local"
              value={checkOutAt}
              onChange={(e) => setCheckOutAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Trạng thái</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceDayStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_DAY_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Lý do (bắt buộc)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: quên chấm công"
              minLength={3}
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={isPending || reason.trim().length < 3}
            onClick={() =>
              onSubmit({
                id: day.id,
                checkInAt: fromLocalInputValue(checkInAt),
                checkOutAt: fromLocalInputValue(checkOutAt),
                status,
                reason: reason.trim(),
              })
            }
          >
            {isPending ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HrmAttendanceCorrectDialog;
