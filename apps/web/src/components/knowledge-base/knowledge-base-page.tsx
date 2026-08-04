'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import {
  useRagKnowledgeBases,
  useCreateRagKb,
  useImportRagKbFile,
  useImportRagKbUrl,
  useImportRagKbText,
  useReindexRagKb,
  useDeleteRagKbDocument,
  useRagKbSearch,
  type RagKnowledgeBase,
} from '@/hooks/use-rag-kb';
import { useChatbotBots } from '@/hooks/use-chatbot-cskh';
import { formatDateTime } from '@/lib/format';

const ACCEPT = '.pdf,.docx,.txt,.csv,application/pdf,text/plain,text/csv';

export function KnowledgeBasePage() {
  const list = useRagKnowledgeBases();
  const createKb = useCreateRagKb();
  const importFile = useImportRagKbFile();
  const importUrl = useImportRagKbUrl();
  const importText = useImportRagKbText();
  const reindex = useReindexRagKb();
  const delDoc = useDeleteRagKbDocument();
  const search = useRagKbSearch();
  const bots = useChatbotBots();

  const [kbId, setKbId] = useState<string>('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const bases = useMemo(() => list.data ?? [], [list.data]);
  const active = useMemo(
    () => bases.find((b) => b.id === kbId) ?? bases.find((b) => b.isDefault) ?? bases[0],
    [bases, kbId],
  );

  useEffect(() => {
    if (!kbId && active?.id) setKbId(active.id);
  }, [active?.id, kbId]);

  if (list.isLoading) return <LoadingState message="Đang tải Knowledge Base…" />;
  if (list.isError) return <ErrorState onRetry={list.refetch} />;

  const ensureKb = async (): Promise<string | null> => {
    if (active?.id) return active.id;
    try {
      const created = await createKb.mutateAsync({
        name: 'Default AI Knowledge Base',
        isDefault: true,
      });
      setKbId(created.id);
      return created.id;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không tạo được KB');
      return null;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-[220px]">
          <Label>Workspace / Knowledge Base</Label>
          <Select value={active?.id ?? ''} onValueChange={setKbId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn KB" />
            </SelectTrigger>
            <SelectContent>
              {bases.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {b.isDefault ? ' (mặc định)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={createKb.isPending}
          onClick={() =>
            createKb.mutate(
              { name: `KB ${new Date().toLocaleDateString('vi-VN')}` },
              {
                onSuccess: (kb) => {
                  setKbId(kb.id);
                  setMsg('Đã tạo Knowledge Base mới (theo organization).');
                },
              },
            )
          }
        >
          Tạo KB
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!active?.id || reindex.isPending}
          onClick={() =>
            active &&
            reindex.mutate(active.id, {
              onSuccess: () => setMsg('Đã xếp hàng re-index.'),
            })
          }
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Re-index
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Dữ liệu tách theo <code>organizationId</code>. Chatbot CSKH dùng knowledge riêng từng bot
        {bots.data?.length
          ? ` (${bots.data.length} bot — quản lý chi tiết tại Chatbot CSKH → Kiến thức)`
          : ''}
        . Tab này dùng RAG Knowledge Base tổ chức.
      </p>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {!active && (
        <EmptyState
          title="Chưa có Knowledge Base"
          description="Bấm «Tạo KB» hoặc import nội dung — hệ thống sẽ tạo KB mặc định."
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload file (PDF / DOCX / TXT / CSV)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="file"
              accept={ACCEPT}
              disabled={importFile.isPending}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const id = await ensureKb();
                if (!id) return;
                importFile.mutate(
                  { id, file },
                  {
                    onSuccess: () => setMsg(`Đã import file: ${file.name}`),
                    onError: (err) =>
                      setMsg(err instanceof Error ? err.message : 'Import file thất bại'),
                  },
                );
              }}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Upload className="h-3 w-3" /> Tối đa theo giới hạn server; trạng thái index hiện ở
              danh sách tài liệu.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nhập URL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Input
              placeholder="Tiêu đề (tuỳ chọn)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!url || importUrl.isPending}
              onClick={async () => {
                const id = await ensureKb();
                if (!id) return;
                importUrl.mutate(
                  { id, url, title: title || undefined },
                  {
                    onSuccess: () => {
                      setUrl('');
                      setTitle('');
                      setMsg('Đã import URL.');
                    },
                    onError: (err) =>
                      setMsg(err instanceof Error ? err.message : 'Import URL thất bại'),
                  },
                );
              }}
            >
              Import URL
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">FAQ / nội dung thủ công</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea
              rows={5}
              placeholder="Nội dung FAQ, chính sách, bảng giá…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!title || !content || importText.isPending}
              onClick={async () => {
                const id = await ensureKb();
                if (!id) return;
                importText.mutate(
                  { id, title, content },
                  {
                    onSuccess: () => {
                      setContent('');
                      setTitle('');
                      setMsg('Đã thêm nội dung text.');
                    },
                    onError: (err) =>
                      setMsg(err instanceof Error ? err.message : 'Thêm text thất bại'),
                  },
                );
              }}
            >
              Lưu nội dung
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tài liệu & trạng thái index</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {active ? <KbStats kb={active} /> : null}
          {!active?.documents?.length && (
            <p className="text-sm text-muted-foreground">Chưa có tài liệu.</p>
          )}
          {active?.documents?.map((doc) => (
            <div key={doc.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.sourceType}
                    {doc.url ? ` · ${doc.url}` : ''} · {formatDateTime(doc.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{doc.status || '—'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setPreviewDocId(doc.id)}>
                    Xem
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={delDoc.isPending}
                    onClick={() =>
                      active &&
                      delDoc.mutate(
                        { kbId: active.id, docId: doc.id },
                        { onSuccess: () => setMsg('Đã xóa tài liệu.') },
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {previewDocId === doc.id && (
                <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-2 max-h-48 overflow-auto">
                  {doc.preview || '(không có preview)'}
                </pre>
              )}
              <p className="text-xs text-muted-foreground">
                chunks {doc.chunkCount} · tokens {doc.tokenCount} · embeddings {doc.embeddingCount}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hỏi thử (search)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md"
              placeholder="Câu hỏi thử…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!query || search.isPending}
              onClick={() =>
                search.mutate({
                  query,
                  knowledgeBaseId: active?.id,
                })
              }
            >
              {search.isPending ? 'Đang tìm…' : 'Tìm'}
            </Button>
          </div>
          {search.data?.results?.length === 0 && (
            <p className="text-sm text-muted-foreground">Không có kết quả.</p>
          )}
          {search.data?.results?.map((r, i) => (
            <div key={`${r.documentId}-${i}`} className="rounded border p-2 text-sm">
              <p className="font-medium">
                {r.title}{' '}
                <span className="text-xs text-muted-foreground">score {r.score.toFixed(3)}</span>
              </p>
              <p className="text-muted-foreground mt-1">{r.excerpt}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KbStats({ kb }: { kb: RagKnowledgeBase }) {
  return (
    <p className="text-xs text-muted-foreground">
      docs {kb.stats.documentCount} · chunks {kb.stats.chunkCount} · embeddings{' '}
      {kb.stats.embeddingCount}/{kb.stats.embeddingTotal} · {kb.stats.tokenLabel}
    </p>
  );
}

export default KnowledgeBasePage;
