import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiUpload } from '@/lib/api-client';

export type VideoTranscriptionDto = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage:
    | 'queued'
    | 'validating'
    | 'extracting_audio'
    | 'transcribing'
    | 'cleaning'
    | 'completed'
    | 'failed';
  sourceType: 'upload' | 'youtube';
  sourceUrl: string | null;
  originalFilename: string | null;
  language: string;
  ownershipConfirmed: boolean;
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
  }>;
  fileSizeBytes: number | null;
  detectedLanguage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  maxDurationSeconds: number;
  maxFileBytes: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const BASE = '/video-transcriptions';

export function useVideoTranscription(id: string | null, poll: boolean) {
  return useQuery({
    queryKey: ['video-transcription', id],
    queryFn: () => apiClient<VideoTranscriptionDto>(`${BASE}/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      if (!poll) return false;
      const status = q.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 2000;
    },
  });
}

export function useCreateVideoTranscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceUrl?: string;
      language: string;
      ownershipConfirmed: boolean;
      glossary?: string;
      file?: File | null;
    }) => {
      const fd = new FormData();
      if (input.sourceUrl?.trim()) fd.append('sourceUrl', input.sourceUrl.trim());
      fd.append('language', input.language);
      fd.append('ownershipConfirmed', input.ownershipConfirmed ? 'true' : 'false');
      if (input.glossary?.trim()) fd.append('glossary', input.glossary.trim());
      if (input.file) fd.append('file', input.file);
      return apiUpload<VideoTranscriptionDto>(BASE, fd);
    },
    onSuccess: (data) => {
      qc.setQueryData(['video-transcription', data.id], data);
    },
  });
}

export function useRetryVideoTranscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<VideoTranscriptionDto>(`${BASE}/${id}/retry`, { method: 'POST' }),
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
