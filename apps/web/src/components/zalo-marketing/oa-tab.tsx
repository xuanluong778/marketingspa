'use client';

import { useState } from 'react';
import { Eye, Link2, MoreVertical, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import {
  useConnectZaloZbs,
  useDisconnectZaloOa,
  useRefreshZaloOa,
  useStartZaloOAuth,
  useZaloOaDetail,
  useZaloOas,
  useZaloOverview,
  type ZaloOaItem,
} from '@/hooks/use-zalo-marketing';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';

function oaStatusLabel(oa: ZaloOaItem, t: (key: string) => string) {
  if (oa.isPaused) return t('zalo.paused');
  if (oa.status === 'DISCONNECTED') return t('zalo.disconnected');
  if (oa.status === 'ACTIVE') return 'ACTIVE';
  return oa.status;
}

export function ZaloOaTab({
  oauthBanner,
  onDismissOauthBanner,
}: {
  oauthBanner?: { kind: 'success' | 'error'; message: string } | null;
  onDismissOauthBanner?: () => void;
}) {
  const t = useT();
  const overview = useZaloOverview();
  const oas = useZaloOas();
  const startOAuth = useStartZaloOAuth();
  const disconnectOa = useDisconnectZaloOa();
  const refreshOa = useRefreshZaloOa();
  const connectZbs = useConnectZaloZbs();
  const [showZbsForm, setShowZbsForm] = useState(false);
  const [actionError, setActionError] = useState('');
  const [detailTarget, setDetailTarget] = useState<ZaloOaItem | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ZaloOaItem | null>(null);
  const detailQuery = useZaloOaDetail(detailTarget?.id);
  const [zbsForm, setZbsForm] = useState({
    appId: '',
    secretKey: '',
    accessToken: '',
    accountRef: '',
    displayName: '',
    oaConnectionId: '',
  });

  const showErr = (err: unknown) => {
    if (err instanceof ApiError) setActionError(err.message);
    else if (err instanceof Error) setActionError(err.message);
    else setActionError(t('zalo.somethingWrong'));
  };

  if (oas.isLoading) return <LoadingState label={t('zalo.loadingOa')} />;
  if (oas.isError) return <ErrorState message={t('zalo.loadOaFailed')} onRetry={() => oas.refetch()} />;

  const oauthReady = overview.data?.oauthConfigured !== false;
  const detail = detailQuery.data ?? detailTarget;

  return (
    <div className="space-y-6">
      {oauthBanner ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            oauthBanner.kind === 'success'
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p>{oauthBanner.message}</p>
            {onDismissOauthBanner ? (
              <button
                type="button"
                className="shrink-0 text-xs underline"
                onClick={onDismissOauthBanner}
              >
                Đóng
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">Kết nối Zalo OA (OAuth)</p>
          <p className="text-sm text-muted-foreground">
            Mỗi tổ chức có thể kết nối nhiều OA. Token được mã hóa theo organization + oaId.
          </p>
          {typeof overview.data?.oauthRedirectUri === 'string' ? (
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              Callback URL (dán vào Zalo Developer): {overview.data.oauthRedirectUri}
            </p>
          ) : null}
          {!oauthReady && (
            <p className="mt-1 text-sm text-amber-600">
              Cần cấu hình ENV: ZALO_APP_ID, ZALO_APP_SECRET, ZALO_REDIRECT_URI
            </p>
          )}
        </div>
        <Button
          disabled={!oauthReady || startOAuth.isPending}
          onClick={async () => {
            setActionError('');
            const res = await startOAuth.mutateAsync({ returnPath: '/zalo-marketing?tab=oa' });
            window.location.href = res.url;
          }}
        >
          <Link2 className="mr-2 h-4 w-4" />
          {t('zalo.connectOaBtn')}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Danh sách OA / ZBS</h3>
          <Button variant="outline" size="sm" onClick={() => setShowZbsForm((v) => !v)}>
            {showZbsForm ? 'Đóng form ZBS' : 'Thêm kết nối ZBS'}
          </Button>
        </div>

        {showZbsForm && (
          <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
            <div>
              <Label>App ID</Label>
              <Input value={zbsForm.appId} onChange={(e) => setZbsForm({ ...zbsForm, appId: e.target.value })} />
            </div>
            <div>
              <Label>Secret Key</Label>
              <Input value={zbsForm.secretKey} onChange={(e) => setZbsForm({ ...zbsForm, secretKey: e.target.value })} />
            </div>
            <div>
              <Label>Access Token (ZBS)</Label>
              <Input
                value={zbsForm.accessToken}
                onChange={(e) => setZbsForm({ ...zbsForm, accessToken: e.target.value })}
              />
            </div>
            <div>
              <Label>Account Ref / OA ID</Label>
              <Input
                value={zbsForm.accountRef}
                onChange={(e) => setZbsForm({ ...zbsForm, accountRef: e.target.value })}
              />
            </div>
            <div>
              <Label>Tên hiển thị</Label>
              <Input
                value={zbsForm.displayName}
                onChange={(e) => setZbsForm({ ...zbsForm, displayName: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Button
                disabled={connectZbs.isPending}
                onClick={() =>
                  connectZbs.mutate(zbsForm, {
                    onSuccess: () => {
                      setShowZbsForm(false);
                      setZbsForm({
                        appId: '',
                        secretKey: '',
                        accessToken: '',
                        accountRef: '',
                        displayName: '',
                        oaConnectionId: '',
                      });
                    },
                  })
                }
              >
                Lưu kết nối ZBS
              </Button>
            </div>
          </div>
        )}

        {(oas.data ?? []).length === 0 ? (
          <EmptyState title={t('zalo.emptyOa')} description={t('zalo.connectOaHint')} />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-left">Loại</th>
                  <th className="px-3 py-2 text-left">OA ID</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {(oas.data ?? []).map((oa) => {
                  const isOa = oa.providerKind === 'ZALO_OA';
                  const isActive = oa.status === 'ACTIVE' && !oa.isPaused;
                  const isDisconnected = oa.status === 'DISCONNECTED';

                  return (
                    <tr key={oa.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{oa.displayName || oa.accountRef}</td>
                      <td className="px-3 py-2">{isOa ? 'OA' : 'ZBS'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{oa.accountRef}</td>
                      <td className="px-3 py-2">
                        <Badge variant={isActive ? 'default' : 'outline'}>{oaStatusLabel(oa, t)}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isOa && isDisconnected ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!oauthReady || startOAuth.isPending}
                            onClick={async () => {
                              setActionError('');
                              const res = await startOAuth.mutateAsync({
                                returnPath: '/zalo-marketing?tab=oa',
                              });
                              window.location.href = res.url;
                            }}
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            {t('zalo.reconnect')}
                          </Button>
                        ) : isOa && isActive ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Thao tác</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setActionError('');
                                  setDetailTarget(oa);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Xem chi tiết
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={refreshOa.isPending}
                                onClick={() => {
                                  setActionError('');
                                  refreshOa.mutate(oa.id, { onError: showErr });
                                }}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Làm mới kết nối
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setActionError('');
                                  setDisconnectTarget(oa);
                                }}
                              >
                                <Unplug className="mr-2 h-4 w-4" />
                                Ngắt kết nối
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(detailTarget)} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chi tiết OA</DialogTitle>
          </DialogHeader>
          {detail ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Tên</dt>
                <dd className="font-medium">{detail.displayName || detail.accountRef}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">OA ID</dt>
                <dd className="font-mono text-xs">{detail.accountRef}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Trạng thái</dt>
                <dd>{oaStatusLabel(detail, t)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Token</dt>
                <dd>{detail.hasCredentials ? 'Đã lưu (mã hóa)' : 'Không có'}</dd>
              </div>
              {detail.tokenExpiresAt ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Hết hạn token</dt>
                  <dd>{formatDateTime(detail.tokenExpiresAt)}</dd>
                </div>
              ) : null}
              {detail.lastSyncedAt ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Đồng bộ gần nhất</dt>
                  <dd>{formatDateTime(detail.lastSyncedAt)}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <LoadingState label={t('zalo.loading')} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(disconnectTarget)} onOpenChange={(open) => !open && setDisconnectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ngắt kết nối Zalo OA?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            OA <strong>{disconnectTarget?.displayName || disconnectTarget?.accountRef}</strong> sẽ
            chuyển sang trạng thái <strong>DISCONNECTED</strong>. Token OAuth bị vô hiệu — worker
            không gửi tin hoặc refresh. Hội thoại, chiến dịch và báo cáo được giữ nguyên.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDisconnectTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={disconnectOa.isPending}
              onClick={() => {
                if (!disconnectTarget) return;
                disconnectOa.mutate(disconnectTarget.id, {
                  onSuccess: () => setDisconnectTarget(null),
                  onError: showErr,
                });
              }}
            >
              {disconnectOa.isPending ? 'Đang ngắt…' : 'Ngắt kết nối'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
