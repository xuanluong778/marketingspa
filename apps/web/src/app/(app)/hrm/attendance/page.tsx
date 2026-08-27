'use client';

import { useMemo, useState } from 'react';
import {
  Lock,
  Unlock,
  Clock,
  LogIn,
  LogOut,
  Download,
  Pencil,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useBranches } from '@/hooks/use-crm';
import { useCurrentUser } from '@/hooks/use-auth';
import { useHrmDepartments, useHrmEmployees } from '@/hooks/use-hrm';
import {
  useHrmAttendanceDays,
  useHrmAttendanceMutations,
  useHrmTimesheetPeriods,
  useHrmTodayPunch,
} from '@/hooks/use-hrm-attendance';
import HrmAttendanceCorrectDialog from '@/components/hrm/hrm-attendance-correct-dialog';
import { ApiError } from '@/lib/api-client';
import { useT } from '@/i18n/i18n-provider';
import {
  ATTENDANCE_DAY_STATUS_OPTIONS,
  type AttendanceDayStatus,
  type HrmAttendanceDay,
} from '@/types/hrm';

const now = new Date();
const HRM_TZ = 'Asia/Ho_Chi_Minh';

function statusLabel(status: AttendanceDayStatus) {
  return ATTENDANCE_DAY_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: HRM_TZ,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { timeZone: HRM_TZ });
}

function formatMinutes(mins: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m}p` : `${m}p`;
}

function canEditAttendance(role?: string) {
  return role === 'OWNER' || role === 'HR';
}

export default function HrmAttendancePage() {
  const t = useT();
  const { data: user } = useCurrentUser();
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState<AttendanceDayStatus | ''>('');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editDay, setEditDay] = useState<HrmAttendanceDay | null>(null);
  const [actionError, setActionError] = useState('');

  const filters = {
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    employeeId: employeeId || undefined,
    status: status || undefined,
    year,
    month,
    pageSize: 100,
  };

  const { data, isLoading, isError, refetch } = useHrmAttendanceDays(filters);
  const { data: periods } = useHrmTimesheetPeriods({ branchId: branchId || undefined, year, month });
  const { data: branches } = useBranches();
  const { data: departments } = useHrmDepartments();
  const { data: employeesData } = useHrmEmployees({
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    pageSize: 200,
  });
  const { data: today } = useHrmTodayPunch(!!user?.employeeId);
  const mutations = useHrmAttendanceMutations();

  const branchList = Array.isArray(branches) ? branches : [];
  const departmentList = Array.isArray(departments) ? departments : [];
  const employeeList = employeesData?.items ?? [];
  const period = periods?.[0];
  const items = data?.items ?? [];
  const periodLocked = period?.status === 'LOCKED';
  const isEditor = canEditAttendance(user?.role);
  const canPunch = !!user?.employeeId && (user.permissions?.includes('hrm.attendance.write') || user.role === 'OWNER');

  const monthLabel = useMemo(
    () => `${month.toString().padStart(2, '0')}/${year}`,
    [month, year],
  );

  const showError = (err: unknown) => {
    if (err instanceof ApiError) setActionError(err.message);
    else if (err instanceof Error) setActionError(err.message);
    else setActionError('Có lỗi xảy ra');
  };

  const punch = async (type: 'CHECK_IN' | 'CHECK_OUT') => {
    setActionError('');
    try {
      await mutations.punch.mutateAsync({
        type,
        method: 'MANUAL',
        employeeId: user?.employeeId ?? undefined,
      });
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('hrm.attendanceTitle')}
        description={`Chấm công và tổng hợp tháng ${monthLabel} (múi giờ ${HRM_TZ})`}
      >
        <div className="flex flex-wrap gap-2">
          {canPunch && (
            <>
              <Button
                variant="outline"
                disabled={periodLocked || !today?.canCheckIn || mutations.punch.isPending}
                onClick={() => punch('CHECK_IN')}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Chấm vào
              </Button>
              <Button
                variant="outline"
                disabled={periodLocked || !today?.canCheckOut || mutations.punch.isPending}
                onClick={() => punch('CHECK_OUT')}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Chấm ra
              </Button>
            </>
          )}
          <Button
            variant="outline"
            disabled={mutations.exportDays.isPending}
            onClick={() =>
              mutations.exportDays.mutate({ ...filters, format: 'csv' }, { onError: showError })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            disabled={mutations.exportDays.isPending}
            onClick={() =>
              mutations.exportDays.mutate({ ...filters, format: 'xlsx' }, { onError: showError })
            }
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
          {period?.status === 'LOCKED' ? (
            isEditor && (
              <Button
                variant="outline"
                disabled={mutations.unlockPeriod.isPending}
                onClick={() => {
                  const reason = window.prompt('Lý do mở khóa bảng công (bắt buộc):');
                  if (reason && reason.trim().length >= 3) {
                    mutations.unlockPeriod.mutate(
                      { id: period.id, reason: reason.trim() },
                      { onError: showError },
                    );
                  } else if (reason != null) {
                    setActionError('Lý do mở khóa tối thiểu 3 ký tự');
                  }
                }}
              >
                <Unlock className="mr-2 h-4 w-4" />
                Mở khóa kỳ
              </Button>
            )
          ) : period ? (
            isEditor && (
              <Button
                disabled={mutations.lockPeriod.isPending}
                onClick={() => mutations.lockPeriod.mutate(period.id, { onError: showError })}
              >
                <Lock className="mr-2 h-4 w-4" />
                Khóa bảng công
              </Button>
            )
          ) : (
            isEditor && (
              <Button
                variant="outline"
                disabled={mutations.createPeriod.isPending}
                onClick={() =>
                  mutations.createPeriod.mutate(
                    { branchId: branchId || undefined, year, month },
                    { onError: showError },
                  )
                }
              >
                Tạo kỳ {monthLabel}
              </Button>
            )
          )}
        </div>
      </PageHeader>

      {actionError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {today?.employeeId && (
        <div className="mb-4 rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-sm">
          Hôm nay ({today.workDate}):{' '}
          {today.day ? (
            <>
              {formatTime(today.day.checkInAt)} – {formatTime(today.day.checkOutAt)} ·{' '}
              <StatusBadge status={statusLabel(today.day.status)} />
            </>
          ) : (
            <span className="text-muted-foreground">{t('hrm.attendanceNoRecord')}</span>
          )}
          {periodLocked && (
            <span className="ml-3 text-amber-700">Kỳ đã khóa — không thể chấm/sửa</span>
          )}
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
        <div className="space-y-1">
          <Label className="text-xs">Phòng ban</Label>
          <Select
            value={departmentId || '__all'}
            onValueChange={(v) => setDepartmentId(v === '__all' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tất cả</SelectItem>
              {departmentList.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nhân viên</Label>
          <Select
            value={employeeId || '__all'}
            onValueChange={(v) => setEmployeeId(v === '__all' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tất cả</SelectItem>
              {employeeList.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trạng thái</Label>
          <Select
            value={status || '__all'}
            onValueChange={(v) => setStatus(v === '__all' ? '' : (v as AttendanceDayStatus))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tất cả</SelectItem>
              {ATTENDANCE_DAY_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tháng</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  Tháng {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Năm</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {period && (
        <div className="mb-4 rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-sm">
          Kỳ <strong>{monthLabel}</strong> —{' '}
          <StatusBadge status={period.status === 'LOCKED' ? 'Đã khóa' : 'Đang mở'} />
          {period._count?.attendanceDays != null && (
            <span className="ml-3 text-muted-foreground">
              {period._count.attendanceDays} ngày công
            </span>
          )}
        </div>
      )}

      <DataTable<HrmAttendanceDay>
        columns={[
          {
            key: 'workDate',
            header: 'Ngày',
            cell: (row) => formatDate(row.workDate),
          },
          {
            key: 'employee',
            header: 'Nhân viên',
            cell: (row) => (
              <div>
                <div className="font-medium">{row.employee?.name ?? '—'}</div>
                <div className="text-xs text-muted-foreground">
                  {[row.employee?.code, row.employee?.department?.name].filter(Boolean).join(' · ') ||
                    '—'}
                </div>
              </div>
            ),
          },
          {
            key: 'checkIn',
            header: 'Vào / Ra',
            cell: (row) => (
              <span className="inline-flex items-center gap-1 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {formatTime(row.checkInAt)} – {formatTime(row.checkOutAt)}
              </span>
            ),
          },
          {
            key: 'workedMinutes',
            header: 'Giờ công',
            cell: (row) => formatMinutes(row.workedMinutes),
          },
          {
            key: 'lateMinutes',
            header: 'Đi muộn',
            cell: (row) => (row.lateMinutes > 0 ? `${row.lateMinutes}p` : '—'),
          },
          {
            key: 'earlyLeave',
            header: 'Về sớm',
            cell: (row) => (row.earlyLeaveMinutes > 0 ? `${row.earlyLeaveMinutes}p` : '—'),
          },
          {
            key: 'otMinutes',
            header: 'OT',
            cell: (row) => (row.otMinutes > 0 ? `${row.otMinutes}p` : '—'),
          },
          {
            key: 'status',
            header: 'Trạng thái',
            cell: (row) => <StatusBadge status={statusLabel(row.status)} />,
          },
          ...(isEditor
            ? [
                {
                  key: 'actions',
                  header: '',
                  cell: (row: HrmAttendanceDay) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={row.timesheetPeriod?.status === 'LOCKED' || periodLocked}
                      onClick={() => setEditDay(row)}
                      title={
                        row.timesheetPeriod?.status === 'LOCKED' || periodLocked
                          ? 'Kỳ đã khóa'
                          : 'Sửa ngày công'
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        data={items}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyTitle={t('hrm.attendanceEmpty')}
        getRowKey={(row) => row.id}
      />

      <HrmAttendanceCorrectDialog
        open={!!editDay}
        onOpenChange={(open) => {
          if (!open) setEditDay(null);
        }}
        day={editDay}
        isPending={mutations.correctDay.isPending}
        onSubmit={(payload) => {
          setActionError('');
          mutations.correctDay.mutate(payload, {
            onSuccess: () => setEditDay(null),
            onError: showError,
          });
        }}
      />
    </div>
  );
}
