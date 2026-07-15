'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContentHistoryModal } from '@/components/content-marketing/content-history-modal';
import { ContentHistoryTable } from '@/components/content-marketing/content-history-table';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  AI_MARKETING_TAB_FILTER_OPTIONS,
} from '@/lib/auto-post-ai-marketing-bridge';
import {
  contentStudioTabToShellTab,
  type ContentAutoPostTab,
} from '@/lib/content-auto-post-routes';
import {
  deleteContentHistoryItem,
  loadContentHistory,
} from '@/lib/content-marketing-form';
import type { ContentHistoryItem, ContentStudioTab } from '@/types/content-marketing';

export function ContentLibraryPanel({
  onEditItem,
  onNavigateTab,
  refreshKey = 0,
}: {
  onEditItem: (item: ContentHistoryItem) => void;
  onNavigateTab: (tab: ContentAutoPostTab) => void;
  refreshKey?: number;
}) {
  const { data: user } = useCurrentUser();
  const [history, setHistory] = useState<ContentHistoryItem[]>([]);
  const [historyTabFilter, setHistoryTabFilter] = useState<ContentStudioTab>('ad');
  const [historyModalItem, setHistoryModalItem] = useState<ContentHistoryItem | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  useEffect(() => {
    setHistory(loadContentHistory(user?.id));
  }, [user?.id, refreshKey]);

  const filteredHistory = useMemo(
    () => history.filter((item) => item.tab === historyTabFilter),
    [history, historyTabFilter],
  );

  const refreshHistory = useCallback(() => {
    setHistory(loadContentHistory(user?.id));
  }, [user?.id]);

  const handleOpenHistory = useCallback((item: ContentHistoryItem) => {
    setHistoryModalItem(item);
    setHistoryModalOpen(true);
  }, []);

  const handleEditHistory = useCallback(
    (item: ContentHistoryItem) => {
      onNavigateTab(contentStudioTabToShellTab(item.tab));
      onEditItem(item);
      setHistoryModalOpen(false);
    },
    [onEditItem, onNavigateTab],
  );

  const handleDeleteHistory = useCallback(
    (item: ContentHistoryItem) => {
      const title = item.title?.trim() || 'bài viết này';
      if (!window.confirm(`Xóa "${title}" khỏi thư viện?`)) return;
      deleteContentHistoryItem(item.id, user?.id);
      if (historyModalItem?.id === item.id) {
        setHistoryModalOpen(false);
        setHistoryModalItem(null);
      }
      refreshHistory();
    },
    [user?.id, historyModalItem, refreshHistory],
  );

  const emptyMessage =
    historyTabFilter === 'ad'
      ? 'Chưa có bài quảng cáo bán hàng trong thư viện'
      : historyTabFilter === 'personal'
        ? 'Chưa có bài xây dựng thương hiệu trong thư viện'
        : 'Chưa có bài viết nâng cao trong thư viện';

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
        Thư viện lưu các bài đã duyệt từ AI. Chọn bài để sửa hoặc gửi sang tab{' '}
        <strong>Auto Post</strong> để đăng Fanpage.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Thư viện bài viết
          {filteredHistory.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({filteredHistory.length})
            </span>
          ) : null}
        </h2>
        <div className="w-full sm:w-64">
          <Select
            value={historyTabFilter}
            onValueChange={(v) => setHistoryTabFilter(v as ContentStudioTab)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MARKETING_TAB_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ContentHistoryTable
        items={filteredHistory}
        onOpen={handleOpenHistory}
        onEdit={handleEditHistory}
        onDelete={handleDeleteHistory}
        emptyMessage={emptyMessage}
      />

      <ContentHistoryModal
        item={historyModalItem}
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
        onEdit={handleEditHistory}
      />
    </section>
  );
}
