'use client';

import { useState, useMemo, useCallback, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bookmark, Columns3, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LeadPageHeader } from '@/components/crm/lead-page-header';
import {
  LeadFilterBar,
  EMPTY_LEAD_FILTERS,
  leadFiltersToQuery,
  type LeadFilters,
} from '@/components/crm/lead-filter-bar';
import { LeadFormDialog } from '@/components/crm/lead-form-dialog';
import { LeadKanban, type KanbanColumnState } from '@/components/crm/lead-kanban';
import { LeadDetailDrawer } from '@/components/crm/lead-detail-drawer';
import { LeadStatusBadge } from '@/components/crm/lead-status-badge';
import { AppointmentFromLeadDialog } from '@/components/crm/appointment-from-lead-dialog';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { PaginationBar } from '@/components/crm/pagination-bar';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  useLeadKanban,
  useLeadSavedViews,
  useCreateLeadSavedView,
  useDeleteLeadSavedView,
  useBulkLeadAction,
} from '@/hooks/use-crm';
import { PIPELINE_COLUMNS, type LeadPipelineStatus } from '@/types/crm';
import type { Lead } from '@/types/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { KanbanLead } from '@/components/crm/lead-card';

const TABLE_COLUMNS = [
  { key: 'name', label: 'Tên' },
  { key: 'phone', label: 'SĐT' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'source', label: 'Nguồn' },
  { key: 'assigned', label: 'Phụ trách' },
  { key: 'created', label: 'Ngày tạo' },
] as const;

function LeadsPageContent() {
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [filters, setFilters] = useState<LeadFilters>({ ...EMPTY_LEAD_FILTERS });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [appointmentLead, setAppointmentLead] = useState<Lead | null>(null);
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleCols, setVisibleCols] = useState<string[]>(TABLE_COLUMNS.map((c) => c.key));
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [columnExtra, setColumnExtra] = useState<
    Record<string, { items: Lead[]; nextCursor: string | null; loading?: boolean }>
  >({});
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const filterQuery = useMemo(() => leadFiltersToQuery(filters), [filters]);

  const queryParams = useMemo(
    () => ({ page: String(page), pageSize: '20', ...filterQuery }),
    [page, filterQuery],
  );

  const { data, isLoading, isError, refetch } = useLeads(queryParams);
  const kanban = useLeadKanban(filterQuery, view === 'kanban');
  const { data: branches } = useBranches();
  const { data: leadSourcesData } = useLeadSources();
  const { data: employeesData } = useEmployees();
  const { data: staleLeads } = useStaleLeads(10);
  const savedViews = useLeadSavedViews();
  const createSavedView = useCreateLeadSavedView();
  const deleteSavedView = useDeleteLeadSavedView();
  const bulkAction = useBulkLeadAction();

  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const updateStatus = useUpdateLeadStatus();
  const assignLeadMut = useAssignLead();
  const deleteLead = useDeleteLead();
  const createAppointment = useCreateAppointment();

  const leadSources = leadSourcesData?.items ?? [];
  const branchList = Array.isArray(branches) ? branches : [];
  const employees = employeesData?.items ?? [];

  useEffect(() => {
    setColumnExtra({});
    setSelectedIds([]);
  }, [filterQuery]);

  const kanbanColumns = useMemo(() => {
    if (filters.pipelineStatus) {
      return PIPELINE_COLUMNS.filter((c) => c.status === filters.pipelineStatus);
    }
    return PIPELINE_COLUMNS;
  }, [filters.pipelineStatus]);

  const columnData = useMemo(() => {
    const map: Record<string, KanbanColumnState> = {};
    for (const col of PIPELINE_COLUMNS) {
      const base = kanban.data?.columns?.[col.status];
      const extra = columnExtra[col.status];
      const items = [
        ...((base?.items as KanbanLead[]) ?? []),
        ...((extra?.items as KanbanLead[]) ?? []),
      ];
      map[col.status] = {
        items,
        total: base?.total ?? 0,
        nextCursor: extra?.nextCursor !== undefined ? extra.nextCursor : (base?.nextCursor ?? null),
        isLoading: kanban.isLoading,
        isLoadingMore: extra?.loading,
        isError: kanban.isError,
      };
    }
    return map;
  }, [kanban.data, kanban.isLoading, kanban.isError, columnExtra]);

  const kpis = useMemo(() => {
    const cols = kanban.data?.columns;
    const total = cols
      ? Object.values(cols).reduce((s, c) => s + (c.total || 0), 0)
      : data?.total ?? 0;
    return {
      total,
      newCount: cols?.NEW?.total ?? 0,
      booked: cols?.BOOKED?.total ?? 0,
      stale: staleLeads?.length ?? 0,
    };
  }, [kanban.data, data?.total, staleLeads]);

  const handleFilterChange = useCallback((f: LeadFilters) => {
    setFilters(f);
    setPage(1);
  }, []);

  function handleStatusChange(leadId: string, status: LeadPipelineStatus) {
    updateStatus.mutate({ id: leadId, pipelineStatus: status });
  }

  async function handleLoadMore(status: LeadPipelineStatus) {
    const current = columnData[status];
    const cursor = current?.nextCursor;
    if (!cursor || columnExtra[status]?.loading) return;
    setColumnExtra((prev) => ({
      ...prev,
      [status]: { items: prev[status]?.items ?? [], nextCursor: cursor, loading: true },
    }));
    try {
      const params = new URLSearchParams({
        cursor,
        limit: '20',
        ...filterQuery,
      });
      params.delete('pipelineStatus');
      const res = await apiClient<{
        items: Lead[];
        nextCursor: string | null;
      }>(`/leads/kanban/${status}?${params}`);
      setColumnExtra((prev) => ({
        ...prev,
        [status]: {
          items: [...(prev[status]?.items ?? []), ...res.items],
          nextCursor: res.nextCursor,
          loading: false,
        },
      }));
    } catch {
      setColumnExtra((prev) => ({
        ...prev,
        [status]: { ...(prev[status] ?? { items: [], nextCursor: null }), loading: false },
      }));
    }
  }

  function handleCreateAppointment(payload: Parameters<typeof createAppointment.mutate>[0]) {
    createAppointment.mutate(payload, {
      onSuccess: () => {
        setAppointmentLead(null);
        if (payload.leadId) {
          updateStatus.mutate({ id: payload.leadId, pipelineStatus: 'BOOKED' });
        }
      },
    });
  }

  function exportCsv() {
    const rows = data?.items ?? [];
    const header = ['name', 'phone', 'status', 'source', 'assigned', 'createdAt'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.name,
          r.phone ?? '',
          r.pipelineStatus,
          r.leadSource?.name ?? '',
          r.assignedTo?.name ?? '',
          r.createdAt,
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const highlightId = searchParams.get('id');
  useEffect(() => {
    if (highlightId) setDrawerLeadId(highlightId);
  }, [highlightId]);

  const allSelected =
    !!data?.items?.length && data.items.every((r) => selectedIds.includes(r.id));

  return (
    <div className="min-h-full w-full max-w-full overflow-x-hidden space-y-0">
      <LeadPageHeader
        kpis={kpis}
        onAdd={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        onImport={() => alert('Import CSV sẽ mở trong bản cập nhật tiếp theo. Hiện dùng Thêm lead.')}
        onExport={exportCsv}
      />

      <div className="rounded-xl border border-border/60 bg-card/50 p-3 sm:p-3.5 space-y-3 mb-4 shadow-sm">
        <LeadFilterBar
          filters={filters}
          onChange={handleFilterChange}
          leadSources={leadSources}
          branches={branchList}
          employees={employees}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 border-t border-border/40">
          <div className="inline-flex rounded-lg border border-border/70 bg-background/80 p-0.5">
            <Button
              type="button"
              size="sm"
              variant={view === 'kanban' ? 'default' : 'ghost'}
              className="h-8 px-3"
              onClick={() => setView('kanban')}
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
              Kanban
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'table' ? 'default' : 'ghost'}
              className="h-8 px-3"
              onClick={() => setView('table')}
            >
              <List className="h-3.5 w-3.5 mr-1.5" />
              Bảng
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value=""
              onValueChange={(id) => {
                const v = savedViews.data?.find((x) => x.id === id);
                if (!v) return;
                const f = { ...EMPTY_LEAD_FILTERS, ...(v.filters as Partial<LeadFilters>) };
                setFilters(f);
                if (v.viewMode === 'table' || v.viewMode === 'kanban') setView(v.viewMode);
                if (v.tableColumns?.length) setVisibleCols(v.tableColumns);
              }}
            >
              <SelectTrigger className="h-8 w-[150px] bg-background/80">
                <SelectValue placeholder="Saved view" />
              </SelectTrigger>
              <SelectContent>
                {(savedViews.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setSaveViewOpen(true)}
            >
              <Bookmark className="h-3.5 w-3.5 mr-1" />
              Lưu view
            </Button>
            {view === 'table' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="outline" className="h-8">
                    <Columns3 className="h-3.5 w-3.5 mr-1" />
                    Cột
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {TABLE_COLUMNS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.key}
                      checked={visibleCols.includes(c.key)}
                      onCheckedChange={(checked) => {
                        setVisibleCols((prev) =>
                          checked ? [...prev, c.key] : prev.filter((k) => k !== c.key),
                        );
                      }}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {view === 'kanban' && (
        <LeadKanban
          columns={kanbanColumns}
          columnData={columnData}
          isLoading={kanban.isLoading}
          isError={kanban.isError}
          onRetry={() => kanban.refetch()}
          onStatusChange={handleStatusChange}
          onOpenLead={(lead) => setDrawerLeadId(lead.id)}
          onLoadMore={handleLoadMore}
          draggingId={draggingId}
          onDragStart={setDraggingId}
          onDragEnd={() => setDraggingId(null)}
        />
      )}

      {view === 'table' && (
        <div className="space-y-3">
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">{selectedIds.length} đã chọn</span>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="h-8 w-[150px]">
                  <SelectValue placeholder="Đổi trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_COLUMNS.map((c) => (
                    <SelectItem key={c.status} value={c.status}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8"
                disabled={!bulkStatus || bulkAction.isPending}
                onClick={() =>
                  bulkAction.mutate(
                    {
                      leadIds: selectedIds,
                      action: 'status',
                      pipelineStatus: bulkStatus,
                    },
                    { onSuccess: () => setSelectedIds([]) },
                  )
                }
              >
                Áp dụng TT
              </Button>
              <Select
                value=""
                onValueChange={(v) =>
                  bulkAction.mutate(
                    { leadIds: selectedIds, action: 'assign', assignedToId: v },
                    { onSuccess: () => setSelectedIds([]) },
                  )
                }
              >
                <SelectTrigger className="h-8 w-[160px]">
                  <SelectValue placeholder="Gán nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-8 w-[120px]"
                placeholder="Tag"
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={!bulkTag.trim() || bulkAction.isPending}
                onClick={() =>
                  bulkAction.mutate(
                    { leadIds: selectedIds, action: 'tag', tags: [bulkTag.trim()] },
                    { onSuccess: () => setSelectedIds([]) },
                  )
                }
              >
                Thêm tag
              </Button>
            </div>
          )}

          {isLoading && <LoadingState />}
          {isError && <ErrorState onRetry={refetch} />}
          {!isLoading && !isError && !data?.items?.length && <EmptyState title="Chưa có lead" />}
          {!isLoading && !isError && !!data?.items?.length && (
            <div className="rounded-xl border bg-card overflow-auto max-h-[min(70vh,720px)]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(c) =>
                          setSelectedIds(c ? (data.items.map((i) => i.id) ?? []) : [])
                        }
                      />
                    </TableHead>
                    {TABLE_COLUMNS.filter((c) => visibleCols.includes(c.key)).map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((r) => (
                    <TableRow
                      key={r.id}
                      className={cn(
                        'cursor-pointer',
                        highlightId === r.id && 'bg-primary/5',
                        selectedIds.includes(r.id) && 'bg-muted/40',
                      )}
                      onClick={() => setDrawerLeadId(r.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(r.id)}
                          onCheckedChange={(c) =>
                            setSelectedIds((prev) =>
                              c ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                            )
                          }
                        />
                      </TableCell>
                      {visibleCols.includes('name') && (
                        <TableCell className="font-medium">{r.name}</TableCell>
                      )}
                      {visibleCols.includes('phone') && (
                        <TableCell>{r.phone ?? '—'}</TableCell>
                      )}
                      {visibleCols.includes('status') && (
                        <TableCell>
                          <LeadStatusBadge status={r.pipelineStatus} />
                        </TableCell>
                      )}
                      {visibleCols.includes('source') && (
                        <TableCell>{r.leadSource?.name ?? '—'}</TableCell>
                      )}
                      {visibleCols.includes('assigned') && (
                        <TableCell>{r.assignedTo?.name ?? '—'}</TableCell>
                      )}
                      {visibleCols.includes('created') && (
                        <TableCell>{formatDateTime(r.createdAt)}</TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {data && (
            <PaginationBar
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      <LeadDetailDrawer
        leadId={drawerLeadId}
        open={!!drawerLeadId}
        onOpenChange={(o) => !o && setDrawerLeadId(null)}
        onAssign={() => {
          const lead =
            data?.items.find((l) => l.id === drawerLeadId) ||
            Object.values(columnData)
              .flatMap((c) => c.items)
              .find((l) => l.id === drawerLeadId);
          if (lead) setAssignLead(lead);
        }}
        onCreateAppointment={() => {
          const lead =
            data?.items.find((l) => l.id === drawerLeadId) ||
            Object.values(columnData)
              .flatMap((c) => c.items)
              .find((l) => l.id === drawerLeadId);
          if (lead) setAppointmentLead(lead);
        }}
        onEdit={() => {
          const lead =
            data?.items.find((l) => l.id === drawerLeadId) ||
            Object.values(columnData)
              .flatMap((c) => c.items)
              .find((l) => l.id === drawerLeadId);
          if (lead) {
            setEditing(lead);
            setFormOpen(true);
          }
        }}
      />

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

      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lưu view hiện tại</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Tên view"
            value={saveViewName}
            onChange={(e) => setSaveViewName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveViewOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={!saveViewName.trim() || createSavedView.isPending}
              onClick={() =>
                createSavedView.mutate(
                  {
                    name: saveViewName.trim(),
                    viewMode: view,
                    filters: { ...filters } as Record<string, unknown>,
                    tableColumns: visibleCols,
                  },
                  {
                    onSuccess: () => {
                      setSaveViewOpen(false);
                      setSaveViewName('');
                    },
                  },
                )
              }
            >
              Lưu
            </Button>
          </DialogFooter>
          {(savedViews.data?.length ?? 0) > 0 && (
            <div className="space-y-1 pt-2 border-t">
              <p className="text-xs text-muted-foreground">View đã lưu</p>
              {savedViews.data?.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <span>{v.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive"
                    onClick={() => deleteSavedView.mutate(v.id)}
                  >
                    Xóa
                  </Button>
                </div>
              ))}
            </div>
          )}
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
