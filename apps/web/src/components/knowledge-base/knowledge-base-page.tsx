'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Download,
  FileText,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import {
  useRagKnowledgeBases,
  useCreateRagKb,
  useUpdateRagKb,
  useDeleteRagKb,
  useImportRagKbFile,
  useImportRagKbUrl,
  useImportRagKbText,
  useReindexRagKb,
  useDeleteRagKbDocument,
  useDownloadRagKbDocument,
  useRagKbDocument,
  useRagKbSearch,
  type RagKnowledgeBase,
  type RagKbDocument,
} from '@/hooks/use-rag-kb';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';

type ViewMode = 'list' | 'guide' | 'search';

const ACCEPT = '.pdf,.docx,.txt,.csv,application/pdf,text/plain,text/csv';

/** UI Knowledge Base theo layout RAG (danh sách card + Import / Reindex). */
export function KnowledgeBasePage() {
  const list = useRagKnowledgeBases();
  const createKb = useCreateRagKb();
  const updateKb = useUpdateRagKb();
  const deleteKb = useDeleteRagKb();
  const importFile = useImportRagKbFile();
  const importUrl = useImportRagKbUrl();
  const importText = useImportRagKbText();
  const reindex = useReindexRagKb();
  const delDoc = useDeleteRagKbDocument();
  const downloadDoc = useDownloadRagKbDocument();
  const search = useRagKbSearch();

  const [view, setView] = useState<ViewMode>('list');
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editKb, setEditKb] = useState<RagKnowledgeBase | null>(null);
  const [importKb, setImportKb] = useState<RagKnowledgeBase | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [importUrlValue, setImportUrlValue] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [importContent, setImportContent] = useState('');
  const [previewDoc, setPreviewDoc] = useState<{
    kb: RagKnowledgeBase;
    doc: RagKbDocument;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fullDoc = useRagKbDocument(
    previewDoc?.kb.id ?? null,
    previewDoc?.doc.id ?? null,
    !!previewDoc,
  );

  const bases = useMemo(() => list.data ?? [], [list.data]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  if (list.isLoading) return <LoadingState message="Đang tải Knowledge Base…" />;
  if (list.isError) return <ErrorState onRetry={list.refetch} />;

  return (
    <div className="space-y-5 -mt-1">
      {/* Header giống layout product RAG */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Knowledge Base</h2>
            <span title="Dữ liệu tham khảo dùng cho AI (RAG)">
              <Info className="h-4 w-4 text-muted-foreground" />
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý dữ liệu tham khảo để tạo bài viết chính xác với RAG
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarBtn active={view === 'guide'} onClick={() => setView('guide')}>
          Hướng dẫn RAG
        </ToolbarBtn>
        <ToolbarBtn active={view === 'list'} onClick={() => setView('list')}>
          Danh sách KB ({bases.length})
        </ToolbarBtn>
        <ToolbarBtn active={view === 'search'} onClick={() => setView('search')}>
          <Search className="h-3.5 w-3.5 mr-1.5" />
          Test Search
        </ToolbarBtn>
        <Button
          size="sm"
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-[0_0_12px_rgba(16,185,129,0.35)]"
          disabled={createKb.isPending}
          onClick={() => {
            setNewName('');
            setNewDesc('');
            setCreateOpen(true);
          }}
        >
          + Tạo KB
        </Button>
      </div>

      {toast && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-md px-3 py-2">
          {toast}
        </p>
      )}

      {view === 'guide' && <GuidePanel />}

      {view === 'search' && (
        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md"
              placeholder="Nhập câu hỏi test search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!searchQuery.trim() || search.isPending}
              onClick={() => search.mutate({ query: searchQuery.trim() })}
            >
              {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tìm'}
            </Button>
          </div>
          {search.data?.results?.length === 0 && (
            <p className="text-sm text-muted-foreground">Không có kết quả.</p>
          )}
          {search.data?.results?.map((r, i) => (
            <div key={`${r.documentId}-${i}`} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {r.title}{' '}
                <span className="text-xs text-muted-foreground">
                  · {r.knowledgeBaseName} · score {r.score.toFixed(3)}
                </span>
              </p>
              <p className="text-muted-foreground mt-1">{r.excerpt}</p>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-4">
          {bases.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium text-foreground">Chưa có Knowledge Base</p>
              <p className="text-sm mt-1">Nhấn «+ Tạo KB» để bắt đầu.</p>
            </div>
          )}

          {bases.map((kb, index) => (
            <KbCard
              key={kb.id}
              kb={kb}
              index={index}
              busyId={
                reindex.isPending
                  ? (reindex.variables as string | undefined)
                  : deleteKb.isPending
                    ? (deleteKb.variables as string | undefined)
                    : null
              }
              onImport={() => {
                setImportKb(kb);
                setImportUrlValue('');
                setImportTitle('');
                setImportContent('');
              }}
              onReindex={() =>
                reindex.mutate(kb.id, {
                  onSuccess: () => flash(`Đã reindex «${kb.name}».`),
                  onError: (e) => flash(e instanceof Error ? e.message : 'Reindex thất bại'),
                })
              }
              onEdit={() => {
                setEditKb(kb);
                setEditName(kb.name);
                setEditDesc(kb.description || '');
              }}
              onDelete={() => {
                if (!window.confirm(`Xóa Knowledge Base «${kb.name}»?`)) return;
                deleteKb.mutate(kb.id, {
                  onSuccess: () => flash('Đã xóa Knowledge Base.'),
                  onError: (e) => flash(e instanceof Error ? e.message : 'Xóa thất bại'),
                });
              }}
              onPreviewDoc={(doc) => setPreviewDoc({ kb, doc })}
              onDownloadDoc={(doc) =>
                downloadDoc.mutate(
                  { kbId: kb.id, docId: doc.id },
                  {
                    onSuccess: (filename) => flash(`Đã tải «${filename}».`),
                    onError: (e) =>
                      flash(e instanceof Error ? e.message : 'Tải về thất bại'),
                  },
                )
              }
              downloadingDocId={
                downloadDoc.isPending
                  ? (downloadDoc.variables as { docId?: string } | undefined)?.docId
                  : null
              }
              onDeleteDoc={(doc) => {
                if (!window.confirm(`Xóa tài liệu «${doc.title}»?`)) return;
                delDoc.mutate(
                  { kbId: kb.id, docId: doc.id },
                  {
                    onSuccess: () => flash('Đã xóa tài liệu.'),
                    onError: (e) => flash(e instanceof Error ? e.message : 'Xóa tài liệu thất bại'),
                  },
                );
              }}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tên</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: it siêu tốc"
              />
            </div>
            <div className="space-y-1">
              <Label>Mô tả (tuỳ chọn)</Label>
              <Textarea rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!newName.trim() || createKb.isPending}
              onClick={() =>
                createKb.mutate(
                  {
                    name: newName.trim(),
                    description: newDesc.trim() || undefined,
                    isDefault: bases.length === 0,
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      setView('list');
                      flash('Đã tạo Knowledge Base.');
                    },
                    onError: (e) => flash(e instanceof Error ? e.message : 'Tạo KB thất bại'),
                  },
                )
              }
            >
              {createKb.isPending ? 'Đang tạo…' : 'Tạo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editKb} onOpenChange={(o) => !o && setEditKb(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tên</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Mô tả</Label>
              <Textarea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editKb?.isDefault ?? false}
                onChange={(e) => setEditKb((k) => (k ? { ...k, isDefault: e.target.checked } : k))}
              />
              Đặt làm mặc định
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKb(null)}>
              Huỷ
            </Button>
            <Button
              disabled={!editKb || !editName.trim() || updateKb.isPending}
              onClick={() => {
                if (!editKb) return;
                updateKb.mutate(
                  {
                    id: editKb.id,
                    name: editName.trim(),
                    description: editDesc,
                    isDefault: editKb.isDefault,
                  },
                  {
                    onSuccess: () => {
                      setEditKb(null);
                      flash('Đã cập nhật Knowledge Base.');
                    },
                    onError: (e) => flash(e instanceof Error ? e.message : 'Cập nhật thất bại'),
                  },
                );
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={!!importKb} onOpenChange={(o) => !o && setImportKb(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import — {importKb?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>File (PDF / DOCX / TXT / CSV)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                disabled={importFile.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file || !importKb) return;
                  importFile.mutate(
                    { id: importKb.id, file },
                    {
                      onSuccess: () => {
                        flash(`Đã import «${file.name}».`);
                        setImportKb(null);
                        setView('list');
                      },
                      onError: (err) =>
                        flash(err instanceof Error ? err.message : 'Import file thất bại'),
                    },
                  );
                }}
              />
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label>URL</Label>
              <Input
                placeholder="https://…"
                value={importUrlValue}
                onChange={(e) => setImportUrlValue(e.target.value)}
              />
              <Input
                placeholder="Tiêu đề (tuỳ chọn)"
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!importUrlValue || importUrl.isPending || !importKb}
                onClick={() => {
                  if (!importKb) return;
                  importUrl.mutate(
                    {
                      id: importKb.id,
                      url: importUrlValue,
                      title: importTitle || undefined,
                    },
                    {
                      onSuccess: () => {
                        flash('Đã import URL.');
                        setImportKb(null);
                      },
                      onError: (err) =>
                        flash(err instanceof Error ? err.message : 'Import URL thất bại'),
                    },
                  );
                }}
              >
                Import URL
              </Button>
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label>FAQ / nội dung thủ công</Label>
              <Input
                placeholder="Tiêu đề"
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
              />
              <Textarea
                rows={4}
                placeholder="Nội dung…"
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !importTitle.trim() || !importContent.trim() || importText.isPending || !importKb
                }
                onClick={() => {
                  if (!importKb) return;
                  importText.mutate(
                    {
                      id: importKb.id,
                      title: importTitle.trim(),
                      content: importContent.trim(),
                    },
                    {
                      onSuccess: () => {
                        flash('Đã thêm nội dung.');
                        setImportKb(null);
                      },
                      onError: (err) =>
                        flash(err instanceof Error ? err.message : 'Thêm text thất bại'),
                    },
                  );
                }}
              >
                Lưu nội dung
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview document — full content */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewDoc?.doc.title}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {fullDoc.data?.sourceType ?? previewDoc?.doc.sourceType}
            {(fullDoc.data?.url ?? previewDoc?.doc.url)
              ? ` · ${fullDoc.data?.url ?? previewDoc?.doc.url}`
              : ''}{' '}
            · {previewDoc ? formatDateTime(previewDoc.doc.createdAt) : ''} ·{' '}
            {fullDoc.data?.status ?? previewDoc?.doc.status}
            {fullDoc.data
              ? ` · ${fullDoc.data.contentLength.toLocaleString()} ký tự · ${fullDoc.data.chunkCount} chunks · ${fullDoc.data.tokenCount} tokens`
              : ''}
          </p>
          {fullDoc.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải toàn bộ nội dung…
            </div>
          ) : fullDoc.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {(fullDoc.error as Error)?.message || 'Không tải được nội dung tài liệu.'}
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
              <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-3 max-h-[50vh] overflow-auto">
                {fullDoc.data?.content || '(không có nội dung)'}
              </pre>
              {fullDoc.data?.chunks && fullDoc.data.chunks.length > 0 ? (
                <details className="rounded-md border border-border/70">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                    Xem {fullDoc.data.chunks.length} chunks
                  </summary>
                  <div className="max-h-56 space-y-2 overflow-auto border-t px-3 py-2">
                    {fullDoc.data.chunks.map((chunk) => (
                      <div key={chunk.index} className="rounded border bg-muted/50 p-2 text-xs">
                        <p className="mb-1 text-[11px] text-muted-foreground">
                          Chunk #{chunk.index} · {chunk.charCount} ký tự · ~{chunk.tokenEstimate}{' '}
                          tokens
                        </p>
                        <pre className="whitespace-pre-wrap">{chunk.text}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={!previewDoc || downloadDoc.isPending}
              onClick={() => {
                if (!previewDoc) return;
                downloadDoc.mutate(
                  { kbId: previewDoc.kb.id, docId: previewDoc.doc.id },
                  {
                    onSuccess: (filename) => flash(`Đã tải «${filename}».`),
                    onError: (e) =>
                      flash(e instanceof Error ? e.message : 'Tải về thất bại'),
                  },
                );
              }}
            >
              {downloadDoc.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1" />
              )}
              Tải về
            </Button>
            <Button variant="secondary" onClick={() => setPreviewDoc(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-emerald-500/70 text-emerald-500 bg-emerald-500/10'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function KbCard({
  kb,
  index,
  busyId,
  onImport,
  onReindex,
  onEdit,
  onDelete,
  onPreviewDoc,
  onDownloadDoc,
  downloadingDocId,
  onDeleteDoc,
}: {
  kb: RagKnowledgeBase;
  index: number;
  busyId?: string | null;
  onImport: () => void;
  onReindex: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPreviewDoc: (doc: RagKbDocument) => void;
  onDownloadDoc: (doc: RagKbDocument) => void;
  downloadingDocId?: string | null;
  onDeleteDoc: (doc: RagKbDocument) => void;
}) {
  const busy = busyId === kb.id;
  const shortId = String(index + 1);

  return (
    <div className="rounded-xl border border-border/70 bg-card/80 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold truncate">{kb.name}</h3>
              <Badge variant="secondary" className="font-normal text-[11px]">
                USER #{shortId}
              </Badge>
              {kb.isDefault && (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[11px]">
                  MẶC ĐỊNH
                </Badge>
              )}
            </div>
            {kb.description ? (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{kb.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white h-8"
              onClick={onImport}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Import
            </Button>
            <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={onReindex}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', busy && 'animate-spin')} />
              Reindex
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Sửa
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-destructive border-destructive/30"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label="Tài liệu" value={kb.stats.documentCount} />
          <StatBox label="Chunks" value={kb.stats.chunkCount} />
          <StatBox
            label="Embeddings"
            value={`${kb.stats.embeddingCount}/${kb.stats.embeddingTotal}`}
          />
          <StatBox label="Tokens" value={kb.stats.tokenLabel || kb.stats.tokenCount} />
        </div>

        {kb.documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 py-10 px-4 text-center">
            <FileText className="h-9 w-9 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              Chưa có tài liệu nào. Nhấn Import để thêm.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {kb.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.sourceType} · {doc.status} · chunks {doc.chunkCount}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => onPreviewDoc(doc)}
                  >
                    Xem
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={downloadingDocId === doc.id}
                    onClick={() => onDownloadDoc(doc)}
                  >
                    {downloadingDocId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1" />
                    )}
                    Tải về
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive"
                    onClick={() => onDeleteDoc(doc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-center">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function GuidePanel() {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3 text-sm text-muted-foreground max-w-3xl">
      <h3 className="text-base font-semibold text-foreground">Hướng dẫn RAG (Knowledge Base)</h3>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Tạo một KB cho từng chủ đề / thương hiệu (ví dụ website spa, bảng giá, FAQ).</li>
        <li>
          Import tài liệu: file PDF/DOCX/TXT/CSV, URL trang web, hoặc dán nội dung FAQ thủ công.
        </li>
        <li>
          Chờ trạng thái index xong (chunks / embeddings). Dùng <strong>Reindex</strong> nếu đổi nội
          dung.
        </li>
        <li>
          Dùng <strong>Test Search</strong> để kiểm tra truy vấn trước khi dùng trong Content Studio
          / Chatbot.
        </li>
        <li>Mỗi KB thuộc organization hiện tại — không trộn dữ liệu giữa các spa khác.</li>
      </ol>
    </div>
  );
}

export default KnowledgeBasePage;
