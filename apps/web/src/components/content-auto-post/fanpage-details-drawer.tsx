'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useFanpageDetails, useSyncFanpageDetails } from '@/hooks/use-auto-post';
import { useCurrentUser } from '@/hooks/use-auth';
import { formatFanpageSyncDisplay } from '@/lib/format-fanpage-sync';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useI18n, useT } from '@/i18n/i18n-provider';
import type { AutoPostFacebookPage, FanpageDetailsResponse } from '@/types/auto-post';

function displayText(value: string | null | undefined, empty: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || empty;
}

function displayCount(
  value: number | null | undefined,
  empty: string,
  dateLocale: string,
): string {
  if (value == null || Number.isNaN(value)) return empty;
  return value.toLocaleString(dateLocale);
}

function formatPostTime(
  iso: string | null | undefined,
  empty: string,
  dateLocale: string,
): string {
  if (!iso) return empty;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return empty;
  return d.toLocaleString(dateLocale);
}

function PageAvatar({
  name,
  pictureUrl,
  size = 'md',
}: {
  name: string;
  pictureUrl: string | null | undefined;
  size?: 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'h-16 w-16' : 'h-11 w-11';
  return (
    <div className={`${dim} shrink-0 overflow-hidden rounded-full bg-[#F97316]/20`}>
      {pictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pictureUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-lg font-bold text-[#F97316]">
          {(name || '?').slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-white/90">{value}</dd>
    </div>
  );
}

function isVideoMedia(mediaType: string | null | undefined): boolean {
  return Boolean(mediaType && /video/i.test(mediaType));
}

export function FanpageDetailsDrawer({
  open,
  onOpenChange,
  page,
  autoSync = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: AutoPostFacebookPage | null;
  autoSync?: boolean;
}) {
  const t = useT();
  const { locale } = useI18n();
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const empty = t('facebookFlow.noInfo');
  const { data: user } = useCurrentUser();
  const fanpageId = open && page ? page.id : null;
  const detailsQuery = useFanpageDetails(
    fanpageId,
    Boolean(fanpageId) && !autoSync,
    user?.organizationId,
  );
  const sync = useSyncFanpageDetails();
  const lastAutoSyncKey = useRef<string | null>(null);
  const mutateSync = sync.mutate;
  const resetSync = sync.reset;

  useEffect(() => {
    if (!open) {
      lastAutoSyncKey.current = null;
      return;
    }
    if (!autoSync || !page?.id) return;
    if (lastAutoSyncKey.current === page.id) return;
    lastAutoSyncKey.current = page.id;
    resetSync();
    mutateSync(page.id);
  }, [open, autoSync, page?.id, mutateSync, resetSync]);

  const liveData: FanpageDetailsResponse | undefined = sync.data ?? detailsQuery.data;
  const isSyncing = sync.isPending;
  const isLoading = !liveData && (isSyncing || detailsQuery.isLoading);
  const syncError = sync.isError ? sync.error : null;
  const error = !liveData
    ? syncError ?? (detailsQuery.isError ? detailsQuery.error : null)
    : null;
  const lastSyncLabel = formatFanpageSyncDisplay(
    liveData?.lastSyncedAtDisplay,
    liveData?.lastSyncedAt || liveData?.refreshedAt,
  );

  const summaryName = liveData?.page.name || page?.pageName || 'Fanpage';
  const summaryPicture = liveData?.page.pictureUrl ?? page?.pagePictureUrl ?? null;
  const summaryPageId = liveData?.page.pageId || page?.pageId || '';
  const coverUrl = liveData?.page.coverUrl ?? null;
  const syncOk =
    Boolean(liveData) &&
    (liveData?.dataSource === 'live' ||
      liveData?.dataSource === 'sync' ||
      Boolean(liveData?.syncStatus && liveData?.lastSyncedAt));

  const handleRefreshFromFacebook = () => {
    if (!page?.id) return;
    sync.reset();
    sync.mutate(page.id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex !w-1/2 !max-w-none flex-col gap-0 border-l border-white/10 bg-[#0A3D30] p-0 text-white max-sm:!w-full [&>button]:text-white [&>button]:hover:text-[#F97316]"
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-white/10 px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-lg font-bold tracking-tight text-[#F97316]">
            {t('facebookFlow.detailsTitle')}
          </SheetTitle>
          <p className="mt-1 text-sm text-white/65">{t('facebookFlow.detailsSubtitle')}</p>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 overflow-hidden rounded-lg border border-white/10">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="h-36 w-full object-cover sm:h-44" />
            ) : (
              <div className="flex h-24 items-center justify-center bg-white/5 text-xs text-white/40">
                {t('facebookFlow.noCover')}
              </div>
            )}
            <div className="flex items-start gap-3 bg-[#083028] px-4 py-3">
              <PageAvatar name={summaryName} pictureUrl={summaryPicture} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">{summaryName}</h3>
                <p className="mt-0.5 break-all text-xs text-white/55">
                  {t('facebookFlow.pageId')}: {summaryPageId || empty}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('facebookFlow.connected')}
                </span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/80">
              <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
              <p className="text-sm">
                {isSyncing
                  ? t('facebookFlow.syncingFromFacebook')
                  : t('facebookFlow.loadingSynced')}
              </p>
            </div>
          ) : error ? (
            <div className="space-y-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-5">
              <p className="text-sm font-medium text-red-100">
                {t('facebookFlow.syncFailedTitle')}
              </p>
              <p className="text-sm text-red-100/90">
                {formatMutationError(error, t('facebookFlow.graphErrorKeepOld'))}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                  onClick={handleRefreshFromFacebook}
                  disabled={isSyncing}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('facebookFlow.retryFromFacebook')}
                </Button>
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/25 bg-transparent text-white hover:bg-white/10"
                  >
                    {t('facebookFlow.close')}
                  </Button>
                </SheetClose>
              </div>
            </div>
          ) : liveData ? (
            <div className="space-y-6">
              {syncError ? (
                <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {formatMutationError(syncError, t('facebookFlow.syncKeepPrevious'))}
                </div>
              ) : null}
              {syncOk && lastSyncLabel ? (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  <p className="font-medium">{t('facebookFlow.syncSuccess')}</p>
                  <p className="mt-0.5 text-xs text-emerald-100/80">
                    {t('facebookFlow.lastUpdated', { when: lastSyncLabel ?? '' })}
                  </p>
                </div>
              ) : liveData.dataSource === 'none' ? null : lastSyncLabel ? (
                <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/70">
                  {t('facebookFlow.lastUpdated', { when: lastSyncLabel })}
                </div>
              ) : null}

              {liveData.warnings?.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {liveData.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}

              <section>
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#F97316]">
                  {t('facebookFlow.pageInfo')}
                </h4>
                <dl className="space-y-3 rounded-lg border border-white/10 bg-[#083028] p-4">
                  <MetaRow label={t('facebookFlow.pageName')} value={displayText(liveData.page.name, empty)} />
                  <MetaRow label={t('facebookFlow.pageId')} value={displayText(liveData.page.pageId, empty)} />
                  <MetaRow
                    label={t('facebookFlow.username')}
                    value={displayText(liveData.page.username, empty)}
                  />
                  <MetaRow
                    label={t('facebookFlow.category')}
                    value={displayText(liveData.page.category, empty)}
                  />
                  <MetaRow
                    label={t('facebookFlow.website')}
                    value={displayText(liveData.page.website, empty)}
                  />
                  <MetaRow
                    label={t('facebookFlow.facebookLink')}
                    value={displayText(liveData.page.link, empty)}
                  />
                  <MetaRow
                    label={t('facebookFlow.phone')}
                    value={displayText(liveData.page.phone, empty)}
                  />
                  <MetaRow
                    label={t('facebookFlow.email')}
                    value={
                      liveData.page.emails?.length ? liveData.page.emails.join(', ') : empty
                    }
                  />
                  <MetaRow
                    label={t('facebookFlow.location')}
                    value={displayText(liveData.page.location, empty)}
                  />
                  <MetaRow
                    label={t('facebookFlow.followers')}
                    value={displayCount(liveData.page.followersCount, empty, dateLocale)}
                  />
                  <MetaRow
                    label={t('facebookFlow.likes')}
                    value={displayCount(liveData.page.fanCount, empty, dateLocale)}
                  />
                  <MetaRow
                    label={t('facebookFlow.about')}
                    value={displayText(liveData.page.about, empty)}
                  />
                  <MetaRow
                    label={t('facebookFlow.description')}
                    value={displayText(liveData.page.description, empty)}
                  />
                </dl>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-[#F97316]">
                    {t('facebookFlow.postsFromFacebook')}
                    {liveData.recentPosts.length > 0
                      ? ` (${Math.min(liveData.recentPosts.length, 10)})`
                      : ''}
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                    onClick={handleRefreshFromFacebook}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t('facebookFlow.refreshFromFacebook')}
                  </Button>
                </div>

                {liveData.postsError ? (
                  <div className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    {t('facebookFlow.postsFetchError', { error: liveData.postsError })}
                  </div>
                ) : null}

                {liveData.recentPosts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-[#083028]/60 px-4 py-10 text-center text-sm text-white/65">
                    {liveData.postsError
                      ? t('facebookFlow.postsHiddenOnError')
                      : t('facebookFlow.noPublishedPosts')}
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {liveData.recentPosts.slice(0, 10).map((post) => (
                      <li
                        key={post.id}
                        className="overflow-hidden rounded-lg border border-white/10 bg-[#083028]"
                      >
                        {post.thumbnailUrl ? (
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={post.thumbnailUrl}
                              alt=""
                              className="h-40 w-full object-cover"
                            />
                            {isVideoMedia(post.mediaType) ? (
                              <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
                                Video
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-white/5 text-xs text-white/40">
                            {isVideoMedia(post.mediaType)
                              ? t('facebookFlow.videoNoThumb')
                              : t('facebookFlow.noImage')}
                          </div>
                        )}
                        <div className="space-y-2 p-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                            {displayText(post.message, empty)}
                          </p>
                          <p className="text-xs text-white/50">
                            {t('facebookFlow.postedAt', {
                              when: formatPostTime(post.createdTime, empty, dateLocale),
                            })}
                          </p>
                          <p className="break-all text-xs text-white/50">
                            {t('facebookFlow.facebookPostId', { id: post.id })}
                          </p>
                          {post.permalinkUrl ? (
                            <a
                              href={post.permalinkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F97316] hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {t('facebookFlow.openOnFacebook')}
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {liveData.graphEndpoints ? (
                <section className="rounded-lg border border-white/10 bg-[#083028] p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                    {t('facebookFlow.graphCalled')}
                  </h4>
                  <p className="break-all text-[11px] leading-relaxed text-white/60">
                    {t('facebookFlow.graphPage', { endpoint: liveData.graphEndpoints.page })}
                  </p>
                  <p className="mt-1 break-all text-[11px] leading-relaxed text-white/60">
                    {t('facebookFlow.graphPosts', { endpoint: liveData.graphEndpoints.posts })}
                  </p>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/65">
              {t('facebookFlow.noDetailsYet')}
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-white/10 px-5 py-3">
          <Button
            type="button"
            className="w-full bg-[#F97316] text-white hover:bg-[#ea6a0c]"
            onClick={handleRefreshFromFacebook}
            disabled={!page?.id || isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('facebookFlow.syncPageInfo')}
          </Button>
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/25 bg-transparent text-white hover:bg-white/10"
            >
              {t('facebookFlow.close')}
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
