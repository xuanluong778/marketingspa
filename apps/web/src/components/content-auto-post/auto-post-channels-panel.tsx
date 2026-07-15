'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Facebook, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import {
  useAutoPostFacebookStatus,
  useAutoPostMutations,
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

  useEffect(() => {
    const fb = searchParams.get('facebook');
    if (fb === 'connected') {
      setMsg(
        searchParams.get('mode') === 'env'
          ? 'Đã kết nối Fanpage bằng Page Token trên server (không cần OAuth).'
          : 'Đã kết nối Facebook Fanpage thành công!',
      );
    }
    if (fb === 'error') {
      setErrorMsg(searchParams.get('message') ?? 'Kết nối Facebook thất bại');
    }
  }, [searchParams]);

  const canConnect =
    Boolean(status?.metaPageEnvConfigured) || Boolean(status?.metaConfigured);

  const handleConnectFacebook = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      await mutations.connectFacebook.mutateAsync();
    } catch (error) {
      setErrorMsg(formatMutationError(error, 'Kết nối Facebook thất bại'));
    }
  }, [mutations.connectFacebook]);

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
            ? 'Đang dùng Page Token cấu hình trên server (.env). Bấm Kết nối để đồng bộ Fanpage — không mở OAuth Facebook (tránh lỗi Invalid Scopes).'
            : 'Liên kết tài khoản Facebook để lấy danh sách Fanpage. Token được mã hóa trên server — không hiển thị trên trình duyệt.'}
        </p>

        {status?.metaPageEnvConfigured && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Server đã có <code className="rounded bg-emerald-100 px-1">META_PAGE_ID</code> + Page
            Token. Kết nối sẽ đồng bộ Fanpage ngay, không cần Facebook Login dialog.
          </div>
        )}

        {!status?.metaPageEnvConfigured && status && !status.metaConfigured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Chưa cấu hình Page Token (`META_PAGE_ID` / `META_PAGE_ACCESS_TOKEN`) hoặc App OAuth trên
            server.
          </div>
        )}

        {!status?.metaPageEnvConfigured &&
          status?.metaConfigured &&
          !status.metaLoginConfigId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              App Meta Business cần <code className="rounded bg-amber-100 px-1">META_LOGIN_CONFIG_ID</code>{' '}
              hoặc cấu hình Page Token trên server. OAuth cổ điển sẽ báo Invalid Scopes.
            </div>
          )}

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {errorMsg && <ErrorState message={errorMsg} onRetry={() => setErrorMsg('')} />}
        {fbStatus?.lastError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Lỗi gần nhất: {fbStatus.lastError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {fbStatus?.connected ? (
            <>
              <Button variant="outline" onClick={handleRefreshPages}>
                {mutations.refreshPages.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Làm mới Fanpage
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
              {fbStatus.connectionMode === 'env' ? 'Fanpage (server token)' : 'Tài khoản'}:{' '}
              {fbStatus.facebookUserName ?? 'Facebook'}
            </p>
            {fbStatus.tokenExpiresAt && (
              <p className="text-xs text-muted-foreground">
                Token hết hạn: {new Date(fbStatus.tokenExpiresAt).toLocaleString('vi-VN')}
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
      </div>
    </div>
  );
}
