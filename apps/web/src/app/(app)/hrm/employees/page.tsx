'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { HrmEmployeeFormDialog } from '@/components/hrm/hrm-employee-form-dialog';
import { useBranches } from '@/hooks/use-crm';
import { useHrmDepartments, useHrmEmployeeMutations, useHrmEmployees } from '@/hooks/use-hrm';
import {
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  type EmployeeStatus,
  type EmploymentType,
  type HrmEmployee,
} from '@/types/hrm';
import { ROLE_OPTIONS } from '@/types/appointments';

function roleLabel(code?: string) {
  return ROLE_OPTIONS.find((r) => r.value === code)?.label ?? code ?? '—';
}

export default function HrmEmployeesPage() {
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HrmEmployee | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const filters = {
    q: q.trim() || undefined,
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    status: status || undefined,
    employmentType: employmentType || undefined,
  };

  const { data, isLoading, isError, refetch } = useHrmEmployees(filters);
  const { data: branches } = useBranches();
  const { data: departments } = useHrmDepartments();
  const mutations = useHrmEmployeeMutations();

  const branchList = Array.isArray(branches) ? branches : [];
  const deptList = Array.isArray(departments) ? departments : [];

  return (
    <div>
      <PageHeader title="Quản Lý Nhân Sự" description="Hồ sơ, tài khoản, hợp đồng và tài liệu">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Thêm nhân viên
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 lg:col-span-2">
          <Label className="text-xs">Tìm kiếm</Label>
          <Input
            placeholder="Tên, SĐT, email, mã NV, chức vụ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chi nhánh</Label>
          <Select value={branchId || 'all'} onValueChange={(v) => setBranchId(v === 'all' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {branchList.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phòng ban</Label>
          <Select
            value={departmentId || 'all'}
            onValueChange={(v) => setDepartmentId(v === 'all' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {deptList.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trạng thái</Label>
          <Select
            value={status || 'all'}
            onValueChange={(v) => setStatus(v === 'all' ? '' : (v as EmployeeStatus))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {EMPLOYEE_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Loại HĐ lao động</Label>
          <Select
            value={employmentType || 'all'}
            onValueChange={(v) =>
              setEmploymentType(v === 'all' ? '' : (v as EmploymentType))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {EMPLOYMENT_TYPE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        data={data?.items}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        emptyTitle="Chưa có nhân viên"
        getRowKey={(r) => r.id}
        columns={[
          {
            key: 'name',
            header: 'Nhân viên',
            cell: (r) => (
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.code ?? '—'}</div>
              </div>
            ),
          },
          { key: 'phone', header: 'SĐT', cell: (r) => r.phone ?? '—' },
          { key: 'position', header: 'Chức vụ', cell: (r) => r.position ?? '—' },
          { key: 'branch', header: 'Chi nhánh', cell: (r) => r.branch?.name ?? '—' },
          { key: 'department', header: 'Phòng ban', cell: (r) => r.department?.name ?? '—' },
          {
            key: 'status',
            header: 'Trạng thái',
            cell: (r) => (
              <StatusBadge
                status={
                  EMPLOYEE_STATUS_OPTIONS.find((s) => s.value === r.status)?.label ??
                  r.status ??
                  '—'
                }
              />
            ),
          },
          {
            key: 'role',
            header: 'Tài khoản',
            cell: (r) =>
              r.user?.role ? <StatusBadge status={roleLabel(r.user.role.code)} /> : 'Chưa tạo',
          },
          {
            key: 'actions',
            header: '',
            className: 'w-[140px]',
            cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link href={`/hrm/employees/${r.id}`} title="Hồ sơ">
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeactivateId(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <HrmEmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing ?? undefined}
        branches={branchList}
        departments={deptList}
        isPending={mutations.create.isPending || mutations.update.isPending}
        onSubmit={(formData) => {
          if (editing) {
            mutations.update.mutate(
              { id: editing.id, ...formData },
              { onSuccess: () => setFormOpen(false) },
            );
          } else {
            mutations.create.mutate(formData, { onSuccess: () => setFormOpen(false) });
          }
        }}
      />

      <ConfirmDialog
        open={!!deactivateId}
        onOpenChange={(o) => !o && setDeactivateId(null)}
        title="Ngưng hoạt động nhân viên?"
        description="Nhân viên sẽ chuyển sang trạng thái Đã nghỉ (TERMINATED)."
        confirmLabel="Xác nhận"
        destructive
        isPending={mutations.deactivate.isPending}
        onConfirm={() =>
          deactivateId &&
          mutations.deactivate.mutate(deactivateId, {
            onSuccess: () => setDeactivateId(null),
          })
        }
      />
    </div>
  );
}
