'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
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
import { EMPLOYEE_POSITION_OPTIONS } from '@/types/appointments';
import {
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  type HrmEmployee,
  type HrmEmployeeInput,
  type HrmDepartment,
} from '@/types/hrm';
import { useCreateBranch } from '@/hooks/use-crm';
import { useHrmEmployeeMutations } from '@/hooks/use-hrm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: HrmEmployee;
  branches: { id: string; name: string }[];
  departments: HrmDepartment[];
  onSubmit: (data: HrmEmployeeInput) => void;
  isPending?: boolean;
}

export function HrmEmployeeFormDialog({
  open,
  onOpenChange,
  initial,
  branches,
  departments,
  onSubmit,
  isPending,
}: Props) {
  const createBranch = useCreateBranch();
  const { createDepartment } = useHrmEmployeeMutations();
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [form, setForm] = useState<HrmEmployeeInput>({
    name: '',
    phone: '',
    email: '',
    position: '',
    code: '',
    branchId: '',
    departmentId: '',
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initial?.name ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      position: initial?.position ?? '',
      code: initial?.code ?? '',
      branchId: initial?.branch?.id ?? initial?.branchId ?? '',
      departmentId: initial?.department?.id ?? initial?.departmentId ?? '',
      employmentType: initial?.employmentType ?? 'FULL_TIME',
      status: initial?.status ?? 'ACTIVE',
      startDate: initial?.startDate?.slice(0, 10) ?? '',
      address: initial?.address ?? '',
      legalIdNumber: initial?.legalIdNumber ?? '',
    });
  }, [open, initial]);

  const positionOptions = (() => {
    const list = [...EMPLOYEE_POSITION_OPTIONS] as string[];
    const current = form.position?.trim();
    if (current && !list.includes(current)) list.unshift(current);
    return list;
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initial ? 'Sửa nhân viên' : 'Thêm nhân viên'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit({
                ...form,
                phone: form.phone || undefined,
                email: form.email || undefined,
                position: form.position || undefined,
                code: form.code || undefined,
                branchId: form.branchId || undefined,
                departmentId: form.departmentId || undefined,
                startDate: form.startDate || undefined,
                address: form.address || undefined,
                legalIdNumber: form.legalIdNumber || undefined,
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Họ tên *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Mã NV</Label>
                <Input
                  value={form.code ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày vào</Label>
                <Input
                  type="date"
                  value={form.startDate ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>SĐT</Label>
                <Input
                  value={form.phone ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Chức vụ</Label>
                <Select
                  value={form.position || 'none'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, position: v === 'none' ? '' : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn chức vụ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {positionOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Loại hình</Label>
                <Select
                  value={form.employmentType ?? 'FULL_TIME'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, employmentType: v as HrmEmployeeInput['employmentType'] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Trạng thái</Label>
                <Select
                  value={form.status ?? 'ACTIVE'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, status: v as HrmEmployeeInput['status'] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Chi nhánh</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.branchId || 'none'}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, branchId: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger className="flex-1">
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
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setAddBranchOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Phòng ban</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.departmentId || 'none'}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, departmentId: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setAddDeptOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Địa chỉ</Label>
                <Input
                  value={form.address ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>CCCD/CMND</Label>
                <Input
                  value={form.legalIdNumber ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, legalIdNumber: e.target.value }))}
                />
              </div>
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

      <Dialog open={addBranchOpen} onOpenChange={setAddBranchOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm chi nhánh</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createBranch.mutate(
                { name: newBranchName.trim() },
                {
                  onSuccess: (b) => {
                    setForm((f) => ({ ...f, branchId: b.id }));
                    setNewBranchName('');
                    setAddBranchOpen(false);
                  },
                },
              );
            }}
          >
            <Input
              required
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="Tên chi nhánh"
            />
            <DialogFooter>
              <Button type="submit" disabled={createBranch.isPending}>
                Thêm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addDeptOpen} onOpenChange={setAddDeptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm phòng ban</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createDepartment.mutate(
                {
                  name: newDeptName.trim(),
                  branchId: form.branchId || undefined,
                },
                {
                  onSuccess: (d) => {
                    setForm((f) => ({ ...f, departmentId: d.id }));
                    setNewDeptName('');
                    setAddDeptOpen(false);
                  },
                },
              );
            }}
          >
            <Input
              required
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="Tên phòng ban"
            />
            <DialogFooter>
              <Button type="submit" disabled={createDepartment.isPending}>
                Thêm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
