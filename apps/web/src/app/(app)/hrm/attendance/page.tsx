'use client';

import { useMemo, useState } from 'react';
import { Lock, Unlock, Clock } from 'lucide-react';
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
import { useHrmEmployees } from '@/hooks/use-hrm';
import {
  useHrmAttendanceDays,
  useHrmAttendanceMutations,
  useHrmTimesheetPeriods,
} from '@/hooks/use-hrm-attendance';
import {
  ATTENDANCE_DAY_STATUS_OPTIONS,
  type AttendanceDayStatus,
  type HrmAttendanceDay,
} from '@/types/hrm';

const now = new Date();

function statusLabel(status: AttendanceDayStatus) {
  return ATTENDANCE_DAY_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN');
}

export default function HrmAttendancePage() {
  const [branchId, setBranchId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const filters = {
    branchId: branchId || undefined,
    employeeId: employeeId || undefined,
    year,
    month,
    pageSize: 50,
  };

  const { data, isLoading, isError, refetch } = useHrmAttendanceDays(filters);
  const { data: periods } = useHrmTimesheetPeriods({ branchId: branchId || undefined, year, month });
  const { data: branches } = useBranches();
  const { data: employeesData } = useHrmEmployees({ branchId: branchId || undefined, pageSize: 200 });
  const mutations = useHrmAttendanceMutations();

  const branchList = Array.isArray(branches) ? branches : [];
  const employeeList = employeesData?.items ?? [];
  const period = periods?.[0];
  const items = data?.items ?? [];

  const monthLabel = useMemo(
    () => `${month.toString().padStart(2, '0')}/${year}`,
    [month, year],
  );

  return (
    <div>
      <PageHeader
        title="Bảng công"
        description={`Chấm công và tổng hợp tháng ${monthLabel}`}
      >
        {period?.status === 'LOCKED' ? (
          <Button
            variant="outline"
            disabled={mutations.unlockPeriod.isPending}
            onClick={() => {
              const reason = window.prompt('Lý do mở khóa bảng công:');
              if (reason?.trim()) {
                mutations.unlockPeriod.mutate({ id: period.id, reason: reason.trim() });
              }
            }}
          >
            <Unlock className="mr-2 h-4 w-4" />
            Mở khóa kỳ
          </Button>
        ) : period ? (
          <Button
            disabled={mutations.lockPeriod.isPending}
            onClick={() => mutations.lockPeriod.mutate(period.id)}
          >
            <Lock className="mr-2 h-4 w-4" />
            Khóa bảng công
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={mutations.createPeriod.isPending}
            onClick={() =>
              mutations.createPeriod.mutate({
                branchId: branchId || undefined,
                year,
                month,
              })
            }
          >
            Tạo kỳ {monthLabel}
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
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
          <StatusBadge
            status={period.status === 'LOCKED' ? 'Đã khóa' : 'Đang mở'}
          />
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
                {row.employee?.code && (
                  <div className="text-xs text-muted-foreground">{row.employee.code}</div>
                )}
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
            cell: (row) => `${Math.floor(row.workedMinutes / 60)}h${row.workedMinutes % 60}p`,
          },
          {
            key: 'lateMinutes',
            header: 'Đi muộn',
            cell: (row) => (row.lateMinutes > 0 ? `${row.lateMinutes}p` : '—'),
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
        ]}
        data={items}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyTitle="Chưa có dữ liệu chấm công"
        getRowKey={(row) => row.id}
      />
    </div>
  );
}
