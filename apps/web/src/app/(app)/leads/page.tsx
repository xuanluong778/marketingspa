'use client';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { PaginationBar } from '@/components/crm/pagination-bar';
import { CrmFilterBar, type CrmFilters } from '@/components/crm/crm-filters';
import { LeadFormDialog } from '@/components/crm/lead-form-dialog';
import { LeadKanban } from '@/components/crm/lead-kanban';
import { LeadStatusBadge } from '@/components/crm/lead-status-badge';
import { AppointmentFromLeadDialog } from '@/components/crm/appointment-from-lead-dialog';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useLeads, useEmployees } from '@/hooks/use-queries';
import { apiClient } from '@/lib/api-client';
import {
  useBranches,
  useLeadSources,
  useCreateLead,
  useUpdateLead,
  useUpdateLeadStatus,
  useAssignLead,
  useDeleteLead,
  useCreateAppointment,
  useStaleLeads,
} from '@/hooks/use-crm';
import { PIPELINE_COLUMNS, type LeadPipelineStatus } from '@/types/crm';
import type { Lead } from '@/types/api';
import type { PaginatedResult } from '@/types/api';
import { formatDateTime } from '@/lib/format';

function LeadsPageContent() {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [filters, setFilters] = useState<CrmFilters>({
    search: '',
    tag: '',
    leadSourceId: '',
    branchId: '',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [appointmentLead, setAppointmentLead] = useState<Lead | null>(null);

  const queryParams = useMemo(
    () => ({
      page: String(page),
      pageSize: '20',
      ...(filters.search && { search: filters.search }),
      ...(filters.leadSourceId && { leadSourceId: filters.leadSourceId }),
      ...(filters.branchId && { branchId: filters.branchId }),
    }),
    [page, filters],
  );

  const { data, isLoading, isError, refetch } = useLeads(queryParams);
  const { data: branches } = useBranches();
  const { data: leadSourcesData } = useLeadSources();
  const { data: employeesData } = useEmployees();
  const { data: staleLeads } = useStaleLeads(10);

  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const updateStatus = useUpdateLeadStatus();
  const assignLeadMut = useAssignLead();
  const deleteLead = useDeleteLead();
  const createAppointment = useCreateAppointment();

  const leadSources = leadSourcesData?.items ?? [];
  const branchList = Array.isArray(branches) ? branches : [];
  const employees = employeesData?.items ?? [];

  const kanbanQueries = useQueries({
    queries: PIPELINE_COLUMNS.map((col) => ({
      queryKey: ['leads', 'kanban', col.status, filters],
      queryFn: () => {
        const qs = new URLSearchParams({
          pipelineStatus: col.status,
          pageSize: '50',
          ...(filters.search && { search: filters.search }),
          ...(filters.leadSourceId && { leadSourceId: filters.leadSourceId }),
          ...(filters.branchId && { branchId: filters.branchId }),
        });
        return apiClient<PaginatedResult<Lead>>(`/leads?${qs}`);
      },
      enabled: view === 'kanban',
    })),
  });

  const leadsByStatus = useMemo(() => {
    const map = {} as Record<LeadPipelineStatus, Lead[]>;
    PIPELINE_COLUMNS.forEach((col, i) => {
      map[col.status] = kanbanQueries[i]?.data?.items ?? [];
    });
    return map;
  }, [kanbanQueries]);

  const kanbanLoading = kanbanQueries.some((q) => q.isLoading);
  const kanbanError = kanbanQueries.some((q) => q.isError);

  const handleFilterChange = useCallback((f: CrmFilters) => {
    setFilters(f);
    setPage(1);
  }, []);

  function handleStatusChange(leadId: string, status: LeadPipelineStatus) {
    updateStatus.mutate({ id: leadId, pipelineStatus: status });
  }

  function handleCreateAppointment(data: Parameters<typeof createAppointment.mutate>[0]) {
    createAppointment.mutate(data, {
      onSuccess: () => {
        setAppointmentLead(null);
        if (data.leadId) {
          updateStatus.mutate({ id: data.leadId, pipelineStatus: 'BOOKED' });
        }
      },
    });
  }

  const highlightId = searchParams.get('id');

  return (
    <div>
      <PageHeader title="Lead" description="Quản lý pipeline lead marketing">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Thêm lead
        </Button>
      </PageHeader>

      {staleLeads && staleLeads.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">
                {staleLeads.length} lead chưa xử lý quá 10 phút
              </p>
              <ul className="text-sm text-amber-800 mt-1 space-y-0.5">
                {staleLeads.slice(0, 5).map((l) => (
                  <li key={l.id}>
                    {l.name} — {formatDateTime(l.createdAt)}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <CrmFilterBar
        filters={filters}
        onChange={handleFilterChange}
        leadSources={leadSources}
        branches={branchList}
        showTag={false}
        placeholder="Tìm lead theo tên hoặc SĐT..."
      />

      <Tabs value={view} onValueChange={(v) => setView(v as 'table' | 'kanban')}>
        <TabsList className="mb-4">
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="table">Bảng</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <LeadKanban
            leadsByStatus={leadsByStatus}
            isLoading={kanbanLoading}
            isError={kanbanError}
            onRetry={() => kanbanQueries.forEach((q) => q.refetch())}
            onStatusChange={handleStatusChange}
            onAssign={setAssignLead}
            onCreateAppointment={setAppointmentLead}
            onEdit={(lead) => {
              setEditing(lead);
              setFormOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="table">
          <DataTable
            data={data?.items}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            emptyTitle="Chưa có lead"
            getRowKey={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: 'Tên',
                cell: (r) => (
                  <span className={highlightId === r.id ? 'font-bold text-primary' : ''}>
                    {r.name}
                  </span>
                ),
              },
              { key: 'phone', header: 'SĐT', cell: (r) => r.phone ?? '—' },
              {
                key: 'status',
                header: 'Trạng thái',
                cell: (r) => <LeadStatusBadge status={r.pipelineStatus} />,
              },
              { key: 'source', header: 'Nguồn', cell: (r) => r.leadSource?.name ?? '—' },
              { key: 'assigned', header: 'Phụ trách', cell: (r) => r.assignedTo?.name ?? '—' },
              { key: 'created', header: 'Ngày tạo', cell: (r) => formatDateTime(r.createdAt) },
              {
                key: 'actions',
                header: '',
                cell: (r) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(r);
                      setFormOpen(true);
                    }}
                  >
                    Sửa
                  </Button>
                ),
              },
            ]}
          />
          {data && (
            <PaginationBar
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </TabsContent>
      </Tabs>

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing ?? undefined}
        leadSources={leadSources}
        branches={branchList}
        employees={employees}
        onSubmit={(formData) => {
          if (editing) {
            updateLead.mutate(
              { id: editing.id, ...formData },
              { onSuccess: () => setFormOpen(false) },
            );
          } else {
            createLead.mutate(formData, { onSuccess: () => setFormOpen(false) });
          }
        }}
        isPending={createLead.isPending || updateLead.isPending}
      />

      <Dialog open={!!assignLead} onOpenChange={(o) => !o && setAssignLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gán nhân viên — {assignLead?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nhân viên phụ trách</Label>
            <Select
              value={assigneeId || assignLead?.assignedTo?.id || ''}
              onValueChange={setAssigneeId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhân viên" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignLead(null)}>
              Hủy
            </Button>
            <Button
              disabled={!assigneeId || assignLeadMut.isPending}
              onClick={() => {
                if (assignLead && assigneeId) {
                  assignLeadMut.mutate(
                    { id: assignLead.id, assignedToId: assigneeId },
                    { onSuccess: () => setAssignLead(null) },
                  );
                }
              }}
            >
              Gán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {appointmentLead && (
        <AppointmentFromLeadDialog
          open={!!appointmentLead}
          onOpenChange={(o) => !o && setAppointmentLead(null)}
          lead={appointmentLead}
          branches={branchList}
          employees={employees}
          onSubmit={handleCreateAppointment}
          isPending={createAppointment.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Xóa lead?"
        description="Hành động này không thể hoàn tác."
        confirmLabel="Xóa"
        destructive
        isPending={deleteLead.isPending}
        onConfirm={() =>
          deleteId && deleteLead.mutate(deleteId, { onSuccess: () => setDeleteId(null) })
        }
      />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageContent />
    </Suspense>
  );
}
