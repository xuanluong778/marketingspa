/**
 * Client multipart upload for teleprompter recordings.
 * Explicit user action only — never auto-upload.
 */
import { apiClient, ApiError, getApiBaseUrl } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';

export type TeleprompterRecordingDto = {
  id: string;
  title: string;
  recordingType: string;
  mimeType: string;
  size: number;
  duration: number;
  status: string;
  teleprompterSourceId: string | null;
  sourceTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InitUploadResult = {
  id: string;
  uploadId: string;
  partSize: number;
  maxPartSize: number;
  totalParts: number;
  maxFileBytes: number;
  expiresInSec: number;
};

export type UploadProgress = {
  phase: 'init' | 'uploading' | 'completing' | 'done' | 'error' | 'cancelled';
  uploadedBytes: number;
  totalBytes: number;
  part: number;
  totalParts: number;
  message?: string;
  online: boolean;
};

const DEFAULT_PART = 5 * 1024 * 1024;

async function authFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = authStorage.getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Do not set Content-Type for FormData
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (res.status === 401) {
    throw new ApiError('Phiên đăng nhập hết hạn', 401);
  }
  return res;
}

export async function listTeleprompterRecordings(): Promise<TeleprompterRecordingDto[]> {
  try {
    const res = await apiClient<{ items: TeleprompterRecordingDto[] }>(
      '/content-marketing/teleprompter-recordings?status=ready&limit=50',
    );
    return res.items || [];
  } catch (err) {
    // Don't let a list failure wipe the teleprompter session UX; rethrow for UI message
    throw err;
  }
}

export async function renameTeleprompterRecording(
  id: string,
  title: string,
): Promise<TeleprompterRecordingDto> {
  return apiClient(`/content-marketing/teleprompter-recordings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export async function deleteTeleprompterRecording(id: string): Promise<void> {
  await apiClient(`/content-marketing/teleprompter-recordings/${id}`, {
    method: 'DELETE',
  });
}

export async function createDownloadUrl(
  id: string,
): Promise<{ url: string; path: string; expiresAt: string; filename: string }> {
  return apiClient(`/content-marketing/teleprompter-recordings/${id}/download-url`, {
    method: 'POST',
  });
}

export type UploadRecordingParams = {
  blob: Blob;
  title: string;
  recordingType: string;
  mimeType: string;
  duration: number;
  teleprompterSourceId?: string | null;
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
};

export async function uploadTeleprompterRecording(
  params: UploadRecordingParams,
): Promise<TeleprompterRecordingDto> {
  const {
    blob,
    title,
    recordingType,
    mimeType,
    duration,
    teleprompterSourceId,
    signal,
    onProgress,
  } = params;
  const totalBytes = blob.size;
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const report = (partial: Partial<UploadProgress> & { phase: UploadProgress['phase'] }) => {
    onProgress?.({
      uploadedBytes: 0,
      totalBytes,
      part: 0,
      totalParts: 0,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      ...partial,
    });
  };

  if (!online) {
    report({ phase: 'error', message: 'Mất mạng — không thể upload' });
    throw new ApiError('Mất mạng — kiểm tra kết nối rồi thử lại', 0);
  }

  report({ phase: 'init' });

  const init = await apiClient<InitUploadResult>(
    '/content-marketing/teleprompter-recordings/upload/init',
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        recordingType,
        mimeType: mimeType.split(';')[0] || mimeType,
        size: totalBytes,
        duration: Math.round(duration || 0),
        teleprompterSourceId: teleprompterSourceId || undefined,
        partSize: DEFAULT_PART,
      }),
      signal,
    },
  );

  const partSize = init.partSize || DEFAULT_PART;
  const totalParts = init.totalParts || Math.ceil(totalBytes / partSize);
  const partsMeta: Array<{ partNumber: number; etag: string }> = [];
  let uploaded = 0;

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    if (signal?.aborted) {
      try {
        await apiClient(`/content-marketing/teleprompter-recordings/${init.id}/cancel`, {
          method: 'POST',
        });
      } catch {
        /* ignore */
      }
      report({ phase: 'cancelled', uploadedBytes: uploaded, totalParts, part: partNumber });
      throw new ApiError('Đã hủy upload', 0, undefined, 'UPLOAD_CANCELLED');
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      report({
        phase: 'error',
        uploadedBytes: uploaded,
        totalParts,
        part: partNumber,
        message: 'Mất mạng giữa chừng',
        online: false,
      });
      throw new ApiError('Mất mạng giữa chừng — bấm Thử lại để tiếp tục (cần upload lại)', 0);
    }

    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, totalBytes);
    const chunk = blob.slice(start, end);
    const fd = new FormData();
    fd.append('chunk', chunk, `part-${partNumber}.bin`);

    report({
      phase: 'uploading',
      uploadedBytes: uploaded,
      part: partNumber,
      totalParts,
    });

    const res = await authFetch(
      `/content-marketing/teleprompter-recordings/${init.id}/parts/${partNumber}`,
      { method: 'POST', body: fd, signal },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      report({
        phase: 'error',
        uploadedBytes: uploaded,
        part: partNumber,
        totalParts,
        message: body.message || res.statusText,
      });
      throw new ApiError(body.message || 'Upload part thất bại', res.status);
    }
    const partRes = (await res.json()) as { etag: string; partNumber: number };
    partsMeta.push({ partNumber: partRes.partNumber, etag: partRes.etag });
    uploaded = end;
    report({
      phase: 'uploading',
      uploadedBytes: uploaded,
      part: partNumber,
      totalParts,
    });
  }

  report({ phase: 'completing', uploadedBytes: totalBytes, part: totalParts, totalParts });
  const done = await apiClient<TeleprompterRecordingDto>(
    `/content-marketing/teleprompter-recordings/${init.id}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ parts: partsMeta }),
      signal,
    },
  );
  report({ phase: 'done', uploadedBytes: totalBytes, part: totalParts, totalParts });
  return done;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
