import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type {
  AttendanceMethod,
  AttendancePunchType,
  HrmAttendanceDay,
  HrmAttendanceFilters,
  HrmLeaveFilters,
  HrmLeaveRequest,
  HrmOvertimeRequest,
  HrmTimesheetPeriod,
  LeaveType,
} from '@/types/hrm';

function toQuery(filters: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useHrmAttendanceDays(filters: HrmAttendanceFilters = {}) {
  return useQuery({
    queryKey: ['hrm', 'attendance', 'days', filters],
    queryFn: () =>
      apiClient<PaginatedResult<HrmAttendanceDay>>(
        `/hrm/attendance/days${toQuery(filters as Record<string, string | number | undefined>)}`,
      ),
  });
}

export function useHrmTimesheetPeriods(filters: {
  branchId?: string;
  year?: number;
  month?: number;
} = {}) {
  return useQuery({
    queryKey: ['hrm', 'timesheet-periods', filters],
    queryFn: () =>
      apiClient<HrmTimesheetPeriod[]>(
        `/hrm/timesheet-periods${toQuery(filters as Record<string, string | number | undefined>)}`,
      ),
  });
}

export function useHrmLeaveRequests(filters: HrmLeaveFilters = {}) {
  return useQuery({
    queryKey: ['hrm', 'leave-requests', filters],
    queryFn: () =>
      apiClient<PaginatedResult<HrmLeaveRequest>>(
        `/hrm/leave-requests${toQuery(filters as Record<string, string | number | undefined>)}`,
      ),
  });
}

export function useHrmOvertimeRequests(filters: HrmLeaveFilters = {}) {
  return useQuery({
    queryKey: ['hrm', 'overtime-requests', filters],
    queryFn: () =>
      apiClient<PaginatedResult<HrmOvertimeRequest>>(
        `/hrm/overtime-requests${toQuery(filters as Record<string, string | number | undefined>)}`,
      ),
  });
}

export function useHrmAttendanceMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hrm', 'attendance'] });
    qc.invalidateQueries({ queryKey: ['hrm', 'timesheet-periods'] });
  };

  return {
    punch: useMutation({
      mutationFn: (body: {
        employeeId: string;
        branchId: string;
        type: AttendancePunchType;
        method: AttendanceMethod;
        punchedAt?: string;
      }) =>
        apiClient('/hrm/attendance/punch', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    lockPeriod: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/hrm/timesheet-periods/${id}/lock`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    unlockPeriod: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        apiClient(`/hrm/timesheet-periods/${id}/unlock`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }),
      onSuccess: invalidate,
    }),
    createPeriod: useMutation({
      mutationFn: (body: { branchId?: string; year: number; month: number }) =>
        apiClient('/hrm/timesheet-periods', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useHrmLeaveMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hrm', 'leave-requests'] });
    qc.invalidateQueries({ queryKey: ['hrm', 'overtime-requests'] });
    qc.invalidateQueries({ queryKey: ['hrm', 'attendance'] });
  };

  return {
    createLeave: useMutation({
      mutationFn: (body: {
        employeeId: string;
        branchId?: string;
        leaveType: LeaveType;
        fromDate: string;
        toDate: string;
        days: number;
        reason?: string;
      }) =>
        apiClient('/hrm/leave-requests', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    approveLeave: useMutation({
      mutationFn: ({ id, decisionNote }: { id: string; decisionNote?: string }) =>
        apiClient(`/hrm/leave-requests/${id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ decisionNote }),
        }),
      onSuccess: invalidate,
    }),
    rejectLeave: useMutation({
      mutationFn: ({ id, decisionNote }: { id: string; decisionNote?: string }) =>
        apiClient(`/hrm/leave-requests/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ decisionNote }),
        }),
      onSuccess: invalidate,
    }),
    createOvertime: useMutation({
      mutationFn: (body: {
        employeeId: string;
        branchId: string;
        workDate: string;
        minutes: number;
        reason?: string;
      }) =>
        apiClient('/hrm/overtime-requests', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    approveOvertime: useMutation({
      mutationFn: ({ id, decisionNote }: { id: string; decisionNote?: string }) =>
        apiClient(`/hrm/overtime-requests/${id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ decisionNote }),
        }),
      onSuccess: invalidate,
    }),
    rejectOvertime: useMutation({
      mutationFn: ({ id, decisionNote }: { id: string; decisionNote?: string }) =>
        apiClient(`/hrm/overtime-requests/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ decisionNote }),
        }),
      onSuccess: invalidate,
    }),
  };
}
