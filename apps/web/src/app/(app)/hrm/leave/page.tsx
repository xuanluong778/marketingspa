'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
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
import {
  useHrmLeaveMutations,
  useHrmLeaveRequests,
  useHrmOvertimeRequests,
} from '@/hooks/use-hrm-attendance';
import {
  LEAVE_STATUS_OPTIONS,
  LEAVE_TYPE_OPTIONS,
  type HrmLeaveRequest,
  type HrmOvertimeRequest,
  type LeaveRequestStatus,
} from '@/types/hrm';

function leaveTypeLabel(value: string) {
  return LEAVE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function statusLabel(value: LeaveRequestStatus) {
  return LEAVE_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN');
}

export default function HrmLeavePage() {
  const [tab, setTab] = useState<'leave' | 'overtime'>('leave');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<LeaveRequestStatus | ''>('PENDING');

  const filters = {
    branchId: branchId || undefined,
    status: status || undefined,
    pageSize: 30,
  };

  const {
    data: leaveData,
    isLoading: leaveLoading,
    isError: leaveError,
    refetch: refetchLeave,
  } = useHrmLeaveRequests(filters);
  const {
    data: otData,
    isLoading: otLoading,
    isError: otError,
    refetch: refetchOt,
  } = useHrmOvertimeRequests(filters);
  const { data: branches } = useBranches();
  const mutations = useHrmLeaveMutations();

  const branchList = Array.isArray(branches) ? branches : [];
  const leaveItems = leaveData?.items ?? [];
  const otItems = otData?.items ?? [];

  return (
    <div>
      <PageHeader title="Phép & OT" description="Duyệt đơn nghỉ phép và làm thêm giờ" />

      <div className="mb-4 flex gap-2">
        <Button
          variant={tab === 'leave' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('leave')}
        >
          Nghỉ phép
        </Button>
        <Button
          variant={tab === 'overtime' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('overtime')}
        >
          OT
        </Button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
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
          <Label className="text-xs">Trạng thái</Label>
          <Select
            value={status || '__all'}
            onValueChange={(v) => setStatus(v === '__all' ? '' : (v as LeaveRequestStatus))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tất cả</SelectItem>
              {LEAVE_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {tab === 'leave' ? (
        <DataTable<HrmLeaveRequest>
          columns={[
            {
              key: 'employee',
              header: 'Nhân viên',
              cell: (row) => row.employee?.name ?? '—',
            },
            {
              key: 'leaveType',
              header: 'Loại phép',
              cell: (row) => leaveTypeLabel(row.leaveType),
            },
            {
              key: 'dates',
              header: 'Thời gian',
              cell: (row) => `${formatDate(row.fromDate)} → ${formatDate(row.toDate)} (${row.days} ngày)`,
            },
            {
              key: 'reason',
              header: 'Lý do',
              cell: (row) => row.reason ?? '—',
            },
            {
              key: 'status',
              header: 'Trạng thái',
              cell: (row) => <StatusBadge status={statusLabel(row.status)} />,
            },
            {
              key: 'actions',
              header: '',
              cell: (row) =>
                row.status === 'PENDING' ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutations.approveLeave.isPending}
                      onClick={() => mutations.approveLeave.mutate({ id: row.id })}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutations.rejectLeave.isPending}
                      onClick={() => mutations.rejectLeave.mutate({ id: row.id })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null,
            },
          ]}
          data={leaveItems}
          isLoading={leaveLoading}
          isError={leaveError}
          onRetry={() => refetchLeave()}
          emptyTitle="Không có đơn phép"
          getRowKey={(row) => row.id}
        />
      ) : (
        <DataTable<HrmOvertimeRequest>
          columns={[
            {
              key: 'employee',
              header: 'Nhân viên',
              cell: (row) => row.employee?.name ?? '—',
            },
            {
              key: 'workDate',
              header: 'Ngày',
              cell: (row) => formatDate(row.workDate),
            },
            {
              key: 'minutes',
              header: 'Số phút OT',
              cell: (row) => `${row.minutes} phút`,
            },
            {
              key: 'reason',
              header: 'Lý do',
              cell: (row) => row.reason ?? '—',
            },
            {
              key: 'status',
              header: 'Trạng thái',
              cell: (row) => <StatusBadge status={statusLabel(row.status)} />,
            },
            {
              key: 'actions',
              header: '',
              cell: (row) =>
                row.status === 'PENDING' ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutations.approveOvertime.isPending}
                      onClick={() => mutations.approveOvertime.mutate({ id: row.id })}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutations.rejectOvertime.isPending}
                      onClick={() => mutations.rejectOvertime.mutate({ id: row.id })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null,
            },
          ]}
          data={otItems}
          isLoading={otLoading}
          isError={otError}
          onRetry={() => refetchOt()}
          emptyTitle="Không có đơn OT"
          getRowKey={(row) => row.id}
        />
      )}
    </div>
  );
}
