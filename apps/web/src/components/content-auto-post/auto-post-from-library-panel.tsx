'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Loader2, Save, Send, X } from 'lucide-react';
import { LoadingState } from '@/components/shared/page-state';
import { FacebookFanpagePreview } from '@/components/auto-post/facebook-fanpage-preview';
import { AiMarketingPostPicker } from '@/components/auto-post/ai-marketing-post-picker';
import {
  AutoPostActionButton,
  AutoPostActionIcon,
} from '@/components/content-auto-post/auto-post-action-button';
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
import { useAutoPostFacebookStatus, useAutoPostMutations } from '@/hooks/use-auto-post';
import { loadContentHistory } from '@/lib/content-marketing-form';
import {
  clearPendingAutoPost,
  AI_MARKETING_TAB_FILTER_OPTIONS,
  mapAiTabToAutoPostType,
  resolveAutoPostFromAi,
  type AiMarketingPostPayload,
} from '@/lib/auto-post-ai-marketing-bridge';
import {
  datetimeLocalToIso,
  isScheduleDatetimeInFuture,
  suggestScheduleDatetimeLocal,
} from '@/lib/auto-post-manual-content';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import type { ContentStudioTab } from '@/types/content-marketing';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useI18n, useT } from '@/i18n/i18n-provider';

/**
 * Tab "Đăng từ thư viện" — flow:
 * Chọn bài Thư viện → sửa caption → chọn Fanpage → Đăng ngay / Lên lịch.
 */
export function AutoPostFromLibraryPanel({
  libraryRefreshKey = 0,
  onScheduled,
}: {
  libraryRefreshKey?: number;
  onScheduled?: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const searchParams = useSearchParams();
  const { data: user } = useCurrentUser();
  const { data: fbStatus, isLoading: fbLoading } = useAutoPostFacebookStatus();
  const mutations = useAutoPostMutations();
  const scheduleInputRef = useRef<HTMLInputElement>(null);

  const [aiPosts, setAiPosts] = useState(() => loadContentHistory(user?.id));
  const [tabFilter, setTabFilter] = useState<ContentStudioTab>('ad');
  const [selected, setSelected] = useState<AiMarketingPostPayload | null>(null);
  const [caption, setCaption] = useState('');
  const [fanpageId, setFanpageId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => suggestScheduleDatetimeLocal(60));
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
      ? t('facebookFlow.emptyAdLibrary')
      : tabFilter === 'personal'
        ? t('facebookFlow.emptyBrandLibrary')
        : t('facebookFlow.emptyAdvancedLibrary');

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
    mutations.saveDraft.isPending || mutations.publishNow.isPending || mutations.schedule.isPending;

  const scheduleMin = useMemo(() => suggestScheduleDatetimeLocal(5), []);

  const focusScheduleInput = useCallback(() => {
    const el = scheduleInputRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      /* showPicker optional */
    }
  }, []);

  const buildDraftPayload = () => {
    if (!selected) throw new Error(t('facebookFlow.noPostSelected'));
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

  /** Luôn lưu lại draft với fanpage/caption mới nhất trước publish/schedule. */
  const ensureDraft = async (): Promise<string> => {
    const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
    setDraftId(saved.id);
    return saved.id;
  };

  const handleSaveDraft = async () => {
    if (!selected || !caption.trim()) {
      setErrorMsg(t('facebookFlow.pickPostAndCaption'));
      return;
    }
    setErrorMsg('');
    try {
      const saved = await mutations.saveDraft.mutateAsync(buildDraftPayload());
      setDraftId(saved.id);
      setMsg(t('facebookFlow.draftSaved'));
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handlePublishNow = async () => {
    if (!selected) {
      setErrorMsg(t('facebookFlow.pickLibraryPost'));
      return;
    }
    if (!fanpageId) {
      setErrorMsg(t('facebookFlow.pickFanpageOrConnect'));
      return;
    }
    if (!caption.trim()) {
      setErrorMsg(t('facebookFlow.emptyCaption'));
      return;
    }
    if (!window.confirm(t('facebookFlow.confirmPublish'))) return;

    setErrorMsg('');
    try {
      const postId = await ensureDraft();
      await mutations.publishNow.mutateAsync(postId);
      setMsg(t('facebookFlow.publishedOk'));
      onScheduled?.();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  const handleSchedule = async () => {
    if (!selected) {
      setErrorMsg(t('facebookFlow.pickLibraryPost'));
      return;
    }
    if (!fanpageId) {
      setErrorMsg(t('facebookFlow.pickFanpage'));
      return;
    }
    if (!caption.trim()) {
      setErrorMsg(t('facebookFlow.emptyCaption'));
      return;
    }

    if (!scheduledAt.trim()) {
      setScheduledAt(suggestScheduleDatetimeLocal(60));
      setErrorMsg(t('facebookFlow.suggestedPlusOneHour'));
      setTimeout(focusScheduleInput, 50);
      return;
    }

    const iso = datetimeLocalToIso(scheduledAt);
    if (!iso) {
      setErrorMsg(t('facebookFlow.invalidSchedule'));
      setTimeout(focusScheduleInput, 50);
      return;
    }
    if (!isScheduleDatetimeInFuture(scheduledAt)) {
      setScheduledAt(suggestScheduleDatetimeLocal(60));
      setErrorMsg(t('facebookFlow.mustBeFuture'));
      setTimeout(focusScheduleInput, 50);
      return;
    }

    if (
      !window.confirm(
        t('facebookFlow.confirmScheduleAt', {
          when: new Date(iso).toLocaleString(dateLocale),
        }),
      )
    ) {
      return;
    }

    setErrorMsg('');
    try {
      const postId = await ensureDraft();
      await mutations.schedule.mutateAsync({
        postId,
        scheduledAt: iso,
      });
      setMsg(t('facebookFlow.scheduledOk'));
      onScheduled?.();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      setErrorMsg(formatMutationError(e));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
        {t('facebookFlow.libraryHint')}
      </div>

      {!fbStatus?.connected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('facebookFlow.notConnectedFacebook')}{' '}
          <Link href={buildContentAutoPostHref('channels')} className="font-medium underline">
            {t('facebookFlow.tabs.channels')}
          </Link>{' '}
          {t('facebookFlow.connectBeforePost')}
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
            aria-label={t('facebookFlow.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-lg">
                {t('facebookFlow.pickLibraryHeading')}
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
                        {t(`facebookFlow.tabFilter.${o.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="sm" onClick={refreshAiPosts}>
                {t('common.refresh')}
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
          <h2 className="font-semibold text-lg">{t('facebookFlow.previewFacebook')}</h2>
          {selected ? (
            <>
              <div className="rounded-lg bg-slate-50 border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t('facebookFlow.source')}</span>
                <span className="font-medium">{selected.sourceLabel}</span>
                <span className="text-muted-foreground"> · </span>
                <span className="font-medium">{selected.title}</span>
              </div>
              <FacebookFanpagePreview
                pageName={selectedPage?.pageName ?? t('facebookFlow.defaultPageName')}
                pagePictureUrl={selectedPage?.pagePictureUrl}
                caption={caption}
                imageUrl={imageUrl}
                linkUrl={linkUrl}
              />
              <div className="space-y-1.5">
                <Label htmlFor="auto-post-library-caption">{t('facebookFlow.captionReview')}</Label>
                <Textarea
                  id="auto-post-library-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={10}
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t('facebookFlow.pickToPreview')}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-lg">{t('facebookFlow.publishSettings')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('facebookFlow.fanpageRequired')}</Label>
            {fbLoading ? (
              <LoadingState message={t('facebookFlow.loadingFanpages')} />
            ) : (
              <Select
                value={fanpageId || undefined}
                onValueChange={setFanpageId}
                disabled={!fbStatus?.connected || fbStatus.pages.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('facebookFlow.selectFanpage')} />
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
          <div className="space-y-1.5">
            <Label>{t('facebookFlow.imageUrl')}</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://...jpg"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('facebookFlow.landingLink')}</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      {/* Fixed action bar — height 60px */}
      <div
        className="auto-post-action-bar fixed bottom-0 left-0 right-0 z-40 box-border h-[60px] border-t border-white/10 bg-[#0A3D31] px-3 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] md:px-6 lg:left-64"
        style={{ color: '#ffffff', height: 60, backgroundColor: '#0A3D31' }}
      >
        <div className="mx-auto flex h-full w-full max-w-full flex-nowrap items-center gap-2 overflow-x-auto">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Label
              htmlFor="auto-post-library-schedule"
              className="whitespace-nowrap text-xs font-medium"
              style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
            >
              {t('facebookFlow.scheduleAt')}
            </Label>
            <Input
              ref={scheduleInputRef}
              id="auto-post-library-schedule"
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
            disabled={isBusy || !selected}
            icon={
              <AutoPostActionIcon>
                <Save size={16} color="#FFFFFF" stroke="#FFFFFF" absoluteStrokeWidth strokeWidth={2} />
              </AutoPostActionIcon>
            }
          >
            {t('facebookFlow.saveDraft')}
          </AutoPostActionButton>
          <AutoPostActionButton
            tone="primary"
            onClick={handlePublishNow}
            disabled={isBusy || !fbStatus?.connected || !selected}
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
            {t('facebookFlow.publishNow')}
          </AutoPostActionButton>
          <AutoPostActionButton
            tone="secondary"
            onClick={handleSchedule}
            disabled={isBusy || !fbStatus?.connected || !selected}
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
            {t('facebookFlow.schedulePost')}
          </AutoPostActionButton>
        </div>
      </div>
    </div>
  );
}
