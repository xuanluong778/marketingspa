'use client';

import { useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  CalendarDays,
  Users,
} from 'lucide-react';
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
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { useBranches } from '@/hooks/use-crm';
import { useCurrentUser } from '@/hooks/use-auth';
import { useHrmDepartments, useHrmEmployees } from '@/hooks/use-hrm';
import {
  useHrmShiftCalendar,
  useHrmShiftMutations,
  useHrmShiftPolicies,
} from '@/hooks/use-hrm-shifts';
import { ApiError } from '@/lib/api-client';
import type { HrmShiftAssignment, HrmShiftPolicy, HrmShiftPolicyInput } from '@/types/hrm';

const WEEKDAYS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 7, label: 'CN' },
];

function canManage(role?: string) {
  return role === 'OWNER' || role === 'HR' || role === 'MANAGER';
}

function formatDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - day + 1);
  return x;
}

function emptyPolicy(): HrmShiftPolicyInput {
  return {
    name: '',
    code: '',
    startTime: '08:00',
    endTime: '17:00',
    breakMinutes: 60,
    lateGraceMinutes: 5,
    earlyLeaveGraceMinutes: 0,
    otBeforeMinutes: 0,
    otAfterMinutes: 120,
    crossesMidnight: false,
  };
}

export default function HrmShiftsPage() {
  const { data: user } = useCurrentUser();
  const [tab, setTab] = useState<'policies' | 'assign' | 'calendar'>('policies');
  const [branchId, setBranchId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [editing, setEditing] = useState<HrmShiftPolicy | null>(null);
  const [form, setForm] = useState<HrmShiftPolicyInput>(emptyPolicy());
  const [actionError, setActionError] = useState('');

  // Assign form
  const [assignPolicyId, setAssignPolicyId] = useState('');
  const [assignFrom, setAssignFrom] = useState(formatDateKey(new Date()));
  const [assignTo, setAssignTo] = useState(formatDateKey(new Date()));
  const [assignDept, setAssignDept] = useState('');
  const [assignEmployeeId, setAssignEmployeeId] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [assignNote, setAssignNote] = useState('');

  // Calendar
  const [calMode, setCalMode] = useState<'week' | 'month'>('week');
  const [calAnchor, setCalAnchor] = useState(() => new Date());

  const { data: branches } = useBranches();
  const { data: departments } = useHrmDepartments();
  const { data: employeesData } = useHrmEmployees({
    branchId: branchId || undefined,
    departmentId: assignDept || undefined,
    pageSize: 200,
  });
  const { data: policies, isLoading: policiesLoading, isError: policiesError, refetch: refetchPolicies } =
    useHrmShiftPolicies({
      branchId: branchId || undefined,
      includeInactive,
    });
  const mutations = useHrmShiftMutations();

  const branchList = Array.isArray(branches) ? branches : [];
  const departmentList = Array.isArray(departments) ? departments : [];
  const employeeList = employeesData?.items ?? [];
  const policyList = policies ?? [];
  const activePolicies = policyList.filter((p) => p.isActive);
  const isManager = canManage(user?.role);

  const calRange = useMemo(() => {
    if (calMode === 'week') {
      const from = startOfWeek(calAnchor);
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 6);
      return { from: formatDateKey(from), to: formatDateKey(to) };
    }
    const y = calAnchor.getUTCFullYear();
    const m = calAnchor.getUTCMonth();
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 0));
    return { from: formatDateKey(from), to: formatDateKey(to) };
  }, [calMode, calAnchor]);

  const { data: calendar, isLoading: calLoading } = useHrmShiftCalendar({
    ...calRange,
    branchId: branchId || undefined,
    employeeId: !isManager ? user?.employeeId || undefined : assignEmployeeId || undefined,
  });

  const calDays = useMemo(() => {
    const days: string[] = [];
    const cursor = new Date(`${calRange.from}T00:00:00.000Z`);
    const end = new Date(`${calRange.to}T00:00:00.000Z`);
    while (cursor <= end) {
      days.push(formatDateKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }, [calRange]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, HrmShiftAssignment[]>();
    for (const item of calendar?.items ?? []) {
      const key = item.workDate.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [calendar]);

  const showError = (err: unknown) => {
    if (err instanceof ApiError) {
      const msg = Array.isArray(err.errors) ? err.errors.join(', ') : err.message;
      setActionError(msg);
    } else if (err instanceof Error) setActionError(err.message);
    else setActionError('Có lỗi xảy ra');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPolicy());
    setPolicyOpen(true);
  };

  const openEdit = (p: HrmShiftPolicy) => {
    setEditing(p);
    setForm({
      name: p.name,
      code: p.code ?? '',
      branchId: p.branchId ?? p.branch?.id ?? undefined,
      startTime: p.startTime,
      endTime: p.endTime,
      breakMinutes: p.breakMinutes,
      lateGraceMinutes: p.lateGraceMinutes,
      earlyLeaveGraceMinutes: p.earlyLeaveGraceMinutes,
      otBeforeMinutes: p.otBeforeMinutes,
      otAfterMinutes: p.otAfterMinutes,
      crossesMidnight: p.crossesMidnight,
    });
    setPolicyOpen(true);
  };

  const runBulk = async (forceOverwrite: boolean) => {
    if (!assignPolicyId) {
      setActionError('Chọn ca làm việc');
      return;
    }
    setActionError('');
    try {
      await mutations.bulkAssign.mutateAsync({
        policyId: assignPolicyId,
        fromDate: assignFrom,
        toDate: assignTo,
        weekdays,
        branchId: branchId || undefined,
        departmentId: assignDept || undefined,
        employeeIds: assignEmployeeId ? [assignEmployeeId] : undefined,
        forceOverwrite,
        note: assignNote || undefined,
      });
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 409) {
        const ok = window.confirm(
          `${e.message}\n\nXác nhận ghi đè các ca đã có? (sẽ ghi audit log)`,
        );
        if (ok) await runBulk(true);
        else setActionError(e.message);
        return;
      }
      showError(e);
    }
  };

  return (
    <div>
      <PageHeader title="Ca làm việc" description="Quản lý ca, phân ca và lịch tuần/tháng">
        {isManager && tab === 'policies' && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Thêm ca
          </Button>
        )}
      </PageHeader>

      {actionError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === 'policies' ? 'default' : 'outline'}
          onClick={() => setTab('policies')}
        >
          Danh sách ca
        </Button>
        {isManager && (
          <Button
            size="sm"
            variant={tab === 'assign' ? 'default' : 'outline'}
            onClick={() => setTab('assign')}
          >
            <Users className="mr-1 h-4 w-4" />
            Phân ca
          </Button>
        )}
        <Button
          size="sm"
          variant={tab === 'calendar' ? 'default' : 'outline'}
          onClick={() => setTab('calendar')}
        >
          <CalendarDays className="mr-1 h-4 w-4" />
          Lịch
        </Button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Chi nhánh</Label>
          <Select value={branchId || '__all'} onValueChange={(v) => setBranchId(v === '__all' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tất cả</SelectItem>
              {branchList.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {tab === 'policies' && isManager && (
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIncludeInactive((v) => !v)}
            >
              {includeInactive ? 'Ẩn ca đã ngưng' : 'Hiện ca đã ngưng'}
            </Button>
          </div>
        )}
      </div>

      {tab === 'policies' && (
        <DataTable<HrmShiftPolicy>
          columns={[
            {
              key: 'name',
              header: 'Ca',
              cell: (row) => (
                <div>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.code}</div>
                </div>
              ),
            },
            {
              key: 'time',
              header: 'Giờ',
              cell: (row) => (
                <span>
                  {row.startTime} – {row.endTime}
                  {row.crossesMidnight ? ' (qua ngày)' : ''}
                </span>
              ),
            },
            {
              key: 'break',
              header: 'Nghỉ',
              cell: (row) => `${row.breakMinutes}p`,
            },
            {
              key: 'grace',
              header: 'Muộn / sớm',
              cell: (row) => `${row.lateGraceMinutes}p / ${row.earlyLeaveGraceMinutes}p`,
            },
            {
              key: 'ot',
              header: 'OT trước/sau',
              cell: (row) => `${row.otBeforeMinutes}p / ${row.otAfterMinutes}p`,
            },
            {
              key: 'branch',
              header: 'Chi nhánh',
              cell: (row) => row.branch?.name ?? 'Toàn org',
            },
            {
              key: 'status',
              header: 'TT',
              cell: (row) => (
                <StatusBadge status={row.isActive ? 'Đang dùng' : 'Đã ngưng'} />
              ),
            },
            ...(isManager
              ? [
                  {
                    key: 'actions',
                    header: '',
                    cell: (row: HrmShiftPolicy) => (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {row.isActive ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              mutations.deactivatePolicy.mutate(row.id, { onError: showError })
                            }
                          >
                            <PowerOff className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              mutations.activatePolicy.mutate(row.id, { onError: showError })
                            }
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Xóa ca? Nếu đã có phân ca hệ thống sẽ ngưng thay vì xóa cứng.',
                              )
                            ) {
                              mutations.deletePolicy.mutate(row.id, { onError: showError });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          data={policyList}
          isLoading={policiesLoading}
          isError={policiesError}
          onRetry={() => refetchPolicies()}
          emptyTitle="Chưa có ca làm việc"
          getRowKey={(row) => row.id}
        />
      )}

      {tab === 'assign' && isManager && (
        <div className="max-w-2xl space-y-4 rounded-lg border border-border/60 p-4">
          <div className="space-y-1">
            <Label>Ca làm việc</Label>
            <Select value={assignPolicyId || undefined} onValueChange={setAssignPolicyId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn ca" />
              </SelectTrigger>
              <SelectContent>
                {activePolicies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.startTime}-{p.endTime}
                    {p.crossesMidnight ? ', qua ngày' : ''})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Từ ngày</Label>
              <Input type="date" value={assignFrom} onChange={(e) => setAssignFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Đến ngày</Label>
              <Input type="date" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Thứ trong tuần</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = weekdays.includes(d.value);
                return (
                  <Button
                    key={d.value}
                    type="button"
                    size="sm"
                    variant={on ? 'default' : 'outline'}
                    onClick={() =>
                      setWeekdays((prev) =>
                        on ? prev.filter((x) => x !== d.value) : [...prev, d.value].sort(),
                      )
                    }
                  >
                    {d.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Phòng ban (tùy chọn)</Label>
              <Select
                value={assignDept || '__all'}
                onValueChange={(v) => setAssignDept(v === '__all' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Tất cả NV trong phạm vi</SelectItem>
                  {departmentList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nhân viên (tùy chọn)</Label>
              <Select
                value={assignEmployeeId || '__all'}
                onValueChange={(v) => setAssignEmployeeId(v === '__all' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Theo phòng ban / chi nhánh</SelectItem>
                  {employeeList.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Ghi chú</Label>
            <Textarea value={assignNote} onChange={(e) => setAssignNote(e.target.value)} rows={2} />
          </div>
          <Button disabled={mutations.bulkAssign.isPending} onClick={() => runBulk(false)}>
            Phân ca
          </Button>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={calMode === 'week' ? 'default' : 'outline'}
              onClick={() => setCalMode('week')}
            >
              Tuần
            </Button>
            <Button
              size="sm"
              variant={calMode === 'month' ? 'default' : 'outline'}
              onClick={() => setCalMode('month')}
            >
              Tháng
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(calAnchor);
                if (calMode === 'week') d.setUTCDate(d.getUTCDate() - 7);
                else d.setUTCMonth(d.getUTCMonth() - 1);
                setCalAnchor(d);
              }}
            >
              ←
            </Button>
            <span className="text-sm text-muted-foreground">
              {calRange.from} → {calRange.to}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(calAnchor);
                if (calMode === 'week') d.setUTCDate(d.getUTCDate() + 7);
                else d.setUTCMonth(d.getUTCMonth() + 1);
                setCalAnchor(d);
              }}
            >
              →
            </Button>
          </div>

          {calLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải lịch…</p>
          ) : (
            <div
              className={`grid gap-2 ${calMode === 'week' ? 'md:grid-cols-7' : 'md:grid-cols-7'}`}
            >
              {calDays.map((day) => {
                const items = itemsByDay.get(day) ?? [];
                return (
                  <div
                    key={day}
                    className="min-h-[100px] rounded-md border border-border/60 bg-card/40 p-2 text-xs"
                  >
                    <div className="mb-1 font-medium">
                      {new Date(`${day}T00:00:00Z`).toLocaleDateString('vi-VN', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        timeZone: 'UTC',
                      })}
                    </div>
                    <div className="space-y-1">
                      {items.length === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {items.map((it) => (
                        <div
                          key={it.id}
                          className="rounded bg-muted/60 px-1.5 py-1"
                          title={it.policy?.name}
                        >
                          <div className="font-medium truncate">
                            {it.employee?.name ?? '—'}
                          </div>
                          <div className="text-muted-foreground">
                            {it.policy?.startTime ?? ''}–{it.policy?.endTime ?? ''}
                            {it.policy?.crossesMidnight ? ' ★' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa ca' : 'Thêm ca làm việc'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Tên ca</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Mã ca</Label>
              <Input
                value={form.code}
                disabled={!!editing}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Chi nhánh</Label>
              <Select
                value={form.branchId || '__org'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, branchId: v === '__org' ? undefined : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__org">Toàn organization</SelectItem>
                  {branchList.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Giờ bắt đầu</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Giờ kết thúc</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Nghỉ giữa ca (phút)</Label>
              <Input
                type="number"
                min={0}
                value={form.breakMinutes ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, breakMinutes: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Cho phép đi muộn (phút)</Label>
              <Input
                type="number"
                min={0}
                value={form.lateGraceMinutes ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lateGraceMinutes: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Cho phép về sớm (phút)</Label>
              <Input
                type="number"
                min={0}
                value={form.earlyLeaveGraceMinutes ?? 0}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    earlyLeaveGraceMinutes: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>OT trước ca (phút)</Label>
              <Input
                type="number"
                min={0}
                value={form.otBeforeMinutes ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, otBeforeMinutes: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>OT sau ca (phút)</Label>
              <Input
                type="number"
                min={0}
                value={form.otAfterMinutes ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, otAfterMinutes: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="crosses"
                type="checkbox"
                checked={!!form.crossesMidnight}
                onChange={(e) =>
                  setForm((f) => ({ ...f, crossesMidnight: e.target.checked }))
                }
              />
              <Label htmlFor="crosses">Ca qua ngày (ca đêm)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={mutations.createPolicy.isPending || mutations.updatePolicy.isPending}
              onClick={() => {
                setActionError('');
                if (!form.name.trim() || !form.code.trim()) {
                  setActionError('Nhập tên và mã ca');
                  return;
                }
                if (editing) {
                  mutations.updatePolicy.mutate(
                    { id: editing.id, ...form },
                    {
                      onSuccess: () => setPolicyOpen(false),
                      onError: showError,
                    },
                  );
                } else {
                  mutations.createPolicy.mutate(form, {
                    onSuccess: () => setPolicyOpen(false),
                    onError: showError,
                  });
                }
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
