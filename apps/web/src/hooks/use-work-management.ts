import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiUpload } from '@/lib/api-client';
import type {
  WorkProject,
  WorkProjectDetail,
  WorkTask,
  CreateWorkProjectInput,
  CreateWorkTaskInput,
  UpdateWorkTaskInput,
  MoveWorkTaskInput,
  WorkComment,
  WorkAttachment,
  WorkNotification,
  WorkStatusHistory,
  WorkReviewEvent,
} from '@/types/work-management';

const KEY = ['work-management'] as const;

export function useWorkTask(taskId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'task', taskId],
    queryFn: () => apiClient<WorkTask>(`/work-management/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useWorkProjects(includeArchived = false) {
  const qs = includeArchived ? '?includeArchived=1' : '';
  return useQuery({
    queryKey: [...KEY, 'projects', includeArchived],
    queryFn: () => apiClient<WorkProject[]>(`/work-management/projects${qs}`),
  });
}

export function useWorkProject(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'project', id],
    queryFn: () => apiClient<WorkProjectDetail>(`/work-management/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorkProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkProjectInput) =>
      apiClient<WorkProject>('/work-management/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkTaskInput) =>
      apiClient<WorkTask>('/work-management/tasks', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateWorkTaskInput & { id: string }) =>
      apiClient<WorkTask>(`/work-management/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      if (data?.id) {
        qc.setQueryData([...KEY, 'task', data.id], data);
      }
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useMoveWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: MoveWorkTaskInput & { id: string }) =>
      apiClient<WorkTask>(`/work-management/tasks/${id}/move`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCopyWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<WorkTask>(`/work-management/tasks/${id}/copy`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchiveWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/work-management/tasks/${id}/archive`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSoftDeleteWorkTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/work-management/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWorkComments(taskId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'comments', taskId],
    queryFn: () => apiClient<WorkComment[]>(`/work-management/tasks/${taskId}/comments`),
    enabled: !!taskId,
  });
}

export function useCreateWorkComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string; parentId?: string; mentionIds?: string[] }) =>
      apiClient<WorkComment>(`/work-management/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'comments', taskId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'notifications'] });
    },
  });
}

export function useUpdateWorkComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, mentionIds }: { id: string; body: string; mentionIds?: string[] }) =>
      apiClient<WorkComment>(`/work-management/comments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body, mentionIds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWorkComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/work-management/comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTaskFiles(taskId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'files', taskId],
    queryFn: () => apiClient<WorkAttachment[]>(`/work-management/tasks/${taskId}/files`),
    enabled: !!taskId,
  });
}

export function useProjectDocuments(projectId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'documents', projectId],
    queryFn: () => apiClient<WorkAttachment[]>(`/work-management/projects/${projectId}/documents`),
    enabled: !!projectId,
  });
}

export function useUploadTaskFile(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiUpload<WorkAttachment>(`/work-management/tasks/${taskId}/files`, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'files', taskId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'documents'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'notifications'] });
    },
  });
}

export function useUploadProjectDocument(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiUpload<WorkAttachment>(`/work-management/projects/${projectId}/documents`, fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'documents', projectId] }),
  });
}

export function useDeleteWorkFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/work-management/files/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiClient(`/work-management/tasks/${id}/submit-review`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useApproveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiClient(`/work-management/tasks/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRequestFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiClient(`/work-management/tasks/${id}/request-fix`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTaskStatusHistory(taskId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'history', taskId],
    queryFn: () =>
      apiClient<WorkStatusHistory[]>(`/work-management/tasks/${taskId}/status-history`),
    enabled: !!taskId,
  });
}

export function useTaskReviewEvents(taskId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'reviews', taskId],
    queryFn: () => apiClient<WorkReviewEvent[]>(`/work-management/tasks/${taskId}/review-events`),
    enabled: !!taskId,
  });
}

export function useWorkNotifications() {
  return useQuery({
    queryKey: [...KEY, 'notifications'],
    queryFn: () => apiClient<WorkNotification[]>(`/work-management/notifications`),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/work-management/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient(`/work-management/notifications/read-all`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'notifications'] }),
  });
}

export type WorkTimeLog = {
  id: string;
  taskId: string;
  employeeId: string;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds: number;
  note?: string | null;
  employee?: { id: string; name: string };
  createdAt: string;
};

export function useTaskTimeLogs(taskId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'time-logs', taskId],
    queryFn: () => apiClient<WorkTimeLog[]>(`/work-management/tasks/${taskId}/time-logs`),
    enabled: !!taskId,
  });
}

export function useStartTaskTimer(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient(`/work-management/tasks/${taskId}/time/start`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'time-logs', taskId] }),
  });
}

export function usePauseTaskTimer(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient(`/work-management/tasks/${taskId}/time/pause`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'time-logs', taskId] }),
  });
}

export function useStopTaskTimer(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient(`/work-management/tasks/${taskId}/time/stop`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'time-logs', taskId] }),
  });
}

export function useManualTaskTime(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { durationMinutes: number; note?: string }) =>
      apiClient(`/work-management/tasks/${taskId}/time/manual`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'time-logs', taskId] }),
  });
}
