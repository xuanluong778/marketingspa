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
import {
  AutoPostScheduleDatetimeInput,
  type AutoPostScheduleDatetimeInputHandle,
} from '@/components/content-auto-post/auto-post-schedule-datetime-input';
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
import { contentAutoPostHref } from '@/lib/facebook-review-copy';
import { formatFacebookMutationError } from '@/lib/format-facebook-mutation-error';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useFacebookCopy } from '@/lib/use-facebook-copy';
import {
  AutoPostPublishResultBanner,
  AutoPostSelectedPageChip,
} from '@/components/content-auto-post/auto-post-publish-result';
import { useAutoPostSuccessToast } from '@/components/content-auto-post/auto-post-success-toast';
import { useAutoPostPublishConfirm } from '@/components/content-auto-post/auto-post-publish-confirm-dialog';
import { normalizePublishResponse } from '@/lib/resolve-facebook-post-url';
import type { AutoPostItem } from '@/types/auto-post';

/** Manual post tab — compose content directly without a library item. */
export function AutoPostManualPanel({ onScheduled }: { onScheduled?: () => void }) {
  const { locale, autoPost: fb } = useFacebookCopy();
  const { data: fbStatus, isLoading: fbLoading } = useAutoPostFacebookStatus();
  const mutations = useAutoPostMutations();
  const scheduleInputRef = useRef<AutoPostScheduleDatetimeInputHandle>(null);

  const [caption, setCaption] = useState('');
  const [fanpageId, setFanpageId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => suggestScheduleDatetimeLocal(60));
  const [draftId, setDraftId] = useState<string | undefined>();
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [publishResult, setPublishResult] = useState<AutoPostItem | null>(null);
  const { show: showPublishToast, Toast: PublishToast } = useAutoPostSuccessToast('publish');
  const { confirmPublish, PublishConfirmDialog } = useAutoPostPublishConfirm();

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
    scheduleInputRef.current?.focusAndOpenPicker();
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
      setErrorMsg(fb.captionRequired);
      return;
    }
    setErrorMsg('');
    try {
      const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
      setDraftId(saved.id);
      setMsg(fb.draftSaved);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handlePublishNow = async () => {
    if (!caption.trim()) {
      setErrorMsg(fb.captionRequired);
      return;
    }
    if (!fanpageId) {
      setErrorMsg(fb.selectPageRequired);
      return;
    }
    if (!(await confirmPublish())) return;

    setErrorMsg('');
    setPublishResult(null);
    try {
      const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
      setDraftId(saved.id);
      const raw = await mutations.publishNow.mutateAsync(saved.id);
      const item = normalizePublishResponse(raw);
      if (item?.facebookPostId) {
        setPublishResult(item);
        showPublishToast(fb.publishSuccessToast);
      } else {
        setMsg(fb.publishSuccess);
        setTimeout(() => setMsg(''), 3000);
      }
      onScheduled?.();
    } catch (e) {
      setErrorMsg(formatFacebookMutationError(e, locale, fb.checkFailed));
    }
  };

  const handleSchedule = async () => {
    if (!caption.trim()) {
      setErrorMsg(fb.captionRequired);
      return;
    }
    if (!fanpageId) {
      setErrorMsg(fb.selectPageRequired);
      return;
    }

    if (!scheduledAt.trim()) {
      setScheduledAt(suggestScheduleDatetimeLocal(60));
      setErrorMsg(fb.scheduleSuggestHint);
      setTimeout(focusScheduleInput, 50);
      return;
    }

    const iso = datetimeLocalToIso(scheduledAt);
    if (!iso) {
      setErrorMsg(fb.scheduleInvalid);
      setTimeout(focusScheduleInput, 50);
      return;
    }
    if (!isScheduleDatetimeInFuture(scheduledAt)) {
      setScheduledAt(suggestScheduleDatetimeLocal(60));
      setErrorMsg(fb.scheduleFutureRequired);
      setTimeout(focusScheduleInput, 50);
      return;
    }

    const whenLabel = new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
    if (!window.confirm(fb.scheduleConfirm(whenLabel))) {
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
      setMsg(fb.scheduleSuccess);
      onScheduled?.();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {PublishToast}
      {PublishConfirmDialog}
      <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
        {fb.manualWorkflowHint}
      </div>

      {!fbStatus?.connected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {fb.notConnectedBanner}{' '}
          <Link href={contentAutoPostHref('channels', locale)} className="font-medium underline">
            {fb.connectChannels}
          </Link>{' '}
          {fb.connectBeforePublish}
        </div>
      )}

      {publishResult ? (
        <AutoPostPublishResultBanner
          item={publishResult}
          locale={locale}
          copy={fb}
          onDismiss={() => setPublishResult(null)}
        />
      ) : null}

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
            aria-label={fb.closeAria}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-lg">{fb.composeTitle}</h2>
          <div className="space-y-1.5">
            <Label htmlFor="auto-post-manual-content">{fb.contentLabel}</Label>
            <Textarea
              id="auto-post-manual-content"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={12}
              placeholder={fb.contentPlaceholder}
              autoComplete="off"
              spellCheck
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-post-manual-image">{fb.imageUrlLabel}</Label>
            <Input
              id="auto-post-manual-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://...jpg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-post-manual-link">{fb.linkLandingLabel}</Label>
            <Input
              id="auto-post-manual-link"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold text-lg">{fb.previewFacebook}</h2>
          <FacebookFanpagePreview
            pageName={selectedPage?.pageName ?? fb.previewPageFallback}
            pagePictureUrl={selectedPage?.pagePictureUrl}
            caption={caption}
            imageUrl={imageUrl}
            linkUrl={linkUrl}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-lg">{fb.publishSetupTitle}</h2>
        {selectedPage ? (
          <AutoPostSelectedPageChip
            pageName={selectedPage.pageName}
            pagePictureUrl={selectedPage.pagePictureUrl}
            label={fb.publishingToPage}
          />
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{fb.pageLabel}</Label>
            {fbLoading ? (
              <LoadingState message={fb.loadingPages} />
            ) : (
              <Select
                value={fanpageId || undefined}
                onValueChange={setFanpageId}
                disabled={!fbStatus?.connected || fbStatus.pages.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={fb.selectPagePlaceholder} />
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
              {fb.scheduleAtLabel} *
            </Label>
            <AutoPostScheduleDatetimeInput
              ref={scheduleInputRef}
              id="auto-post-manual-schedule"
              min={scheduleMin}
              value={scheduledAt}
              onChange={(value) => {
                setScheduledAt(value);
                setErrorMsg('');
              }}
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
            {fb.saveDraft}
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
            {fb.publishNow}
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
            {fb.schedulePost}
          </AutoPostActionButton>
        </div>
      </div>
    </div>
  );
}
