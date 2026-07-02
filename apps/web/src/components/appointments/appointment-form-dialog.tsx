'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import type { AppointmentDetail, CreateAppointmentInput } from '@/types/appointments';
import type { SpaService } from '@/types/appointments';

interface AppointmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AppointmentDetail;
  branches: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  services: SpaService[];
  customers: { id: string; name: string; phone?: string | null }[];
  onSubmit: (data: CreateAppointmentInput) => void;
  isPending?: boolean;
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  initial,
  branches,
  employees,
  services,
  customers,
  onSubmit,
  isPending,
}: AppointmentFormDialogProps) {
  const [form, setForm] = useState<CreateAppointmentInput>(() => ({
    branchId: initial?.branch?.id ?? branches[0]?.id ?? '',
    customerId: initial?.customer?.id ?? '',
    employeeId: initial?.employee?.id ?? '',
    serviceId: initial?.service?.id ?? '',
    scheduledAt: initial?.scheduledAt ? toLocalDatetime(initial.scheduledAt) : '',
    durationMinutes: initial?.durationMinutes ?? 60,
    note: initial?.note ?? '',
  }));

  useEffect(() => {
    if (open) {
      setForm({
        branchId: initial?.branch?.id ?? branches[0]?.id ?? '',
        customerId: initial?.customer?.id ?? '',
        employeeId: initial?.employee?.id ?? '',
        serviceId: initial?.service?.id ?? '',
        scheduledAt: initial?.scheduledAt ? toLocalDatetime(initial.scheduledAt) : '',
        durationMinutes: initial?.durationMinutes ?? 60,
        note: initial?.note ?? '',
      });
    }
  }, [open, initial, branches]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.branchId || !form.scheduledAt) return;
    onSubmit({
      ...form,
      customerId: form.customerId || undefined,
      employeeId: form.employeeId || undefined,
      serviceId: form.serviceId || undefined,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa lịch hẹn' : 'Tạo lịch hẹn mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Khách hàng</Label>
            <Select
              value={form.customerId || 'none'}
              onValueChange={(v) => setForm((f) => ({ ...f, customerId: v === 'none' ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn khách" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Chưa chọn —</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Chi nhánh *</Label>
              <Select
                value={form.branchId}
                onValueChange={(v) => setForm((f) => ({ ...f, branchId: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>NV tư vấn</Label>
              <Select
                value={form.employeeId || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Dịch vụ</Label>
            <Select
              value={form.serviceId || 'none'}
              onValueChange={(v) => {
                const svc = services.find((s) => s.id === v);
                setForm((f) => ({
                  ...f,
                  serviceId: v === 'none' ? '' : v,
                  durationMinutes: svc?.durationMinutes ?? f.durationMinutes,
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Thời gian *</Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Thời lượng (phút)</Label>
              <Input
                type="number"
                min={15}
                step={15}
                value={form.durationMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={form.note ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isPending || !form.branchId}>
              {isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
