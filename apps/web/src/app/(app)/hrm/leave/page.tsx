'use client';

import { useMemo, useState } from 'react';
import { Check, X, Plus, Ban, Paperclip } from 'lucide-react';
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
import {
  useHrmLeaveBalance,
  useHrmLeaveMutations,
  useHrmLeaveRequests,
  useHrmOvertimeRequests,
} from '@/hooks/use-hrm-attendance';
import { HrmLeaveCreateDialog } from '@/components/hrm/hrm-leave-create-dialog';
import { HrmOtCreateDialog } from '@/components/hrm/hrm-ot-create-dialog';
import { ApiError, getApiUrl } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import { useT } from '@/i18n/i18n-provider';
import {
  LEAVE_DAY_PART_OPTIONS,
  LEAVE_STATUS_OPTIONS,
  LEAVE_TYPE_OPTIONS,
  type HrmLeaveRequest,
  type HrmOvertimeRequest,
  type LeaveRequestStatus,
} from '@/types/hrm';

function leaveTypeLabel(value: string) {
  return LEAVE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function dayPartLabel(value?: string) {
  if (!value) return 'Cả ngày';
  return LEAVE_DAY_PART_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function statusLabel(value: LeaveRequestStatus) {
  return LEAVE_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function canApprove(role?: string) {
  return role === 'OWNER' || role === 'HR' || role === 'MANAGER';
}

function canWrite(user?: { role?: string; permissions?: string[] }) {
  return (
    user?.role === 'OWNER' ||
    user?.permissions?.includes('hrm.leave.write') === true
  );
}

async function openAttachment(id: string) {
  const token = authStorage.getAccessToken();
  const res = await fetch(`${getApiUrl()}/api/v1/hrm/leave-requests/${id}/attachment`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Không tải được file đính kèm');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export default function HrmLeavePage() {
  const t = useT();
  const { data: user } = useCurrentUser();
  const [tab, setTab] = useState<'leave' | 'overtime'>('leave');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<LeaveRequestStatus | ''>('PENDING');
  const [createLeaveOpen, setCreateLeaveOpen] = useState(false);
  const [createOtOpen, setCreateOtOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const filters = {
    branchId: branchId || undefined,
    status: status || undefined,
    pageSize: 50,
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
  const { data: balance } = useHrmLeaveBalance(user?.employeeId ?? undefined);
  const mutations = useHrmLeaveMutations();

  const branchList = Array.isArray(branches) ? branches : [];
  const leaveItems = leaveData?.items ?? [];
  const otItems = otData?.items ?? [];
  const isApprover = canApprove(user?.role);
  const canCreate = canWrite(user);

  const annualHint = useMemo(() => {
    const row = balance?.balances?.find((b) => b.leaveType === 'ANNUAL');
    if (!row) return undefined;
    if (row.remaining == null) return t('hrm.annualLeaveUnlimited');
    return `Số dư phép năm: ${row.remaining}/${row.quota} ngày (đã dùng ${row.used})`;
  }, [balance]);

  const showError = (err: unknown) => {
    if (err instanceof ApiError) setActionError(err.message);
    else if (err instanceof Error) setActionError(err.message);
    else setActionError('Có lỗi xảy ra');
  };

  const promptReason = (title: string) => {
    const reason = window.prompt(title);
    if (reason == null) return null;
    if (reason.trim().length < 3) {
      setActionError('Lý do tối thiểu 3 ký tự');
      return null;
    }
    return reason.trim();
  };

  return (
    <div>
      <PageHeader title={t('hrm.leaveTitle')} description={t('hrm.leaveDescription')}>
        {canCreate && (
          <Button
            onClick={() => {
              setActionError('');
              if (tab === 'leave') setCreateLeaveOpen(true);
              else setCreateOtOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {tab === 'leave' ? t('hrm.createLeave') : t('hrm.createOt')}
          </Button>
        )}
      </PageHeader>

      {actionError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {annualHint && tab === 'leave' && (
        <div className="mb-4 rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-sm">
          {annualHint}
        </div>
      )}

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
              cell: (row) => (
                <div>
                  <div>{leaveTypeLabel(row.leaveType)}</div>
                  <div className="text-xs text-muted-foreground">{dayPartLabel(row.dayPart)}</div>
                </div>
              ),
            },
            {
              key: 'dates',
              header: 'Thời gian',
              cell: (row) =>
                `${formatDate(row.fromDate)} → ${formatDate(row.toDate)} (${row.days} ngày)`,
            },
            {
              key: 'reason',
              header: 'Lý do',
              cell: (row) => row.reason ?? '—',
            },
            {
              key: 'file',
              header: 'File',
              cell: (row) =>
                row.attachmentUrl || row.attachmentName ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openAttachment(row.id).catch(showError)}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                ) : (
                  '—'
                ),
            },
            {
              key: 'status',
              header: 'Trạng thái',
              cell: (row) => <StatusBadge status={statusLabel(row.status)} />,
            },
            {
              key: 'actions',
              header: '',
              cell: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.status === 'PENDING' && isApprover && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutations.approveLeave.isPending}
                        onClick={() => {
                          setActionError('');
                          mutations.approveLeave.mutate({ id: row.id }, { onError: showError });
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutations.rejectLeave.isPending}
                        onClick={() => {
                          const note = promptReason('Lý do từ chối:');
                          if (!note) return;
                          setActionError('');
                          mutations.rejectLeave.mutate(
                            { id: row.id, decisionNote: note },
                            { onError: showError },
                          );
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {(row.status === 'PENDING' || row.status === 'APPROVED') && canCreate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={mutations.cancelLeave.isPending}
                      title="Hủy đơn"
                      onClick={() => {
                        const reason = promptReason('Lý do hủy đơn:');
                        if (!reason) return;
                        setActionError('');
                        mutations.cancelLeave.mutate({ id: row.id, reason }, { onError: showError });
                      }}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          data={leaveItems}
          isLoading={leaveLoading}
          isError={leaveError}
          onRetry={() => refetchLeave()}
          emptyTitle={t('hrm.leaveEmpty')}
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
              key: 'time',
              header: 'Khung giờ',
              cell: (row) => `${formatTime(row.startAt)} – ${formatTime(row.endAt)}`,
            },
            {
              key: 'minutes',
              header: 'OT',
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
              cell: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.status === 'PENDING' && isApprover && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutations.approveOvertime.isPending}
                        onClick={() => {
                          setActionError('');
                          mutations.approveOvertime.mutate({ id: row.id }, { onError: showError });
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutations.rejectOvertime.isPending}
                        onClick={() => {
                          const note = promptReason('Lý do từ chối:');
                          if (!note) return;
                          setActionError('');
                          mutations.rejectOvertime.mutate(
                            { id: row.id, decisionNote: note },
                            { onError: showError },
                          );
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {(row.status === 'PENDING' || row.status === 'APPROVED') && canCreate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={mutations.cancelOvertime.isPending}
                      title="Hủy đơn"
                      onClick={() => {
                        const reason = promptReason('Lý do hủy đơn:');
                        if (!reason) return;
                        setActionError('');
                        mutations.cancelOvertime.mutate(
                          { id: row.id, reason },
                          { onError: showError },
                        );
                      }}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          data={otItems}
          isLoading={otLoading}
          isError={otError}
          onRetry={() => refetchOt()}
          emptyTitle={t('hrm.otEmpty')}
          getRowKey={(row) => row.id}
        />
      )}

      <HrmLeaveCreateDialog
        open={createLeaveOpen}
        onOpenChange={setCreateLeaveOpen}
        employeeId={user?.employeeId}
        balanceHint={annualHint}
        isPending={mutations.createLeave.isPending}
        onSubmit={(fd) => {
          setActionError('');
          mutations.createLeave.mutate(fd, {
            onSuccess: () => setCreateLeaveOpen(false),
            onError: showError,
          });
        }}
      />

      <HrmOtCreateDialog
        open={createOtOpen}
        onOpenChange={setCreateOtOpen}
        employeeId={user?.employeeId}
        branchId={branchId || undefined}
        isPending={mutations.createOvertime.isPending}
        onSubmit={(body) => {
          setActionError('');
          mutations.createOvertime.mutate(body, {
            onSuccess: () => setCreateOtOpen(false),
            onError: showError,
          });
        }}
      />
    </div>
  );
}
