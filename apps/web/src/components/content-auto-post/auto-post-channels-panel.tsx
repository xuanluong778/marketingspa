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
} from '@/hooks/use-auto-post';
import { formatMutationError } from '@/lib/format-mutation-error';
import { redactClientSecrets } from '@/lib/redact-client-secrets';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
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

function permissionLabel(page: AutoPostFacebookPage): { text: string; ok: boolean } {
  if (page.canManagePosts === false) {
    return { text: 'Thiếu quyền đăng bài', ok: false };
  }
  if (page.canManagePosts === true) {
    return { text: 'Đủ quyền quản lý', ok: true };
  }
  if (page.tasks?.length) {
    return { text: page.tasks.slice(0, 3).join(', '), ok: true };
  }
  return { text: 'Quyền từ Facebook', ok: true };
}

export function AutoPostChannelsPanel() {
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

  const facebookParam = searchParams.get('facebook');

  // Sau callback OAuth → mở chế độ chọn Page; cũng mở khi còn pending (user refresh giữa chừng)
  useEffect(() => {
    if (facebookParam === 'oauth_connected' || facebookParam === 'connected') {
      if (searchParams.get('mode') === 'env') {
        setMsg('Đã kết nối Fanpage bằng Page Token trên server (không cần OAuth).');
      } else if (facebookParam === 'oauth_connected') {
        setSelectionMode(true);
        setMsg('Đăng nhập Facebook thành công — chọn Fanpage muốn kết nối.');
      } else {
        setMsg('Đã kết nối Facebook Fanpage thành công!');
      }
    }
    if (facebookParam === 'error') {
      const raw = searchParams.get('message') ?? 'Kết nối Facebook thất bại';
      setErrorMsg(redactClientSecrets(raw));
      setSelectionMode(false);
      // Drop sensitive query params from the address bar immediately.
      router.replace(buildContentAutoPostHref('channels'));
    }
  }, [facebookParam, searchParams, router]);

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
      setErrorMsg(formatMutationError(error, 'Kết nối Facebook thất bại'));
    }
  }, [mutations.connectFacebook]);

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
      setMsg('Đã làm mới danh sách Fanpage.');
    } catch (error) {
      setErrorMsg(formatMutationError(error, 'Không thể làm mới Fanpage'));
    }
  }, [mutations.refreshPages]);

  const handleDisconnectAll = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      await mutations.disconnectFacebook.mutateAsync();
      setMsg('Đã ngắt kết nối Facebook.');
      setSelectionMode(false);
      setSelectedPageIds(new Set());
    } catch (error) {
      setErrorMsg(formatMutationError(error, 'Không thể ngắt kết nối Facebook'));
    }
  }, [mutations.disconnectFacebook]);

  const handleDisconnectPage = useCallback(
    async (fanpageRowId: string) => {
      setMsg('');
      setErrorMsg('');
      setDisconnectingId(fanpageRowId);
      try {
        await mutations.disconnectPage.mutateAsync(fanpageRowId);
        setMsg('Đã ngắt kết nối Fanpage.');
        await refetchFbStatus();
      } catch (error) {
        setErrorMsg(formatMutationError(error, 'Không thể ngắt kết nối Fanpage'));
      } finally {
        setDisconnectingId(null);
      }
    },
    [mutations.disconnectPage, refetchFbStatus],
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
      setErrorMsg('Hãy chọn ít nhất một Fanpage để kết nối.');
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
          result.warning ||
            `Đã lưu ${okCount} Fanpage; ${failCount} trang thất bại. ${reasons}`,
        );
      } else {
        setMsg(`Đã kết nối ${okCount} Fanpage đã chọn.`);
      }
      setSelectionMode(false);
      setSelectedPageIds(new Set());
      clearOauthQuery();
      await refetchFbStatus();
    } catch (error) {
      setErrorMsg(formatMutationError(error, 'Không thể lưu Fanpage đã chọn'));
    }
  }, [
    selectedPageIds,
    mutations.selectOauthPages,
    clearOauthQuery,
    refetchFbStatus,
  ]);

  const selectablePages = useMemo(() => oauthPages?.pages ?? [], [oauthPages?.pages]);

  // Prefill: bỏ chọn sẵn các page đã connected khi vào selection
  useEffect(() => {
    if (!selectionMode || !oauthPages || oauthPages.status !== 'OK') return;
    if (selectedPageIds.size > 0) return;
    // Không auto-check — user phải chủ động chọn
  }, [selectionMode, oauthPages, selectedPageIds.size]);

  if (isLoading || isStatusLoading) {
    return <LoadingState message="Đang tải kết nối kênh..." />;
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
          Kết nối Facebook Fanpage
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
          Đăng nhập Facebook để kết nối và quản lý các Fanpage bạn được cấp quyền.
        </p>

        {status && status.facebookConnectAvailable === false && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Kết nối Facebook OAuth chưa sẵn sàng trên tài khoản này. Liên hệ quản trị nếu cần bật
            quyền kết nối Fanpage.
          </div>
        )}

        {status?.metaPageEnvConfigured && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Server đã cấu hình Page Token — có thể đồng bộ Fanpage môi trường (admin).
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
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
            Lỗi gần nhất: {fbStatus.lastError}
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
                ? 'Kết nối lại Facebook'
                : 'Kết nối Facebook'}
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
                Làm mới Fanpage
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10"
                onClick={() => {
                  setSelectionMode(true);
                  setSelectedPageIds(new Set());
                  setMsg('Chọn thêm Fanpage từ tài khoản Facebook đã đăng nhập.');
                }}
              >
                Chọn thêm Fanpage
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
                Ngắt tất cả
              </Button>
            </>
          )}
        </div>

        {/* OAuth page picker */}
        {selectionMode && (
          <div className="mt-6 space-y-4 rounded-lg border border-white/10 bg-[#083028] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                Chọn Fanpage muốn kết nối
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
                Đóng
              </Button>
            </div>

            {oauthPagesQuery.isLoading || oauthPagesQuery.isFetching ? (
              <LoadingState
                message="Đang tải danh sách Fanpage từ Facebook..."
                className="py-8 text-white [&_svg]:text-white"
              />
            ) : oauthPagesQuery.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-red-200">
                  {formatMutationError(oauthPagesQuery.error, 'Không tải được danh sách Fanpage')}
                </p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  Kết nối lại
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'MISSING_PERMISSION' ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-100">
                  {oauthPages.message ||
                    'Facebook chưa cấp đủ quyền (pages_show_list / pages_manage_posts).'}
                </p>
                {oauthPages.missingScopes?.length > 0 && (
                  <p className="text-xs text-white/60">
                    Thiếu: {oauthPages.missingScopes.join(', ')}
                  </p>
                )}
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  Kết nối lại
                </Button>
              </div>
            ) : showPicker &&
              (oauthPages?.status === 'TOKEN_EXPIRED' ||
                oauthPages?.status === 'NO_PENDING_OAUTH') ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-100">
                  {oauthPages.message ||
                    'Phiên OAuth không còn hiệu lực — bấm Kết nối lại Facebook.'}
                </p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  Kết nối lại
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'NO_PAGES' ? (
              <div className="space-y-3">
                <p className="text-sm text-white/75">
                  {oauthPages.message ||
                    'Không có Fanpage nào mà tài khoản này được phép quản lý.'}
                </p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  Kết nối lại
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'META_API_ERROR' ? (
              <div className="space-y-3">
                <p className="text-sm text-red-200">
                  {oauthPages.message || 'Lỗi khi gọi Facebook API.'}
                </p>
                <Button
                  type="button"
                  onClick={handleReconnect}
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                >
                  <Facebook className="mr-2 h-4 w-4" />
                  Kết nối lại
                </Button>
              </div>
            ) : showPicker && oauthPages?.status === 'OK' ? (
              <>
                {selectablePages.length === 0 ? (
                  <p className="text-sm text-white/70">Không có Fanpage để hiển thị.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectablePages.map((page) => {
                      const checked = selectedPageIds.has(page.pageId);
                      const perm = permissionLabel(page);
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
                                Page ID: {page.pageId}
                              </p>
                              <p
                                className={`mt-1 text-xs ${
                                  perm.ok ? 'text-emerald-300' : 'text-amber-300'
                                }`}
                              >
                                Quyền: {perm.text}
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
                    Kết nối Fanpage đã chọn
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
                    Kết nối lại
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
              {fbStatus.connectionMode === 'env' ? 'Fanpage (server token)' : 'Tài khoản'}:{' '}
              {fbStatus.facebookUserName ?? 'Facebook'}
            </p>
            <p className="text-sm font-medium text-white">
              Fanpage đã kết nối ({fbStatus.pages.length})
            </p>
            {fbStatus.pages.length === 0 ? (
              <p className="text-sm text-white/65">
                Chưa có Fanpage được chọn — bấm Kết nối Facebook hoặc Chọn thêm Fanpage.
              </p>
            ) : (
              <ul className="space-y-2">
                {fbStatus.pages.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-white/10 bg-[#0A3D30] px-3 py-2.5 text-sm text-white"
                  >
                    <PageAvatar page={p} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.pageName}</p>
                      <p className="break-all text-xs text-white/55">Page ID: {p.pageId}</p>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Đã kết nối
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-white/25 bg-transparent text-white hover:bg-white/10"
                        onClick={() => {
                          setDetailsPage(p);
                          setDetailsOpen(true);
                        }}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Xem chi tiết
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
                        Ngắt kết nối
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <FanpageDetailsDrawer
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsPage(null);
        }}
        page={detailsPage}
      />

      <div className="rounded-xl border border-white/10 bg-[#0A3D30]/80 p-5 sm:p-6">
        <div className="mb-2 flex items-center gap-2 text-[#F97316]">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <h3 className="text-sm font-semibold uppercase tracking-wide">Quyền pages_show_list</h3>
        </div>
        <p className="text-sm leading-relaxed text-white/85 sm:text-[15px]">
          MarketingAutoAZ sử dụng quyền <strong className="text-white">pages_show_list</strong> để
          hiển thị những Fanpage mà người dùng được Facebook cho phép quản lý. Người dùng tự chọn
          Fanpage muốn kết nối. Hệ thống không tự động kết nối hoặc đăng bài lên Fanpage chưa được
          chọn.
        </p>
      </div>
    </div>
  );
}
