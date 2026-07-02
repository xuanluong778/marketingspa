'use client';

import { useState, useEffect } from 'react';
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
import { ROLE_OPTIONS, type EmployeeDetail } from '@/types/appointments';
import type { EmployeeInput } from '@/hooks/use-employees';

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: EmployeeDetail;
  branches: { id: string; name: string }[];
  onSubmit: (data: EmployeeInput) => void;
  isPending?: boolean;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  initial,
  branches,
  onSubmit,
  isPending,
}: EmployeeFormDialogProps) {
  const [form, setForm] = useState<EmployeeInput>(() => ({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    position: initial?.position ?? '',
    branchId: initial?.branch?.id ?? '',
    roleCode: initial?.user?.role?.code ?? '',
  }));

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        phone: initial?.phone ?? '',
        email: initial?.email ?? '',
        position: initial?.position ?? '',
        branchId: initial?.branch?.id ?? '',
        roleCode: initial?.user?.role?.code ?? '',
      });
    }
  }, [open, initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      phone: form.phone || undefined,
      email: form.email || undefined,
      position: form.position || undefined,
      branchId: form.branchId || undefined,
      roleCode: form.roleCode || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa nhân viên' : 'Thêm nhân viên'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Họ tên *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>SĐT</Label>
              <Input
                value={form.phone ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Chức vụ</Label>
            <Input
              value={form.position ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Chi nhánh</Label>
              <Select
                value={form.branchId || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === 'none' ? '' : v }))}
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
            <div className="space-y-2">
              <Label>Vai trò</Label>
              <Select
                value={form.roleCode || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, roleCode: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Vai trò áp dụng khi nhân viên đã có tài khoản đăng nhập.
          </p>
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
