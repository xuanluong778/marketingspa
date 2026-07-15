'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, Pencil, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export function ContentHistoryTable({
  items,
  onOpen,
  onEdit,
  onDelete,
  emptyMessage = 'Chưa có bài viết đã lưu',
}: {
  items: ContentHistoryItem[];
  onOpen: (item: ContentHistoryItem) => void;
  onEdit: (item: ContentHistoryItem) => void;
  onDelete: (item: ContentHistoryItem) => void;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback(async (item: ContentHistoryItem) => {
    if (!item.content?.trim()) return;
    await navigator.clipboard.writeText(item.content);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-8 text-center text-sm text-emerald-800">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-emerald-700 text-left text-white">
            <th className="w-[58%] px-4 py-3 font-bold">Chủ đề bài viết</th>
            <th className="min-w-[300px] px-4 py-3 font-bold">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const title = item.title?.trim() || 'Không có tiêu đề';
            const score = safeScore(item.contentScore);
            const createdAt = formatCreatedAt(item.createdAt);
            const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-emerald-50/80';

            return (
              <tr
                key={item.id}
                className={`${rowBg} border-t border-emerald-100 transition-colors hover:bg-emerald-100/60`}
              >
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    className="text-left font-medium text-emerald-900 hover:text-emerald-700 hover:underline"
                    onClick={() => onOpen(item)}
                  >
                    {title}
                  </button>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {score != null ? <span>Điểm: {score}/100</span> : null}
                    {createdAt ? <span>{createdAt}</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  <div className="flex flex-nowrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0 rounded-lg bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
                      onClick={() => onOpen(item)}
                    >
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Mở bài viết
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0 rounded-lg bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
                      onClick={() => handleCopy(item)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      {copiedId === item.id ? 'Đã copy' : 'Copy'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0 rounded-lg bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
                      onClick={() => sendToAutoPost(router, contentHistoryItemToPayload(item))}
                    >
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Auto Post
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0 rounded-lg bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
                      onClick={() => onEdit(item)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Sửa
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 rounded-lg border-red-200 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Xóa
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
