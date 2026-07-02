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
import type { CreateCustomerInput, CustomerDetail } from '@/types/crm';

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CustomerDetail;
  leadSources?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
  onSubmit: (data: CreateCustomerInput) => void;
  isPending?: boolean;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  initial,
  leadSources = [],
  branches = [],
  onSubmit,
  isPending,
}: CustomerFormDialogProps) {
  const [form, setForm] = useState<CreateCustomerInput>(() => ({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    note: initial?.note ?? '',
    tags: initial?.tags ?? [],
    leadSourceId: initial?.leadSource?.id ?? '',
    branchId: initial?.branch?.id ?? '',
  }));

  function update(field: keyof CreateCustomerInput, value: string | string[]) {
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
      tags: form.tags?.filter(Boolean),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa khách hàng' : 'Thêm khách hàng'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Họ tên *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">SĐT</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nguồn khách</Label>
              <Select
                value={form.leadSourceId || 'none'}
                onValueChange={(v) => update('leadSourceId', v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nguồn" />
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
                  <SelectValue placeholder="Chọn chi nhánh" />
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
            <Label htmlFor="tags">Tags (phân cách bằng dấu phẩy)</Label>
            <Input
              id="tags"
              value={form.tags?.join(', ') ?? ''}
              onChange={(e) =>
                update(
                  'tags',
                  e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
              placeholder="VIP, da liễu"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              value={form.note ?? ''}
              onChange={(e) => update('note', e.target.value)}
              rows={3}
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
