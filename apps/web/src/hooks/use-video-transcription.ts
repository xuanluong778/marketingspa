import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiUpload } from '@/lib/api-client';

export type VideoTranscriptionDto = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  stage:
    | 'queued'
    | 'validating'
    | 'downloading'
    | 'extracting_audio'
    | 'transcribing'
    | 'cleaning'
    | 'completed'
    | 'failed'
    | 'cancelled';
  sourceType: 'upload' | 'youtube' | 'facebook' | 'tiktok';
  sourceUrl: string | null;
  sourceTitle: string | null;
  thumbnailUrl: string | null;
  originalFilename: string | null;
  language: string;
  ownershipConfirmed: boolean;
  keepVideo?: boolean;
  cancelRequested?: boolean;
  rawTranscript: string | null;
  cleanedTranscript: string | null;
  correctedTranscript: string | null;
  glossaryTerms: string[];
  qualityMeta: unknown;
  durationSeconds: number | null;
  audioDurationSeconds: number | null;
  processedDurationSeconds: number | null;
  chunkCount: number | null;
  chunksCompleted: number | null;
  currentChunkIndex?: number | null;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  resultCharCount: number | null;
  chunks: Array<{
    index: number;
    startSec: number;
    endSec: number;
    status: string;
    charCount: number;
    error: string | null;
    asrEndSec?: number | null;
  }>;
  fileSizeBytes: number | null;
  detectedLanguage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  videoDownloadAvailable?: boolean;
  transcriptDownloadAvailable?: boolean;
  tempExpiresAt?: string | null;
  maxDurationSeconds: number;
  maxFileBytes: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type VideoUrlProbeDto = {
  ok: boolean;
  platform?: 'youtube' | 'facebook' | 'tiktok';
  sourceType?: 'youtube' | 'facebook' | 'tiktok';
  url?: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  errorCode?: string;
  message?: string;
};

const BASE = '/video-transcriptions';
export const VIDEO_TRANSCRIPT_JOB_KEY = 'ms_video_transcript_job_id';

export function useVideoTranscription(id: string | null, poll: boolean) {
  return useQuery({
    queryKey: ['video-transcription', id],
    queryFn: () => apiClient<VideoTranscriptionDto>(`${BASE}/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      if (!poll) return false;
      const status = q.state.data?.status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') return false;
      return 2000;
    },
  });
}

export function useProbeVideoTranscriptionUrl() {
  return useMutation({
    mutationFn: (url: string) =>
      apiClient<VideoUrlProbeDto>(`${BASE}/probe-url`, {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
  });
}

export function useCreateVideoTranscription() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: {
      sourceUrl?: string;
      language: string;
      ownershipConfirmed: boolean;
      keepVideo?: boolean;
      glossary?: string;
      file?: File | null;
      sourceTitle?: string;
      thumbnailUrl?: string;
      durationSeconds?: number | null;
    }) => {
      const fd = new FormData();
      if (input.sourceUrl?.trim()) fd.append('sourceUrl', input.sourceUrl.trim());
      fd.append('language', input.language);
      fd.append('ownershipConfirmed', input.ownershipConfirmed ? 'true' : 'false');
      fd.append('keepVideo', input.keepVideo === true ? 'true' : 'false');
      if (input.glossary?.trim()) fd.append('glossary', input.glossary.trim());
      if (input.sourceTitle?.trim()) fd.append('sourceTitle', input.sourceTitle.trim());
      if (input.thumbnailUrl?.trim()) fd.append('thumbnailUrl', input.thumbnailUrl.trim());
      if (input.durationSeconds != null && Number.isFinite(input.durationSeconds)) {
        fd.append('durationSeconds', String(input.durationSeconds));
      }
      if (input.file) fd.append('file', input.file);
      return apiUpload<VideoTranscriptionDto>(BASE, fd);
    },
    onSuccess: (data) => {
      qc.setQueryData(['video-transcription', data.id], data);
      if (typeof window !== 'undefined') {
        localStorage.setItem(VIDEO_TRANSCRIPT_JOB_KEY, data.id);
      }
    },
  });
}

export function useRetryVideoTranscription() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (id: string) =>
      apiClient<VideoTranscriptionDto>(`${BASE}/${id}/retry`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['video-transcription', data.id], data);
    },
  });
}

export function useCancelVideoTranscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<VideoTranscriptionDto>(`${BASE}/${id}/cancel`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['video-transcription', data.id], data);
    },
  });
}

export function useRetryVideoTranscriptionChunk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; chunkIndex: number }) =>
      apiClient<VideoTranscriptionDto>(`${BASE}/${input.id}/retry-chunk`, {
        method: 'POST',
        body: JSON.stringify({ chunkIndex: input.chunkIndex }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['video-transcription', data.id], data);
    },
  });
}

export function usePatchVideoTranscriptionText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; cleanedTranscript: string }) =>
      apiClient<VideoTranscriptionDto>(`${BASE}/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ cleanedTranscript: input.cleanedTranscript }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(['video-transcription', data.id], data);
    },
  });
}

export function videoDownloadUrl(id: string) {
  return `${BASE}/${id}/download-video`;
}

export function transcriptDownloadUrl(id: string) {
  return `${BASE}/${id}/download-transcript`;
}

export const VIDEO_TRANSCRIPT_SEED_KEY = 'ms_video_transcript_seed';

export function stashTranscriptForArticle(text: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(
    VIDEO_TRANSCRIPT_SEED_KEY,
    JSON.stringify({ text, at: Date.now() }),
  );
}

export function takeTranscriptSeed(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(VIDEO_TRANSCRIPT_SEED_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(VIDEO_TRANSCRIPT_SEED_KEY);
    const parsed = JSON.parse(raw) as { text?: string };
    return typeof parsed.text === 'string' ? parsed.text : null;
  } catch {
    return null;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadPersistedJobId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = localStorage.getItem(VIDEO_TRANSCRIPT_JOB_KEY);
    if (!id) return null;
    if (!UUID_RE.test(id)) {
      localStorage.removeItem(VIDEO_TRANSCRIPT_JOB_KEY);
      return null;
    }
    return id;
  } catch {
    return null;
  }
}

export function clearPersistedJobId() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(VIDEO_TRANSCRIPT_JOB_KEY);
  } catch {
    /* ignore */
  }
}
