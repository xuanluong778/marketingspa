'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Eye,
  Facebook,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { FanpageDetailsDrawer } from '@/components/content-auto-post/fanpage-details-drawer';
import {
  useAutoPostFacebookStatus,
  useAutoPostMutations,
  useAutoPostOauthPages,
  useAutoPostStatus,
  useSyncFanpageDetails,
} from '@/hooks/use-auto-post';
import { formatFanpageSyncDisplay } from '@/lib/format-fanpage-sync';
import { formatMutationError } from '@/lib/format-mutation-error';
import { humanizeFacebookChannelError, humanizeOAuthPagesStatus } from '@/lib/humanize-facebook-channel-error';
import { redactClientSecrets } from '@/lib/redact-client-secrets';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import { useT } from '@/i18n/i18n-provider';
import type { TranslateParams } from '@/i18n/types';
import type { AutoPostFacebookPage } from '@/types/auto-post';

function PageAvatar({ page }: { page: Pick<AutoPostFacebookPage, 'pageName' | 'pagePictureUrl'> }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#F97316]/20">
      {page.pagePictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={page.pagePictureUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-bold text-[#F97316]">
          {(page.pageName || '?').slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function permissionLabel(
  page: AutoPostFacebookPage,
  t: (key: string, params?: TranslateParams) => string,
): { text: string; ok: boolean } {
  if (page.canManagePosts === false) {
    return { text: t('facebookFlow.permMissingPost'), ok: false };
  }
  if (page.canManagePosts === true) {
    return { text: t('facebookFlow.permOk'), ok: true };
  }
  if (page.tasks?.length) {
    return { text: page.tasks.slice(0, 3).join(', '), ok: true };
  }
  return { text: t('facebookFlow.permFromFacebook'), ok: true };
}

export function AutoPostChannelsPanel() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: status, isLoading: isStatusLoading } = useAutoPostStatus();
  const { data: fbStatus, isLoading, refetch: refetchFbStatus } = useAutoPostFacebookStatus();
  const mutations = useAutoPostMutations();

  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [detailsPage, setDetailsPage] = useState<AutoPostFacebookPage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsAutoSync, setDetailsAutoSync] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const syncFanpage = useSyncFanpageDetails();

  const facebookParam = searchParams.get('facebook');

  // Sau callback OAuth → mở chế độ chọn Page; cũng mở khi còn pending (user refresh giữa chừng)
  useEffect(() => {
    if (facebookParam === 'oauth_connected' || facebookParam === 'connected') {
      if (searchParams.get('mode') === 'env') {
        setMsg(t('facebookFlow.connectedEnv'));
      } else if (facebookParam === 'oauth_connected') {
        setSelectionMode(true);
        setMsg(t('facebookFlow.oauthSuccessPick'));
      } else {
        setMsg(t('facebookFlow.connectedSuccess'));
      }
    }
    if (facebookParam === 'error') {
      const raw = searchParams.get('message');
      setErrorMsg(
        raw
          ? humanizeOAuthPagesStatus(undefined, t, redactClientSecrets(raw))
          : t('facebookFlow.connectFailed'),
      );
      setSelectionMode(false);
      // Drop sensitive query params from the address bar immediately.
      router.replace(buildContentAutoPostHref('channels'));
    }
  }, [facebookParam, searchParams, router, t]);

  const oauthPagesQuery = useAutoPostOauthPages(selectionMode);
  const oauthPages = oauthPagesQuery.data;

  // Nếu có pending OAuth (status OK/NO_PAGES/MISSING…) sau refresh — vẫn hiện picker
  useEffect(() => {
    if (!selectionMode) return;
    if (!oauthPages) return;
    if (oauthPages.status === 'NO_PENDING_OAUTH' && facebookParam !== 'oauth_connected') {
      setSelectionMode(false);
    }
  }, [selectionMode, oauthPages, facebookParam]);

  const clearOauthQuery = useCallback(() => {
    if (!facebookParam) return;
    router.replace(buildContentAutoPostHref('channels'));
  }, [facebookParam, router]);

  const canConnect = Boolean(
    status?.facebookConnectAvailable ?? status?.metaConfigured ?? status?.metaPageEnvConfigured,
  );

  const handleConnectFacebook = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      await mutations.connectFacebook.mutateAsync();
    } catch (error) {
      setErrorMsg(formatMutationError(error, t('facebookFlow.connectFailed')));
    }
  }, [mutations.connectFacebook, t]);

  const handleReconnect = useCallback(async () => {
    setSelectionMode(false);
    setSelectedPageIds(new Set());
    setMsg('');
    setErrorMsg('');
    clearOauthQuery();
    await handleConnectFacebook();
  }, [clearOauthQuery, handleConnectFacebook]);

  const handleRefreshPages = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      await mutations.refreshPages.mutateAsync();
      setMsg(t('facebookFlow.refreshedPages'));
    } catch (error) {
      setErrorMsg(formatMutationError(error, t('facebookFlow.refreshFailed')));
    }
  }, [mutations.refreshPages, t]);

  const handleDisconnectAll = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      await mutations.disconnectFacebook.mutateAsync();
      setMsg(t('facebookFlow.disconnectedAll'));
      setSelectionMode(false);
      setSelectedPageIds(new Set());
    } catch (error) {
      setErrorMsg(formatMutationError(error, t('facebookFlow.disconnectFailed')));
    }
  }, [mutations.disconnectFacebook, t]);

  const handleDisconnectPage = useCallback(
    async (fanpageRowId: string) => {
      setMsg('');
      setErrorMsg('');
      setDisconnectingId(fanpageRowId);
      try {
        await mutations.disconnectPage.mutateAsync(fanpageRowId);
        setMsg(t('facebookFlow.disconnectedPage'));
        await refetchFbStatus();
      } catch (error) {
        setErrorMsg(formatMutationError(error, t('facebookFlow.disconnectPageFailed')));
      } finally {
        setDisconnectingId(null);
      }
    },
    [mutations.disconnectPage, refetchFbStatus, t],
  );

  const togglePage = useCallback((pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  const handleSelectPages = useCallback(async () => {
    const pageIds = [...selectedPageIds];
    if (pageIds.length === 0) {
      setErrorMsg(t('facebookFlow.selectAtLeastOne'));
      return;
    }
    setMsg('');
    setErrorMsg('');
    try {
      const result = await mutations.selectOauthPages.mutateAsync(pageIds);
      const okCount = result.connectedPages?.length ?? pageIds.length;
      const failCount = result.failedPages?.length ?? 0;
      if (failCount > 0) {
        const reasons = result.failedPages
          .map((f) => `${f.pageId}: ${f.reason}`)
          .slice(0, 3)
          .join('; ');
        setErrorMsg(
          result.warning
            ? humanizeOAuthPagesStatus(undefined, t, result.warning)
            : t('facebookFlow.savedSomeFailed', {
                ok: okCount,
                fail: failCount,
                reasons,
              }),
        );
      } else {
        setMsg(t('facebookFlow.connectedCount', { count: okCount }));
      }
      setSelectionMode(false);
      setSelectedPageIds(new Set());
      clearOauthQuery();
      await refetchFbStatus();
    } catch (error) {
      setErrorMsg(formatMutationError(error, t('facebookFlow.saveSelectedFailed')));
    }
  }, [
    selectedPageIds,
    mutations.selectOauthPages,
    clearOauthQuery,
    refetchFbStatus,
    t,
  ]);

  const selectablePages = useMemo(() => oauthPages?.pages ?? [], [oauthPages?.pages]);

  // Prefill: bỏ chọn sẵn các page đã connected khi vào selection
  useEffect(() => {
    if (!selectionMode || !oauthPages || oauthPages.status !== 'OK') return;
    if (selectedPageIds.size > 0) return;
    // Không auto-check — user phải chủ động chọn
  }, [selectionMode, oauthPages, selectedPageIds.size]);

  if (isLoading || isStatusLoading) {
    return <LoadingState message={t('facebookFlow.loadingChannels')} />;
  }

  const showPicker =
    selectionMode &&
    oauthPages &&
    (oauthPages.status === 'OK' ||
      oauthPages.status === 'NO_PAGES' ||
      oauthPages.status === 'MISSING_PERMISSION' ||
      oauthPages.status === 'TOKEN_EXPIRED' ||
      oauthPages.status === 'META_API_ERROR' ||
      oauthPages.status === 'NO_PENDING_OAUTH');

  const connecting = mutations.connectFacebook.isPending;
  const selecting = mutations.selectOauthPages.isPending;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="rounded-xl border border-white/10 bg-[#0A3D30] p-5 shadow-lg sm:p-7">
        <h2 className="text-xl font-bold tracking-tight text-[#F97316] sm:text-2xl">
          {t('facebookFlow.connectTitle')}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
          {t('facebookFlow.connectDescription')}
        </p>

        {status && status.facebookConnectAvailable === false && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t('facebookFlow.oauthNotReady')}
          </div>
        )}

        {status?.metaPageEnvConfigured && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {t('facebookFlow.envTokenReady')}
          </div>
        )}

        {msg && (
          <div className="mt-4 whitespace-pre-line rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
            {msg}
          </div>
        )}
        {errorMsg && (
          <div className="mt-4">
            <ErrorState message={errorMsg} onRetry={() => setErrorMsg('')} />
          </div>
        )}
        {fbStatus?.lastError && !errorMsg && (
          <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {t('facebookFlow.lastError', {
              error: humanizeFacebookChannelError(fbStatus.lastError, t),
            })}
          </div>
        )}

        {/* Primary actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          {!selectionMode && (
            <Button
              type="button"
              onClick={handleConnectFacebook}
              disabled={connecting || (!canConnect && !fbStatus?.connected)}
              className="bg-[#F97316] px-5 text-base font-semibold text-white hover:bg-[#ea6a0c] disabled:opacity-60"
            >
              {connecting ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Facebook className="mr-2 h-5 w-5" />
              )}
              {fbStatus?.connected || fbStatus?.needsReconnect
                ? t('facebookFlow.reconnectFacebook')
                : t('facebookFlow.connectFacebook')}
            </Button>
          )}

          {fbStatus?.connected && !selectionMode && (
            <>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10"
                onClick={handleRefreshPages}
                disabled={mutations.refreshPages.isPending}
              >
                {mutations.refreshPages.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {t('facebookFlow.refreshPages')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10"
                onClick={() => {
                  setSelectionMode(true);
                  setSelectedPageIds(new Set());
                  setMsg(t('facebookFlow.pickMorePages'));
                }}
              >
                {t('facebookFlow.addMorePages')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDisconnectAll}
                disabled={mutations.disconnectFacebook.isPending}
              >
                {mutations.disconnectFacebook.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                {t('facebookFlow.disconnectAll')}
              </Button>
            </>
          )}
        </div>

        {/* OAuth page picker */}
        {selectionMode && (
          <div className="mt-6 space-y-4 rounded-lg border border-white/10 bg-[#083028] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                {t('facebookFlow.selectPagesTitle')}
                {oauthPages?.facebookUserName
                  ? ` — ${oauthPages.facebookUserName}`
                  : ''}
              </h3>
              <Button
                type="button"
                variant="ghost"
                className="h-8 text-white/70 hover:text-white"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedPageIds(new Set());
                  clearOauthQuery();
                }}
              >
                {t('facebookFlow.close')}
              </Button>
            </div>

            {oauthPagesQuery.isLoading || oauthPagesQuery.isFetching ? (
              <LoadingState
                message={t('facebookFlow.loadingPages')}
                className="py-8 text-white [&_svg]:text-white"
              />
            ) : oauthPagesQuery.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-red-200">
                  {formatMutationError(oauthPagesQuery.error, t('facebookFlow.loadPagesFailed'))}
                </p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  {t('facebookFlow.reconnect')}
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'MISSING_PERMISSION' ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-100">{t('facebookFlow.missingPermission')}</p>
                {oauthPages.missingScopes?.length > 0 && (
                  <p className="text-xs text-white/60">
                    {t('facebookFlow.permMissingPrefix')}: {oauthPages.missingScopes.join(', ')}
                  </p>
                )}
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  {t('facebookFlow.reconnect')}
                </Button>
              </div>
            ) : showPicker &&
              (oauthPages?.status === 'TOKEN_EXPIRED' ||
                oauthPages?.status === 'NO_PENDING_OAUTH') ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-100">{t('facebookFlow.oauthExpired')}</p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  {t('facebookFlow.reconnect')}
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'NO_PAGES' ? (
              <div className="space-y-3">
                <p className="text-sm text-white/75">{t('facebookFlow.noManagedPages')}</p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  {t('facebookFlow.reconnect')}
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'META_API_ERROR' ? (
              <div className="space-y-3">
                <p className="text-sm text-red-200">{t('facebookFlow.metaApiError')}</p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  {t('facebookFlow.reconnect')}
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'OK' ? (
              <>
                {selectablePages.length === 0 ? (
                  <p className="text-sm text-white/70">{t('facebookFlow.noPagesToShow')}</p>
                ) : (
                  <ul className="space-y-2">
                    {selectablePages.map((page) => {
                      const checked = selectedPageIds.has(page.pageId);
                      const perm = permissionLabel(page, t);
                      return (
                        <li key={page.pageId}>
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${
                              checked
                                ? 'border-[#F97316]/60 bg-[#0A3D30]'
                                : 'border-white/10 bg-[#0A3D30]/60 hover:border-white/25'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-3 h-4 w-4 shrink-0 accent-[#F97316]"
                              checked={checked}
                              onChange={() => togglePage(page.pageId)}
                            />
                            <PageAvatar page={page} />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-white">{page.pageName}</p>
                              <p className="mt-0.5 break-all text-xs text-white/55">
                                {t('facebookFlow.pageId')}: {page.pageId}
                              </p>
                              <p
                                className={`mt-1 text-xs ${
                                  perm.ok ? 'text-emerald-300' : 'text-amber-300'
                                }`}
                              >
                                {t('facebookFlow.permission')}: {perm.text}
                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={handleSelectPages}
                    disabled={selecting || selectedPageIds.size === 0}
                    className="bg-[#F97316] font-semibold text-white hover:bg-[#ea6a0c] disabled:opacity-60"
                  >
                    {selecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {t('facebookFlow.connectSelected')}
                    {selectedPageIds.size > 0 ? ` (${selectedPageIds.size})` : ''}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/25 bg-transparent text-white hover:bg-white/10"
                    onClick={handleReconnect}
                    disabled={connecting}
                  >
                    <Facebook className="mr-2 h-4 w-4" />
                    {t('facebookFlow.reconnect')}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Connected pages (persisted) */}
        {fbStatus?.connected && (
          <div className="mt-6 rounded-lg border border-white/10 bg-[#083028] p-4 space-y-3">
            <p className="text-sm font-medium text-white">
              {fbStatus.connectionMode === 'env'
                ? t('facebookFlow.envFanpageLabel')
                : t('facebookFlow.accountLabel')}
              : {fbStatus.facebookUserName ?? 'Facebook'}
            </p>
            <p className="text-sm font-medium text-white">
              {t('facebookFlow.connectedPages', { count: fbStatus.pages.length })}
            </p>
            {fbStatus.pages.length === 0 ? (
              <p className="text-sm text-white/65">{t('facebookFlow.noPagesSelected')}</p>
            ) : (
              <ul className="space-y-2">
                {fbStatus.pages.map((p) => {
                  const lastSynced = formatFanpageSyncDisplay(
                    p.lastSyncedAtDisplay,
                    p.lastSyncedAt,
                  );
                  const lastPost = formatFanpageSyncDisplay(
                    p.lastPostCreatedAtDisplay,
                    p.lastPostCreatedAt,
                  );
                  return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-white/10 bg-[#0A3D30] px-3 py-2.5 text-sm text-white"
                  >
                    <PageAvatar page={p} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.pageName}</p>
                      <p className="break-all text-xs text-white/55">
                        {t('facebookFlow.pageId')}: {p.pageId}
                      </p>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('facebookFlow.connected')}
                      </span>
                      {lastSynced ? (
                        <p className="mt-1.5 text-xs text-white/70">
                          {t('facebookFlow.lastUpdated', { when: lastSynced })}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-white/45">
                          {t('facebookFlow.neverSynced')}
                        </p>
                      )}
                      {lastPost ? (
                        <p className="text-xs text-white/70">
                          {t('facebookFlow.latestPost', { when: lastPost })}
                        </p>
                      ) : null}
                      {p.lastSyncError ? (
                        <p className="mt-1 text-xs text-red-300">
                          {t('facebookFlow.syncError', {
                            error: humanizeFacebookChannelError(p.lastSyncError, t),
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-white/25 bg-transparent text-white hover:bg-white/10"
                        onClick={() => {
                          setDetailsPage(p);
                          setDetailsAutoSync(false);
                          setDetailsOpen(true);
                        }}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t('facebookFlow.viewDetails')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                        disabled={syncingId === p.id}
                        onClick={async () => {
                          setSyncingId(p.id);
                          setErrorMsg('');
                          try {
                            const synced = await syncFanpage.mutateAsync(p.id);
                            const when = formatFanpageSyncDisplay(
                              synced.lastSyncedAtDisplay,
                              synced.lastSyncedAt,
                            );
                            setMsg(
                              when
                                ? t('facebookFlow.syncSuccessWithTime', { when })
                                : t('facebookFlow.syncSuccess'),
                            );
                            await refetchFbStatus();
                          } catch (err) {
                            setErrorMsg(
                              formatMutationError(err, t('facebookFlow.syncKeepOld')),
                            );
                          } finally {
                            setSyncingId(null);
                          }
                        }}
                      >
                        {syncingId === p.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        )}
                        {t('facebookFlow.syncPageInfo')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={disconnectingId === p.id}
                        onClick={() => handleDisconnectPage(p.id)}
                      >
                        {disconnectingId === p.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unplug className="mr-1 h-3.5 w-3.5" />
                        )}
                        {t('facebookFlow.disconnect')}
                      </Button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <FanpageDetailsDrawer
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setDetailsPage(null);
            setDetailsAutoSync(false);
          }
        }}
        page={detailsPage}
        autoSync={detailsAutoSync}
      />

      <div className="rounded-xl border border-white/10 bg-[#0A3D30]/80 p-5 sm:p-6">
        <div className="mb-2 flex items-center gap-2 text-[#F97316]">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {t('facebookFlow.scopeShowListTitle')}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-white/85 sm:text-[15px]">
          {t('facebookFlow.scopeShowListBody')}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0A3D30]/80 p-5 sm:p-6">
        <div className="mb-2 flex items-center gap-2 text-[#F97316]">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {t('facebookFlow.scopeReadTitle')}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-white/85 sm:text-[15px]">
          {t('facebookFlow.scopeReadBody')}
        </p>
      </div>
    </div>
  );
}
