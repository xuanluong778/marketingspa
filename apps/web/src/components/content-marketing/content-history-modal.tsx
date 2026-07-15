'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Pencil, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { contentHistoryItemToPayload, sendToAutoPost } from '@/lib/auto-post-ai-marketing-bridge';
import type { ContentHistoryItem } from '@/types/content-marketing';

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

function tabLabel(tab: ContentHistoryItem['tab']): string {
  if (tab === 'personal') return 'Xây Dựng Thương Hiệu';
  if (tab === 'advanced') return 'Viết bài nâng cao';
  return 'Quảng Cáo Bán Hàng';
}

export function ContentHistoryModal({
  item,
  open,
  onOpenChange,
  onEdit,
}: {
  item: ContentHistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: ContentHistoryItem) => void;
}) {
  const router = useRouter();
  const [copyMsg, setCopyMsg] = useState('');

  const handleCopy = useCallback(async () => {
    if (!item?.content?.trim()) return;
    await navigator.clipboard.writeText(item.content);
    setCopyMsg('Đã copy!');
    setTimeout(() => setCopyMsg(''), 2000);
  }, [item]);

  if (!item) return null;

  const score = safeScore(item.contentScore);
  const createdAt = formatCreatedAt(item.createdAt);
  const title = item.title?.trim() || 'Không có tiêu đề';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[80vw] max-w-[80vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[80vw]">
        <DialogHeader className="shrink-0 border-b border-emerald-200 bg-emerald-700 px-6 py-4 pr-14 text-left">
          <DialogTitle className="text-lg font-bold text-white">{title}</DialogTitle>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-emerald-100">
            <span>{tabLabel(item.tab)}</span>
            {score != null ? <span>Điểm: {score}/100</span> : null}
            {createdAt ? <span>Tạo lúc: {createdAt}</span> : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-4">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-800">
            {item.content?.trim() || '—'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-6 py-4">
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleCopy}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            {copyMsg || 'Copy bài viết'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-lg border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            onClick={() => {
              sendToAutoPost(router, contentHistoryItemToPayload(item));
              onOpenChange(false);
            }}
          >
            <Send className="mr-1.5 h-4 w-4" />
            Gửi Auto Post
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-lg border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            onClick={() => {
              onEdit(item);
              onOpenChange(false);
            }}
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            Sửa bài viết
          </Button>
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
