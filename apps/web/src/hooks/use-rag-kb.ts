import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiDownload, apiUpload } from '@/lib/api-client';

export interface RagKbStats {
  documentCount: number;
  chunkCount: number;
  embeddingCount: number;
  embeddingTotal: number;
  tokenCount: number;
  tokenLabel: string;
}

export interface RagKbDocument {
  id: string;
  title: string;
  sourceType: string;
  url?: string | null;
  chunkCount: number;
  tokenCount: number;
  embeddingCount: number;
  status: string;
  preview: string;
  createdAt: string;
}

export interface RagKnowledgeBase {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  stats: RagKbStats;
  documents: RagKbDocument[];
}

const KEY = ['rag-kb'];

export function useRagKnowledgeBases() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiClient<RagKnowledgeBase[]>('/rag-kb'),
  });
}

export function useCreateRagKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; isDefault?: boolean }) =>
      apiClient<RagKnowledgeBase>('/rag-kb', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateRagKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      isDefault?: boolean;
    }) =>
      apiClient<RagKnowledgeBase>(`/rag-kb/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteRagKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/rag-kb/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReindexRagKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<RagKnowledgeBase>(`/rag-kb/${id}/reindex`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useImportRagKbFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiUpload<RagKnowledgeBase>(`/rag-kb/${id}/import/file`, fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useImportRagKbUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, url, title }: { id: string; url: string; title?: string }) =>
      apiClient<RagKnowledgeBase>(`/rag-kb/${id}/import/url`, {
        method: 'POST',
        body: JSON.stringify({ url, title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useImportRagKbText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title, content }: { id: string; title: string; content: string }) =>
      apiClient<RagKnowledgeBase>(`/rag-kb/${id}/import/text`, {
        method: 'POST',
        body: JSON.stringify({ title, content }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface RagKbDocumentDetail extends RagKbDocument {
  content: string;
  contentLength: number;
  chunks: Array<{
    index: number;
    text: string;
    charCount: number;
    tokenEstimate: number;
  }>;
  updatedAt?: string;
}

export function useRagKbDocument(kbId: string | null, docId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'document', kbId, docId],
    queryFn: () =>
      apiClient<RagKbDocumentDetail>(`/rag-kb/${kbId}/documents/${docId}`),
    enabled: Boolean(kbId && docId && enabled),
  });
}

export function useDownloadRagKbDocument() {
  return useMutation({
    mutationFn: async ({ kbId, docId }: { kbId: string; docId: string }) => {
      const { blob, filename } = await apiDownload(
        `/rag-kb/${kbId}/documents/${docId}/download`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return filename;
    },
  });
}

export function useDeleteRagKbDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kbId, docId }: { kbId: string; docId: string }) =>
      apiClient(`/rag-kb/${kbId}/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRagKbSearch() {
  return useMutation({
    mutationFn: (body: { query: string; knowledgeBaseId?: string }) =>
      apiClient<{
        query: string;
        results: Array<{
          knowledgeBaseId: string;
          knowledgeBaseName: string;
          documentId: string;
          title: string;
          score: number;
          excerpt: string;
        }>;
      }>('/rag-kb/search', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
