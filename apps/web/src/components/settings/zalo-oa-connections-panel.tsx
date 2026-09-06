'use client';

import { useState } from 'react';
import { Link2, RefreshCw, Trash2, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import {
  resolveZaloUiStatus,
  useCreateZaloConnection,
  useDeleteZaloConnection,
  useRefreshZaloConnectionToken,
  useTestZaloConnection,
  useZaloConnections,
  type ZaloConnectionItem,
  type ZaloUiStatus,
} from '@/hooks/use-zalo-connections';

const EMPTY_FORM = {
  oaName: '',
  oaId: '',
  accessToken: '',
  refreshToken: '',
  webhookSecret: '',
};

function statusBadgeVariant(
  ui: ZaloUiStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (ui) {
    case 'Connected':
      return 'default';
    case 'Token Expiring':
      return 'outline';
    case 'Refresh Failed':
    case 'Expired':
    case 'Error':
      return 'destructive';
    case 'Paused':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function maskFlag(present: boolean): string {
  return present ? '••••••••' : '—';
}

/**
 * Cài đặt → Kết nối → Zalo OA
 * Tokens chỉ nằm trong React state lúc nhập; gửi lên API rồi xóa form.
 * Không ghi localStorage / console.log token.
 */
export function ZaloOaConnectionsPanel() {
  const list = useZaloConnections();
  const create = useCreateZaloConnection();
  const test = useTestZaloConnection();
  const refresh = useRefreshZaloConnectionToken();
  const remove = useDeleteZaloConnection();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [actionError, setActionError] = useState('');
  const [actionInfo, setActionInfo] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = list.data ?? [];
  const showEmpty = !list.isLoading && !list.isError && items.length === 0;

  const showErr = (err: unknown) => {
    if (err instanceof ApiError) setActionError(err.message);
    else if (err instanceof Error) setActionError(err.message);
    else setActionError('Có lỗi xảy ra');
  };

  const clearForm = () => setForm(EMPTY_FORM);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      clearForm();
      setActionError('');
    } else {
      setActionError('');
      setActionInfo('');
    }
  };

  const submitCreate = () => {
    setActionError('');
    setActionInfo('');
    const oaId = form.oaId.trim();
    const accessToken = form.accessToken.trim();
    if (!oaId || !accessToken) {
      setActionError('Cần OA ID và Access Token');
      return;
    }
    create.mutate(
      {
        oaId,
        oaName: form.oaName.trim() || undefined,
        accessToken,
        refreshToken: form.refreshToken.trim() || undefined,
        webhookSecret: form.webhookSecret.trim() || undefined,
      },
      {
        onSuccess: () => {
          clearForm();
          setOpen(false);
          setActionInfo('Đã lưu kết nối Zalo OA (token đã mã hóa trên server)');
        },
        onError: showErr,
      },
    );
  };

  const runTest = (item: ZaloConnectionItem) => {
    setActionError('');
    setActionInfo('');
    setBusyId(item.id);
    test.mutate(item.id, {
      onSuccess: (res) => {
        setBusyId(null);
        setActionInfo(
          res.valid
            ? `Kết nối OK${res.displayName ? `: ${res.displayName}` : ''}`
            : res.message || 'Kiểm tra thất bại',
        );
        if (!res.valid) setActionError(res.message || 'Kiểm tra thất bại');
      },
      onError: (err) => {
        setBusyId(null);
        showErr(err);
      },
    });
  };

  const runRefresh = (item: ZaloConnectionItem) => {
    setActionError('');
    setActionInfo('');
    setBusyId(item.id);
    refresh.mutate(item.id, {
      onSuccess: () => {
        setBusyId(null);
        setActionInfo('Đã refresh access token (lưu mã hóa trên server)');
      },
      onError: (err) => {
        setBusyId(null);
        showErr(err);
      },
    });
  };

  const runDelete = (item: ZaloConnectionItem) => {
    if (!window.confirm(`Xóa kết nối OA «${item.oaName || item.oaId}»?`)) return;
    setActionError('');
    setActionInfo('');
    setBusyId(item.id);
    remove.mutate(item.id, {
      onSuccess: () => {
        setBusyId(null);
        setActionInfo('Đã xóa kết nối Zalo OA');
      },
      onError: (err) => {
        setBusyId(null);
        showErr(err);
      },
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Zalo OA
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Lưu OA theo tổ chức (JWT). Access / Refresh / OA Secret Key chỉ gửi lên server khi
              kết nối — hiển thị dạng •••••••• sau khi lưu. Không lưu token trên trình duyệt.
            </p>
            <p className="text-xs text-muted-foreground font-normal">
              Webhook:{' '}
              <code className="text-[11px]">https://marketingautoaz.com/api/v1/webhooks/zalo</code>
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            + Thêm Zalo OA
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          {actionInfo ? <p className="text-sm text-muted-foreground">{actionInfo}</p> : null}

          {list.isLoading ? <LoadingState /> : null}
          {list.isError ? (
            <ErrorState
              message={(list.error as Error)?.message || 'Không tải được danh sách OA'}
              onRetry={() => void list.refetch()}
            />
          ) : null}
          {showEmpty ? (
            <EmptyState
              title="Chưa kết nối Zalo OA"
              description="Thêm OA với Access Token, Refresh Token và OA Secret Key (webhook)."
            />
          ) : null}

          <ul className="space-y-3">
            {items.map((item) => {
              const ui = resolveZaloUiStatus(item);
              const busy = busyId === item.id;
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-border/80 p-3 sm:p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.oaName || item.oaId}</p>
                      <p className="text-xs text-muted-foreground">OA ID: {item.oaId}</p>
                    </div>
                    <Badge variant={statusBadgeVariant(ui)}>{ui}</Badge>
                  </div>

                  <dl className="grid gap-2 text-xs sm:grid-cols-2 text-muted-foreground">
                    <div>
                      <dt className="font-medium text-foreground/80">Access Token</dt>
                      <dd className="font-mono tracking-wider">
                        {maskFlag(item.accessTokenEncrypted)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">Refresh Token</dt>
                      <dd className="font-mono tracking-wider">
                        {maskFlag(item.refreshTokenEncrypted)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">OA Secret Key</dt>
                      <dd className="font-mono tracking-wider">{maskFlag(item.webhookSecret)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">Hết hạn access</dt>
                      <dd>
                        {item.accessTokenExpiresAt
                          ? formatDateTime(item.accessTokenExpiresAt)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">Kiểm tra gần nhất</dt>
                      <dd>
                        {item.lastTestedAt ? formatDateTime(item.lastTestedAt) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground/80">Trạng thái server</dt>
                      <dd>{item.status}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || test.isPending}
                      onClick={() => runTest(item)}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1" />
                      Kiểm tra kết nối
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || refresh.isPending || !item.refreshTokenEncrypted}
                      onClick={() => runRefresh(item)}
                      title={
                        item.refreshTokenEncrypted
                          ? 'Refresh access token'
                          : 'Chưa có refresh token'
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Refresh Token
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busy || remove.isPending}
                      onClick={() => runDelete(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Xóa
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm Zalo OA</DialogTitle>
          </DialogHeader>
          {actionError ? (
            <p className="text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              {actionError}
            </p>
          ) : null}
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="zalo-oa-name">Tên OA</Label>
              <Input
                id="zalo-oa-name"
                autoComplete="off"
                value={form.oaName}
                onChange={(e) => setForm((f) => ({ ...f, oaName: e.target.value }))}
                placeholder="VD: OA Công ty Thế Giới Digi"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zalo-oa-id">OA ID</Label>
              <Input
                id="zalo-oa-id"
                autoComplete="off"
                value={form.oaId}
                onChange={(e) => setForm((f) => ({ ...f, oaId: e.target.value }))}
                placeholder="oa_id từ Zalo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zalo-access">Access Token</Label>
              <Input
                id="zalo-access"
                type="password"
                autoComplete="off"
                value={form.accessToken}
                onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zalo-refresh">Refresh Token</Label>
              <Input
                id="zalo-refresh"
                type="password"
                autoComplete="off"
                value={form.refreshToken}
                onChange={(e) => setForm((f) => ({ ...f, refreshToken: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zalo-secret">OA Secret Key (webhook)</Label>
              <Input
                id="zalo-secret"
                type="password"
                autoComplete="off"
                value={form.webhookSecret}
                onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
                placeholder="Dùng verify X-ZEvent-Signature"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              organizationId lấy từ JWT phía server — không gửi từ form. Token không được lưu vào
              localStorage.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button onClick={submitCreate} disabled={create.isPending}>
              {create.isPending ? 'Đang lưu…' : 'Lưu kết nối'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
