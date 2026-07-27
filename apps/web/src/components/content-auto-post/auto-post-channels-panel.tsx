'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Facebook, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import {
  useAutoPostFacebookStatus,
  useAutoPostMutations,
  useAutoPostOauthPages,
  useAutoPostStatus,
} from '@/hooks/use-auto-post';
import { formatMutationError } from '@/lib/format-mutation-error';

export function AutoPostChannelsPanel() {
  const searchParams = useSearchParams();
  const { data: status, isLoading: isStatusLoading } = useAutoPostStatus();
  const { data: fbStatus, isLoading } = useAutoPostFacebookStatus();
  const mutations = useAutoPostMutations();
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [oauthPickOpen, setOauthPickOpen] = useState(false);

  useEffect(() => {
    const fb = searchParams.get('facebook');
    if (fb === 'connected') {
      setMsg(
        searchParams.get('mode') === 'env'
          ? 'Đã kết nối trang Facebook thành công (không cần đăng nhập lại trên trình duyệt).'
          : 'Đã kết nối Facebook Fanpage thành công!',
      );
    }
    if (fb === 'error') {
      setErrorMsg(searchParams.get('message') ?? 'Kết nối Facebook thất bại');
    }

    if (fb === 'oauth_connected' && searchParams.get('mode') === 'oauth') {
      setOauthPickOpen(true);
    }
  }, [searchParams]);

  const canConnect =
    Boolean(status?.metaPageEnvConfigured) || Boolean(status?.metaConfigured);

  const needsOauthPageSelection =
    Boolean(fbStatus?.connected && fbStatus.connectionMode === 'oauth' && fbStatus.pages.length === 0);

  const oauthPagesQuery = useAutoPostOauthPages(oauthPickOpen || needsOauthPageSelection);

  const handleConnectFacebook = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      await mutations.connectFacebook.mutateAsync();
    } catch (error) {
      setErrorMsg(formatMutationError(error, 'Kết nối Facebook thất bại'));
    }
  }, [mutations.connectFacebook]);

  const handleSelectOauthPage = useCallback(
    async (pageId: string) => {
      setMsg('');
      setErrorMsg('');
      try {
        await mutations.selectOauthPage.mutateAsync(pageId);
        setOauthPickOpen(false);
        // Xóa trạng thái oauth_connected khỏi URL để tránh modal tự mở lại
        window.location.href = '/content?tab=channels';
      } catch (error) {
        setErrorMsg(formatMutationError(error, 'Không thể lưu Fanpage đã chọn'));
      }
    },
    [mutations.selectOauthPage],
  );

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

  const handleDisconnect = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      await mutations.disconnectFacebook.mutateAsync();
      setMsg('Đã ngắt kết nối Facebook.');
    } catch (error) {
      setErrorMsg(formatMutationError(error, 'Không thể ngắt kết nối Facebook'));
    }
  }, [mutations.disconnectFacebook]);

  if (isLoading || isStatusLoading) {
    return <LoadingState message="Đang tải kết nối kênh..." />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Kết nối Facebook Fanpage</h2>
        <p className="text-sm text-muted-foreground">
          {status?.metaPageEnvConfigured
            ? 'Trang Facebook đã được cấu hình trên hệ thống. Bấm Kết nối để đồng bộ — không cần đăng nhập Facebook trên trình duyệt.'
            : 'Liên kết tài khoản Facebook để lấy danh sách trang. Thông tin đăng nhập được bảo mật trên hệ thống.'}
        </p>

        {status?.metaPageEnvConfigured && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Hệ thống đã sẵn sàng. Kết nối sẽ đồng bộ trang Facebook ngay.
          </div>
        )}

        {!status?.metaPageEnvConfigured && status && !status.metaConfigured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Trang Facebook chưa được cấu hình. Vui lòng liên hệ hỗ trợ để kết nối.
          </div>
        )}

        {!status?.metaPageEnvConfigured &&
          status?.metaConfigured &&
          !status.metaLoginConfigId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Cần hỗ trợ kỹ thuật hoàn tất cấu hình Facebook. Vui lòng liên hệ hỗ trợ.
            </div>
          )}

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {errorMsg && <ErrorState message={errorMsg} onRetry={() => setErrorMsg('')} />}
        {(fbStatus?.needsReconnect || fbStatus?.status === 'NEEDS_RECONNECT') && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Trạng thái: <strong>NEEDS_RECONNECT</strong> — Token Facebook đã hết hạn. Bấm
            &quot;Kết nối lại&quot; để cấp lại quyền.
          </div>
        )}
        {fbStatus?.status === 'MISSING_PERMISSION' && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Trạng thái: <strong>MISSING_PERMISSION</strong> — thiếu{' '}
            <code>pages_manage_posts</code>. Kết nối lại và cấp đủ quyền đăng bài.
          </div>
        )}
        {fbStatus?.lastError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Lỗi gần nhất: {fbStatus.lastError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {fbStatus?.connected ||
          fbStatus?.needsReconnect ||
          fbStatus?.status === 'NEEDS_RECONNECT' ||
          fbStatus?.status === 'MISSING_PERMISSION' ||
          fbStatus?.status === 'TOKEN_EXPIRED' ||
          fbStatus?.status === 'ERROR' ? (
            <>
              {needsOauthPageSelection ? (
                <Button variant="outline" onClick={() => setOauthPickOpen(true)}>
                  Chọn Fanpage
                </Button>
              ) : fbStatus?.connected ? (
                <Button variant="outline" onClick={handleRefreshPages}>
                  {mutations.refreshPages.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Làm mới Fanpage
                </Button>
              ) : null}
              <Button
                onClick={handleConnectFacebook}
                disabled={mutations.connectFacebook.isPending || !canConnect}
              >
                {mutations.connectFacebook.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Facebook className="mr-2 h-4 w-4" />
                )}
                Kết nối lại
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                disabled={mutations.disconnectFacebook.isPending}
              >
                {mutations.disconnectFacebook.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                Ngắt kết nối
              </Button>
            </>
          ) : (
            <Button
              onClick={handleConnectFacebook}
              disabled={mutations.connectFacebook.isPending || !canConnect}
            >
              {mutations.connectFacebook.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Facebook className="mr-2 h-4 w-4" />
              )}
              Kết nối Facebook
            </Button>
          )}
        </div>

        {fbStatus?.connected && (
          <div className="rounded-lg border bg-slate-50 p-4 space-y-2">
            <p className="text-sm font-medium">
              {fbStatus.connectionMode === 'env' ? 'Trang Facebook' : 'Tài khoản'}:{' '}
              {fbStatus.facebookUserName ?? 'Facebook'}
            </p>
            {fbStatus.tokenExpiresAt && (
              <p className="text-xs text-muted-foreground">
                Hết hạn kết nối: {new Date(fbStatus.tokenExpiresAt).toLocaleString('vi-VN')}
              </p>
            )}
            <p className="text-sm font-medium mt-3">
              Fanpage đã kết nối ({fbStatus.pages.length})
            </p>
            {fbStatus.pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có Fanpage — bấm Kết nối / Làm mới Fanpage.
              </p>
            ) : (
              <ul className="space-y-2">
                {fbStatus.pages.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border bg-white px-3 py-2 text-sm"
                  >
                    <div className="h-9 w-9 rounded-full bg-emerald-100 overflow-hidden shrink-0">
                      {p.pagePictureUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.pagePictureUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center font-bold text-emerald-700">
                          {p.pageName.slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <span className="font-medium">{p.pageName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Dialog
          open={oauthPickOpen}
          onOpenChange={(v) => {
            if (!v) setOauthPickOpen(false);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Chọn Fanpage Facebook</DialogTitle>
            </DialogHeader>

            {oauthPagesQuery.isLoading ? (
              <LoadingState message="Đang tải danh sách Fanpage..." />
            ) : oauthPagesQuery.error ? (
              <ErrorState
                message={
                  oauthPagesQuery.error instanceof Error
                    ? oauthPagesQuery.error.message
                    : 'Không thể tải danh sách Fanpage'
                }
                onRetry={() => oauthPagesQuery.refetch()}
              />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Hệ thống chỉ lưu Fanpage bạn chọn. Không tin `pageId` từ trình duyệt.
                </p>

                {oauthPagesQuery.data?.length ? (
                  <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
                    {oauthPagesQuery.data.map((p) => (
                      <Button
                        key={p.pageId}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => handleSelectOauthPage(p.pageId)}
                        disabled={mutations.selectOauthPage.isPending}
                      >
                        {p.pagePictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.pagePictureUrl} alt="" className="h-6 w-6 rounded-full mr-2 object-cover" />
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 mr-2 text-emerald-700 font-bold">
                            {p.pageName.slice(0, 1)}
                          </span>
                        )}
                        <span>{p.pageName}</span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Không có Fanpage phù hợp hoặc OAuth thiếu quyền. Hãy kết nối lại.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setTimeout(() => handleConnectFacebook(), 0)}
                    disabled={mutations.connectFacebook.isPending}
                  >
                    Kết nối lại
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setOauthPickOpen(false);
                      void handleDisconnect();
                    }}
                    disabled={mutations.disconnectFacebook.isPending}
                  >
                    Ngắt kết nối
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
