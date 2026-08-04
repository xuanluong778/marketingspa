'use client';

import { useState } from 'react';
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
import type { Lead } from '@/types/api';
import type { CreateAppointmentInput } from '@/types/crm';

interface AppointmentFromLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  branches: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  onSubmit: (data: CreateAppointmentInput) => void;
  isPending?: boolean;
}

export function AppointmentFromLeadDialog({
  open,
  onOpenChange,
  lead,
  branches,
  employees,
  onSubmit,
  isPending,
}: AppointmentFromLeadDialogProps) {
  const defaultBranch = lead.branch?.id ?? branches[0]?.id ?? '';
  const [form, setForm] = useState({
    branchId: defaultBranch,
    employeeId: lead.assignedTo?.id ?? '',
    scheduledAt: '',
    durationMinutes: '60',
    note: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.branchId || !form.scheduledAt) return;
    onSubmit({
      branchId: form.branchId,
      leadId: lead.id,
      customerId: lead.customer?.id,
      employeeId: form.employeeId || undefined,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      durationMinutes: Number(form.durationMinutes) || 60,
      note: form.note || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo lịch hẹn — {lead.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label>Nhân viên</Label>
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
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isPending || !form.branchId}>
              {isPending ? 'Đang tạo...' : 'Tạo lịch hẹn'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
