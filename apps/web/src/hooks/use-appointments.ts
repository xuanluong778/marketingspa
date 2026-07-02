import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type {
  AppointmentDetail,
  CreateAppointmentInput,
  AppointmentStatus,
  SpaService,
  CalendarView,
} from '@/types/appointments';

export function useAppointmentsCalendar(
  view: CalendarView,
  date?: string,
  filters?: { branchId?: string; employeeId?: string },
) {
  const params = new URLSearchParams({ view });
  if (date) params.set('date', date);
  if (filters?.branchId) params.set('branchId', filters.branchId);
  if (filters?.employeeId) params.set('employeeId', filters.employeeId);

  return useQuery({
    queryKey: ['appointments', 'calendar', view, date, filters],
    queryFn: () => apiClient<AppointmentDetail[]>(`/appointments/calendar?${params}`),
  });
}

export function useAppointmentsList(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: ['appointments', 'list', params],
    queryFn: () => apiClient<PaginatedResult<AppointmentDetail>>(`/appointments?${qs}`),
  });
}

export function useSpaServices() {
  return useQuery({
    queryKey: ['appointments', 'services'],
    queryFn: () => apiClient<SpaService[]>('/appointments/services'),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAppointmentInput) =>
      apiClient<AppointmentDetail>('/appointments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CreateAppointmentInput & { id: string }) =>
      apiClient<AppointmentDetail>(`/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      apiClient<AppointmentDetail>(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useSendAppointmentReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/appointments/${id}/remind`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/appointments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}
