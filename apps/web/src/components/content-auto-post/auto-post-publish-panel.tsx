'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Loader2, Save, Send } from 'lucide-react';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { MetaFanpageAutoPostPanel } from '@/components/content-auto-post/meta-fanpage-auto-post-panel';
import { FacebookFanpagePreview } from '@/components/auto-post/facebook-fanpage-preview';
import { AiMarketingPostPicker } from '@/components/auto-post/ai-marketing-post-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/use-auth';
import {
  useAutoPostFacebookStatus,
  useAutoPostMutations,
} from '@/hooks/use-auto-post';
import { loadContentHistory } from '@/lib/content-marketing-form';
import {
  clearPendingAutoPost,
  AI_MARKETING_TAB_FILTER_OPTIONS,
  mapAiTabToAutoPostType,
  resolveAutoPostFromAi,
  type AiMarketingPostPayload,
} from '@/lib/auto-post-ai-marketing-bridge';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import type { ContentStudioTab } from '@/types/content-marketing';
import { formatMutationError } from '@/lib/format-mutation-error';

export function AutoPostPublishPanel({
  libraryRefreshKey = 0,
  onScheduled,
}: {
  libraryRefreshKey?: number;
  onScheduled?: () => void;
}) {
  const searchParams = useSearchParams();
  const { data: user } = useCurrentUser();
  const { data: fbStatus, isLoading: fbLoading } = useAutoPostFacebookStatus();
  const mutations = useAutoPostMutations();

  const [aiPosts, setAiPosts] = useState(() => loadContentHistory(user?.id));
  const [tabFilter, setTabFilter] = useState<ContentStudioTab>('ad');
  const [selected, setSelected] = useState<AiMarketingPostPayload | null>(null);
  const [caption, setCaption] = useState('');
  const [fanpageId, setFanpageId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const refreshAiPosts = useCallback(() => {
    setAiPosts(loadContentHistory(user?.id));
  }, [user?.id]);

  useEffect(() => {
    refreshAiPosts();
  }, [refreshAiPosts, libraryRefreshKey]);

  useEffect(() => {
    const fromId = searchParams.get('from');
    const payload = resolveAutoPostFromAi(user?.id, fromId);
    if (payload) {
      setTabFilter(payload.tab);
      setSelected(payload);
      setCaption(payload.content);
      clearPendingAutoPost();
    }
  }, [searchParams, user?.id]);

  const applySelection = useCallback((payload: AiMarketingPostPayload) => {
    setSelected(payload);
    setCaption(payload.content);
    setDraftId(undefined);
    setErrorMsg('');
  }, []);

  const filteredAiPosts = useMemo(
    () => aiPosts.filter((item) => item.tab === tabFilter),
    [aiPosts, tabFilter],
  );

  const emptyFilterMessage =
    tabFilter === 'ad'
      ? 'Chưa có bài quảng cáo — tạo tại tab Tạo Content hoặc lưu vào thư viện'
      : tabFilter === 'personal'
        ? 'Chưa có bài thương hiệu — tạo tại tab Xây dựng thương hiệu'
        : 'Chưa có bài nâng cao — tạo tại tab Tạo Content';

  const handleTabFilterChange = useCallback(
    (value: ContentStudioTab) => {
      setTabFilter(value);
      if (selected && selected.tab !== value) {
        setSelected(null);
        setCaption('');
        setDraftId(undefined);
      }
    },
    [selected],
  );

  const selectedPage = useMemo(
    () => fbStatus?.pages.find((p) => p.id === fanpageId),
    [fbStatus?.pages, fanpageId],
  );

  const isBusy =
    mutations.saveDraft.isPending ||
    mutations.publishNow.isPending ||
    mutations.schedule.isPending;

  const buildDraftPayload = () => {
    if (!selected) throw new Error('Chưa chọn bài');
    return {
      id: draftId,
      postType: mapAiTabToAutoPostType(selected.tab),
      topic: selected.title,
      caption,
      fanpageId: fanpageId || undefined,
      imageUrl: imageUrl || undefined,
      linkUrl: linkUrl || undefined,
    };
  };

  const handleSaveDraft = async () => {
    if (!selected || !caption.trim()) {
      setErrorMsg('Chọn bài và kiểm tra nội dung trước khi lưu');
      return;
    }
    setErrorMsg('');
    try {
      const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
      setDraftId(saved.id);
      setMsg('Đã lưu nháp đăng bài!');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const ensureDraft = async (): Promise<string> => {
    if (draftId) return draftId;
    const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
    setDraftId(saved.id);
    return saved.id;
  };

  const handlePublishNow = async () => {
    if (!selected) {
      setErrorMsg('Vui lòng chọn bài từ thư viện');
      return;
    }
    if (!fanpageId) {
      setErrorMsg('Vui lòng chọn Fanpage — kết nối tại tab Kết nối kênh nếu chưa có');
      return;
    }
    if (!caption.trim()) {
      setErrorMsg('Nội dung bài đăng không được trống');
      return;
    }
    if (!window.confirm('Bạn đã duyệt nội dung và muốn đăng ngay lên Fanpage?')) return;

    setErrorMsg('');
    try {
      const postId = await ensureDraft();
      await mutations.publishNow.mutateAsync(postId);
      setMsg('Đã đăng bài thành công!');
      onScheduled?.();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleSchedule = async () => {
    if (!selected) {
      setErrorMsg('Vui lòng chọn bài từ thư viện');
      return;
    }
    if (!fanpageId) {
      setErrorMsg('Vui lòng chọn Fanpage');
      return;
    }
    if (!caption.trim()) {
      setErrorMsg('Nội dung bài đăng không được trống');
      return;
    }
    if (!scheduledAt) {
      setErrorMsg('Vui lòng chọn thời gian lên lịch');
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      setErrorMsg('Không thể lên lịch ở thời gian quá khứ');
      return;
    }
    if (
      !window.confirm(
        `Lên lịch đăng lúc ${new Date(scheduledAt).toLocaleString('vi-VN')}?`,
      )
    ) {
      return;
    }

    setErrorMsg('');
    try {
      const postId = await ensureDraft();
      await mutations.schedule.mutateAsync({
        postId,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      setMsg('Đã lên lịch đăng bài! Xem tại tab Lịch đăng.');
      onScheduled?.();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  return (
    <div className="space-y-6">
      <MetaFanpageAutoPostPanel />

      <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
        Quy trình (OAuth Fanpage): chọn bài từ thư viện → duyệt/sửa caption → chọn Fanpage → đăng ngay
        hoặc lên lịch.
      </div>

      {!fbStatus?.connected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chưa kết nối Facebook.{' '}
          <Link href={buildContentAutoPostHref('channels')} className="font-medium underline">
            Kết nối kênh
          </Link>{' '}
          trước khi đăng bài.
        </div>
      )}

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      )}
      {errorMsg && <ErrorState message={errorMsg} onRetry={() => setErrorMsg('')} />}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-lg">
                Chọn bài từ thư viện
                {filteredAiPosts.length > 0 ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({filteredAiPosts.length})
                  </span>
                ) : null}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div className="w-full sm:w-64">
                <Select
                  value={tabFilter}
                  onValueChange={(v) => handleTabFilterChange(v as ContentStudioTab)}
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
              <Button variant="ghost" size="sm" onClick={refreshAiPosts}>
                Làm mới
              </Button>
            </div>
          </div>
          <AiMarketingPostPicker
            items={filteredAiPosts}
            selectedId={selected?.historyId}
            onSelect={applySelection}
            emptyMessage={emptyFilterMessage}
          />
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold text-lg">Preview Facebook</h2>
          {selected ? (
            <>
              <div className="rounded-lg bg-slate-50 border px-3 py-2 text-sm">
                <span className="text-muted-foreground">Nguồn: </span>
                <span className="font-medium">{selected.sourceLabel}</span>
                <span className="text-muted-foreground"> · </span>
                <span className="font-medium">{selected.title}</span>
              </div>
              <FacebookFanpagePreview
                pageName={selectedPage?.pageName ?? 'Fanpage spa'}
                pagePictureUrl={selectedPage?.pagePictureUrl}
                caption={caption}
                imageUrl={imageUrl}
                linkUrl={linkUrl}
              />
              <div className="space-y-1.5">
                <Label>Caption (duyệt trước khi đăng)</Label>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={10}
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Chọn bài để xem preview.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-lg">Thiết lập đăng</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Fanpage *</Label>
            {fbLoading ? (
              <LoadingState message="Đang tải Fanpage..." />
            ) : (
              <Select
                value={fanpageId || undefined}
                onValueChange={setFanpageId}
                disabled={!fbStatus?.connected || fbStatus.pages.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn Fanpage" />
                </SelectTrigger>
                <SelectContent>
                  {fbStatus?.pages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.pageName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label>URL ảnh</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://...jpg"
            />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Link landing</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Lên lịch lúc</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={isBusy || !selected}>
            <Save className="mr-2 h-4 w-4" />
            Lưu nháp đăng
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handlePublishNow}
            disabled={isBusy || !fbStatus?.connected || !selected}
          >
            {mutations.publishNow.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Đăng ngay
          </Button>
          <Button
            variant="secondary"
            onClick={handleSchedule}
            disabled={isBusy || !fbStatus?.connected || !selected}
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Lên lịch đăng
          </Button>
        </div>
      </div>
    </div>
  );
}
