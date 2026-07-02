'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { EmployeeFormDialog } from '@/components/employees/employee-form-dialog';
import { EmployeePerformancePanel } from '@/components/employees/employee-performance-panel';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useEmployees } from '@/hooks/use-queries';
import { useBranches } from '@/hooks/use-crm';
import { useCreateEmployee, useUpdateEmployee, useDeleteEmployee } from '@/hooks/use-employees';
import { ROLE_OPTIONS, type EmployeeDetail } from '@/types/appointments';

function roleLabel(code?: string) {
  return ROLE_OPTIONS.find((r) => r.value === code)?.label ?? code ?? '—';
}

export default function EmployeesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeDetail | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [performanceEmployee, setPerformanceEmployee] = useState<EmployeeDetail | null>(null);

  const { data, isLoading, isError, refetch } = useEmployees();
  const { data: branches } = useBranches();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const branchList = Array.isArray(branches) ? branches : [];

  return (
    <div>
      <PageHeader title="Nhân viên" description="Quản lý đội ngũ spa">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Thêm nhân viên
        </Button>
      </PageHeader>

      <DataTable
        data={data?.items as EmployeeDetail[] | undefined}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        emptyTitle="Chưa có nhân viên"
        getRowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Tên', cell: (r) => r.name },
          { key: 'phone', header: 'SĐT', cell: (r) => r.phone ?? '—' },
          { key: 'email', header: 'Email', cell: (r) => r.email ?? '—' },
          { key: 'branch', header: 'Chi nhánh', cell: (r) => r.branch?.name ?? '—' },
          {
            key: 'role',
            header: 'Vai trò',
            cell: (r) =>
              r.user?.role ? <StatusBadge status={roleLabel(r.user.role.code)} /> : '—',
          },
          {
            key: 'actions',
            header: '',
            className: 'w-[130px]',
            cell: (r) => (
              <div className="flex gap-1 justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Hiệu suất"
                  onClick={() =>
                    setPerformanceEmployee(performanceEmployee?.id === r.id ? null : r)
                  }
                >
                  <BarChart3
                    className={`h-4 w-4 ${performanceEmployee?.id === r.id ? 'text-primary' : ''}`}
                  />
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
                  onClick={() => setDeleteId(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      {performanceEmployee && <EmployeePerformancePanel employee={performanceEmployee} />}

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing ?? undefined}
        branches={branchList}
        isPending={createEmployee.isPending || updateEmployee.isPending}
        onSubmit={(formData) => {
          if (editing) {
            updateEmployee.mutate(
              { id: editing.id, ...formData },
              { onSuccess: () => setFormOpen(false) },
            );
          } else {
            createEmployee.mutate(formData, { onSuccess: () => setFormOpen(false) });
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Ẩn nhân viên?"
        description="Nhân viên sẽ được đánh dấu không hoạt động."
        confirmLabel="Xóa"
        destructive
        isPending={deleteEmployee.isPending}
        onConfirm={() =>
          deleteId && deleteEmployee.mutate(deleteId, { onSuccess: () => setDeleteId(null) })
        }
      />
    </div>
  );
}
