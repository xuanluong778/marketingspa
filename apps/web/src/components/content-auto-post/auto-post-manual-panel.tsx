'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, Save, Send, X } from 'lucide-react';
import { LoadingState } from '@/components/shared/page-state';
import { FacebookFanpagePreview } from '@/components/auto-post/facebook-fanpage-preview';
import {
  AutoPostActionButton,
  AutoPostActionIcon,
} from '@/components/content-auto-post/auto-post-action-button';
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
import { useAutoPostFacebookStatus, useAutoPostMutations } from '@/hooks/use-auto-post';
import {
  buildManualOrLibraryDraftPayload,
  canAutoPostPublish,
  datetimeLocalToIso,
  isScheduleDatetimeInFuture,
  suggestScheduleDatetimeLocal,
} from '@/lib/auto-post-manual-content';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import { formatMutationError } from '@/lib/format-mutation-error';

/**
 * Tab "Đăng thủ công" — soạn nội dung trực tiếp, không cần bài thư viện.
 */
export function AutoPostManualPanel({ onScheduled }: { onScheduled?: () => void }) {
  const { data: fbStatus, isLoading: fbLoading } = useAutoPostFacebookStatus();
  const mutations = useAutoPostMutations();
  const scheduleInputRef = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState('');
  const [fanpageId, setFanpageId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => suggestScheduleDatetimeLocal(60));
  const [draftId, setDraftId] = useState<string | undefined>();
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const selectedPage = useMemo(
    () => fbStatus?.pages.find((p) => p.id === fanpageId),
    [fbStatus?.pages, fanpageId],
  );

  const isBusy =
    mutations.saveDraft.isPending || mutations.publishNow.isPending || mutations.schedule.isPending;

  const canSubmitContent = caption.trim().length > 0;
  const canPublishActions = canAutoPostPublish({
    caption,
    fanpageId,
    facebookConnected: Boolean(fbStatus?.connected),
  });

  const scheduleMin = useMemo(() => suggestScheduleDatetimeLocal(5), []);

  const focusScheduleInput = useCallback(() => {
    const el = scheduleInputRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      /* optional */
    }
  }, []);

  const buildDraftPayload = () =>
    buildManualOrLibraryDraftPayload({
      draftId,
      caption,
      fanpageId,
      imageUrl,
      linkUrl,
      tabFilter: 'ad',
    });

  const handleSaveDraft = async () => {
    if (!caption.trim()) {
      setErrorMsg('Nội dung bài đăng không được trống');
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

  const handlePublishNow = async () => {
    if (!caption.trim()) {
      setErrorMsg('Nội dung bài đăng không được trống');
      return;
    }
    if (!fanpageId) {
      setErrorMsg('Vui lòng chọn Fanpage — kết nối tại tab Kết nối kênh nếu chưa có');
      return;
    }
    if (!window.confirm('Bạn đã duyệt nội dung và muốn đăng ngay lên Fanpage?')) return;

    setErrorMsg('');
    try {
      const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
      setDraftId(saved.id);
      await mutations.publishNow.mutateAsync(saved.id);
      setMsg('Đã đăng bài thành công!');
      onScheduled?.();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleSchedule = async () => {
    if (!caption.trim()) {
      setErrorMsg('Nội dung bài đăng không được trống');
      return;
    }
    if (!fanpageId) {
      setErrorMsg('Vui lòng chọn Fanpage');
      return;
    }

    if (!scheduledAt.trim()) {
      setScheduledAt(suggestScheduleDatetimeLocal(60));
      setErrorMsg('Đã gợi ý thời gian +1 giờ ở thanh dưới. Kiểm tra rồi bấm “Lên lịch đăng” lại.');
      setTimeout(focusScheduleInput, 50);
      return;
    }

    const iso = datetimeLocalToIso(scheduledAt);
    if (!iso) {
      setErrorMsg('Thời gian lên lịch không hợp lệ. Chọn lại trên thanh dưới.');
      setTimeout(focusScheduleInput, 50);
      return;
    }
    if (!isScheduleDatetimeInFuture(scheduledAt)) {
      setScheduledAt(suggestScheduleDatetimeLocal(60));
      setErrorMsg(
        'Thời gian phải ở tương lai. Đã gợi ý +1 giờ — kiểm tra rồi bấm Lên lịch đăng lại.',
      );
      setTimeout(focusScheduleInput, 50);
      return;
    }

    if (!window.confirm(`Lên lịch đăng lúc ${new Date(iso).toLocaleString('vi-VN')}?`)) {
      return;
    }

    setErrorMsg('');
    try {
      const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
      setDraftId(saved.id);
      await mutations.schedule.mutateAsync({
        postId: saved.id,
        scheduledAt: iso,
      });
      setMsg('Đã lên lịch đăng bài! Xem tại tab Lịch đăng.');
      onScheduled?.();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
        Nhập nội dung → chọn Fanpage → chỉnh thời gian (thanh dưới) → đăng ngay hoặc lên lịch.
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
      {errorMsg && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-300/80 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          <p className="min-w-0 flex-1 leading-relaxed">{errorMsg}</p>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-red-700 hover:bg-red-100"
            onClick={() => setErrorMsg('')}
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-lg">Soạn bài</h2>
          <div className="space-y-1.5">
            <Label htmlFor="auto-post-manual-content">Nội dung *</Label>
            <Textarea
              id="auto-post-manual-content"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={12}
              placeholder="Gõ hoặc dán nội dung bài đăng (tiếng Việt, emoji, xuống dòng)..."
              autoComplete="off"
              spellCheck
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-post-manual-image">URL ảnh (tuỳ chọn)</Label>
            <Input
              id="auto-post-manual-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://...jpg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-post-manual-link">Link landing (tuỳ chọn)</Label>
            <Input
              id="auto-post-manual-link"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold text-lg">Preview Facebook</h2>
          <FacebookFanpagePreview
            pageName={selectedPage?.pageName ?? 'Fanpage spa'}
            pagePictureUrl={selectedPage?.pagePictureUrl}
            caption={caption}
            imageUrl={imageUrl}
            linkUrl={linkUrl}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-lg">Thiết lập đăng</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
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
        </div>
      </div>

      <div
        className="auto-post-action-bar fixed bottom-0 left-0 right-0 z-40 box-border h-[60px] border-t border-white/10 bg-[#0A3D31] px-3 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] md:px-6 lg:left-64"
        style={{ color: '#ffffff', height: 60, backgroundColor: '#0A3D31' }}
      >
        <div className="mx-auto flex h-full w-full max-w-full flex-nowrap items-center gap-2 overflow-x-auto">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Label
              htmlFor="auto-post-manual-schedule"
              className="whitespace-nowrap text-xs font-medium"
              style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
            >
              Lên lịch lúc *
            </Label>
            <Input
              ref={scheduleInputRef}
              id="auto-post-manual-schedule"
              type="datetime-local"
              min={scheduleMin}
              value={scheduledAt}
              onChange={(e) => {
                setScheduledAt(e.target.value);
                setErrorMsg('');
              }}
              style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', height: 36 }}
              className="h-9 w-[190px] border-white/25 bg-white/10 py-0 text-sm [&::-webkit-calendar-picker-indicator]:invert"
            />
          </div>
          <AutoPostActionButton
            tone="outline"
            onClick={handleSaveDraft}
            disabled={isBusy || !canSubmitContent}
            icon={
              <AutoPostActionIcon>
                <Save size={16} color="#FFFFFF" stroke="#FFFFFF" />
              </AutoPostActionIcon>
            }
          >
            Lưu nháp đăng
          </AutoPostActionButton>
          <AutoPostActionButton
            tone="primary"
            onClick={handlePublishNow}
            disabled={isBusy || !canPublishActions}
            icon={
              <AutoPostActionIcon>
                {mutations.publishNow.isPending ? (
                  <Loader2 size={16} color="#FFFFFF" stroke="#FFFFFF" className="animate-spin" />
                ) : (
                  <Send size={16} color="#FFFFFF" stroke="#FFFFFF" />
                )}
              </AutoPostActionIcon>
            }
          >
            Đăng ngay
          </AutoPostActionButton>
          <AutoPostActionButton
            tone="secondary"
            onClick={handleSchedule}
            disabled={isBusy || !canPublishActions}
            icon={
              <AutoPostActionIcon>
                {mutations.schedule.isPending ? (
                  <Loader2 size={16} color="#FFFFFF" stroke="#FFFFFF" className="animate-spin" />
                ) : (
                  <CalendarClock size={16} color="#FFFFFF" stroke="#FFFFFF" />
                )}
              </AutoPostActionIcon>
            }
          >
            Lên lịch đăng
          </AutoPostActionButton>
        </div>
      </div>
    </div>
  );
}
