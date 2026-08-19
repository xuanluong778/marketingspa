'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Facebook, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useAutoPostFacebookStatus } from '@/hooks/use-auto-post';
import { useMetaFanpageMutations, useMetaFanpageStatus } from '@/hooks/use-meta-fanpage';
import { formatMutationError } from '@/lib/format-mutation-error';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';
import type { AutoPostFacebookPage } from '@/types/auto-post';

/**
 * Trạng thái Fanpage trên tab Auto Post.
 * Ưu tiên OAuth / Fanpage đã lưu (Kết nối kênh); fallback token môi trường.
 * Page ID chỉ hiện khi đã kết nối thành công.
 */
export function MetaFanpageAutoPostPanel() {
  const {
    data: fbStatus,
    isLoading: fbLoading,
    isFetching: fbFetching,
    refetch: refetchFb,
  } = useAutoPostFacebookStatus();
  const { data: envStatus, isLoading: envLoading } = useMetaFanpageStatus();
  const { checkConnection } = useMetaFanpageMutations();

  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const oauthPages = fbStatus?.pages ?? [];
  const oauthConnected = Boolean(fbStatus?.connected && oauthPages.length > 0);
  const envConnected = Boolean(envStatus?.connected);

  const connected = oauthConnected || envConnected;
  const pages: AutoPostFacebookPage[] = useMemo(() => {
    if (oauthConnected) return oauthPages;
    if (envConnected) {
      return [
        {
          id: envStatus?.pageId || 'env',
          pageId: envStatus?.pageId || envStatus?.pageIdMasked || '',
          pageName: envStatus?.pageName || 'Fanpage (server)',
          pagePictureUrl: null,
        },
      ];
    }
    return [];
  }, [oauthConnected, oauthPages, envConnected, envStatus]);

  const primary = pages[0];
  const checking = checkConnection.isPending || fbFetching;

  const handleCheck = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      const [fb, env] = await Promise.all([refetchFb(), checkConnection.mutateAsync()]);
      const fbData = fb.data;
      const fbOk = Boolean(fbData?.connected && (fbData.pages?.length ?? 0) > 0);
      const envOk = Boolean(env.connected);
      if (fbOk) {
        const names = fbData!.pages.map((p) => p.pageName).join(', ');
        setMsg(`Kết nối thành công — ${names}`);
      } else if (envOk) {
        setMsg(env.message || 'Kết nối thành công.');
      } else {
        setErrorMsg(
          fbData?.lastError ||
            env.message ||
            'Chưa kết nối Fanpage. Vào tab Kết nối kênh để đăng nhập Facebook.',
        );
      }
    } catch (error) {
      setErrorMsg(formatMutationError(error, 'Không kiểm tra được kết nối Fanpage'));
    }
  }, [checkConnection, refetchFb]);

  if (fbLoading && envLoading) {
    return <LoadingState message="Đang kiểm tra kết nối Fanpage..." />;
  }

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Facebook className="h-5 w-5 text-[#1877F2]" />
            Kết nối Facebook Fanpage
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {connected
              ? 'Fanpage đã kết nối — có thể đăng bài từ thư viện hoặc đăng thủ công.'
              : 'Kết nối Fanpage tại tab Kết nối kênh. Token không nhập trên trình duyệt.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!connected && (
            <Button asChild variant="secondary">
              <Link href={buildContentAutoPostHref('channels')}>Kết nối kênh</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleCheck}
            disabled={checking}
          >
            {checking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Kiểm tra kết nối
          </Button>
        </div>
      </div>

      <div className={`grid gap-3 text-sm ${connected ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div className="rounded-md border px-3 py-2">
          <p className="text-muted-foreground text-xs">Trạng thái</p>
          <p className={connected ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}>
            {connected ? 'Kết nối thành công' : 'Chưa kết nối'}
          </p>
        </div>
        <div className="rounded-md border px-3 py-2">
          <p className="text-muted-foreground text-xs">Tên Fanpage</p>
          <p className="font-medium truncate">
            {connected ? primary?.pageName || '—' : '—'}
            {pages.length > 1 ? ` (+${pages.length - 1})` : ''}
          </p>
        </div>
        {connected ? (
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs">Page ID</p>
            <p className="font-medium font-mono break-all">
              {primary?.pageId || envStatus?.pageIdMasked || '—'}
            </p>
          </div>
        ) : null}
      </div>

      {connected && pages.length > 1 && (
        <ul className="space-y-1.5 text-sm">
          {pages.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <span className="font-medium">{p.pageName}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.pageId}</span>
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      )}
      {errorMsg && <ErrorState message={errorMsg} onRetry={() => setErrorMsg('')} />}
    </div>
  );
}
