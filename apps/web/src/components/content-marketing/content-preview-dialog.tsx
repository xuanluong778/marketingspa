'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { FacebookPostContent } from '@/components/content-marketing/facebook-post-content';

function safeScore(n: number | undefined | null): number | null {
  if (n == null || !Number.isFinite(n) || Number.isNaN(n)) return null;
  return Math.round(n);
}

function formatCreatedAt(iso?: string): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN');
}

export function ContentPreviewDialog({
  open,
  onOpenChange,
  title,
  category,
  score,
  createdAt,
  content,
  onContentChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  category: string;
  score?: number | null;
  createdAt?: string;
  content: string;
  onContentChange?: (value: string) => void;
}) {
  const [copyMsg, setCopyMsg] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  const handleCopy = useCallback(async () => {
    if (!content.trim()) return;
    await navigator.clipboard.writeText(content);
    setCopyMsg('Đã copy!');
    setTimeout(() => setCopyMsg(''), 2000);
  }, [content]);

  const scoreDisplay = safeScore(score);
  const createdLabel = formatCreatedAt(createdAt);
  const displayTitle = title?.trim() || 'Không có tiêu đề';
  const canEdit = Boolean(onContentChange);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[80vw] max-w-[80vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[80vw]">
        <DialogHeader className="shrink-0 border-b border-emerald-200 bg-emerald-700 px-6 py-4 pr-14 text-left">
          <DialogTitle className="text-lg font-bold text-white">{displayTitle}</DialogTitle>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-emerald-100">
            <span>{category}</span>
            {scoreDisplay != null ? <span>Điểm: {scoreDisplay}/100</span> : null}
            {createdLabel ? <span>Tạo lúc: {createdLabel}</span> : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-4">
          {editing && onContentChange ? (
            <Textarea
              className="min-h-[min(480px,50vh)] resize-y border-slate-200 text-base leading-relaxed focus-visible:ring-emerald-500"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
            />
          ) : (
            <FacebookPostContent content={content} />
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-6 py-4">
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleCopy}
            disabled={!content.trim()}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            {copyMsg || 'Copy bài viết'}
          </Button>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              {editing ? 'Xem bài viết' : 'Sửa bài viết'}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1.5 h-4 w-4" />
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
