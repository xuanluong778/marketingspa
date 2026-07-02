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
import type { CreateLeadInput } from '@/types/crm';
import type { Lead } from '@/types/api';

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Lead;
  leadSources?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
  employees?: { id: string; name: string }[];
  onSubmit: (data: CreateLeadInput) => void;
  isPending?: boolean;
}

export function LeadFormDialog({
  open,
  onOpenChange,
  initial,
  leadSources = [],
  branches = [],
  employees = [],
  onSubmit,
  isPending,
}: LeadFormDialogProps) {
  const [form, setForm] = useState<CreateLeadInput>(() => ({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    note: initial?.note ?? '',
    leadSourceId: initial?.leadSource?.id ?? '',
    branchId: initial?.branch?.id ?? '',
    assignedToId: initial?.assignedTo?.id ?? '',
    estimatedValue: initial?.estimatedValue ?? undefined,
  }));

  function update(field: keyof CreateLeadInput, value: string | number | undefined) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      phone: form.phone || undefined,
      email: form.email || undefined,
      leadSourceId: form.leadSourceId || undefined,
      branchId: form.branchId || undefined,
      assignedToId: form.assignedToId || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa lead' : 'Thêm lead mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lead-name">Họ tên *</Label>
            <Input
              id="lead-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>SĐT</Label>
              <Input value={form.phone ?? ''} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => update('email', e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nguồn</Label>
              <Select
                value={form.leadSourceId || 'none'}
                onValueChange={(v) => update('leadSourceId', v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {leadSources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chi nhánh</Label>
              <Select
                value={form.branchId || 'none'}
                onValueChange={(v) => update('branchId', v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Phụ trách</Label>
            <Select
              value={form.assignedToId || 'none'}
              onValueChange={(v) => update('assignedToId', v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhân viên" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Chưa gán</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={form.note ?? ''}
              onChange={(e) => update('note', e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
