'use client';

import { useState } from 'react';
import { Link2, RefreshCw, Unplug } from 'lucide-react';
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
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import {
  useChannelConnections,
  useConnectMessengerChannel,
  useConnectZaloChannel,
  useDeleteChannelConnection,
  useReconnectChannelConnection,
  useSyncMessagingFromChatbot,
  useTestChannelConnection,
  type ChannelConnectionItem,
} from '@/hooks/use-channel-connections';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';

function channelLabel(channel: ChannelConnectionItem['channel']) {
  return channel === 'MESSENGER' ? 'Messenger / Fanpage' : 'Zalo OA';
}

function statusLabel(status: ChannelConnectionItem['status']) {
  switch (status) {
    case 'ACTIVE':
      return 'Đã kết nối';
    case 'REAUTH_REQUIRED':
      return 'Cần kết nối lại';
    case 'EXPIRED':
      return 'Token hết hạn';
    case 'DISCONNECTED':
      return 'Đã ngắt';
    case 'PAUSED':
      return 'Tạm dừng';
    case 'ERROR':
      return 'Lỗi';
    default:
      return status;
  }
}

export function ChannelConnectionsPanel() {
  const t = useT();
  const list = useChannelConnections();
  const sync = useSyncMessagingFromChatbot();
  const test = useTestChannelConnection();
  const remove = useDeleteChannelConnection();
  const reconnect = useReconnectChannelConnection();
  const connectMessenger = useConnectMessengerChannel();
  const connectZalo = useConnectZaloChannel();

  const [actionError, setActionError] = useState('');
  const [actionInfo, setActionInfo] = useState('');
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [zaloOpen, setZaloOpen] = useState(false);
  const [reconnectTarget, setReconnectTarget] = useState<ChannelConnectionItem | null>(null);
  const [reconnectToken, setReconnectToken] = useState('');
  const [messengerForm, setMessengerForm] = useState({
    pageId: '',
    pageAccessToken: '',
    pageName: '',
  });
  const [zaloForm, setZaloForm] = useState({ oaId: '', accessToken: '', oaName: '' });

  const items = list.data ?? [];
  const showEmpty = !list.isLoading && !list.isError && items.length === 0;

  const showErr = (err: unknown) => {
    if (err instanceof ApiError) setActionError(err.message);
    else if (err instanceof Error) setActionError(err.message);
    else setActionError('Có lỗi xảy ra');
  };

  const runSync = () => {
    setActionError('');
    setActionInfo('');
    sync.mutate(undefined, {
      onSuccess: (res) => {
        setActionInfo(
          `Đồng bộ xong: ${res.synced} kênh thành công` +
            (res.failed ? `, ${res.failed} lỗi` : ''),
        );
      },
      onError: showErr,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{t('automation.channelTitle')}</h3>
          <p className="text-sm text-muted-foreground">
            Messenger / Zalo OA dùng cho chiến dịch hàng loạt — tái sử dụng kết nối Chatbot / Nội dung
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={runSync} disabled={sync.isPending || list.isLoading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
            {sync.isPending ? t('automation.syncing') : t('automation.syncFromChatbot')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMessengerOpen(true)}>
            + Messenger
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZaloOpen(true)}>
            + Zalo OA
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}
      {actionInfo && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {actionInfo}
        </div>
      )}

      {list.isLoading && <LoadingState message={t('automation.loadingChannels')} />}
      {list.isError && (
        <ErrorState
          message={t('automation.loadChannelsFailed')}
          onRetry={() => list.refetch()}
        />
      )}
      {showEmpty && (
        <EmptyState
          title={t('automation.emptyChannels')}
          description={t('automation.emptyChannelsHint')}
        />
      )}

      {!list.isLoading && !list.isError && items.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((c) => (
            <div key={c.id} className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{c.displayName || c.accountRef}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">ID: {c.accountRef}</p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  <Badge variant="outline">{channelLabel(c.channel)}</Badge>
                  <Badge variant="secondary">{statusLabel(c.status)}</Badge>
                  {c.isPaused && <Badge>Tạm dừng</Badge>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Đồng bộ gần nhất:{' '}
                {c.lastSyncedAt
                  ? formatDateTime(c.lastSyncedAt)
                  : c.updatedAt
                    ? formatDateTime(c.updatedAt)
                    : '—'}
                {c.lastTestedAt ? ` · Kiểm tra ${formatDateTime(c.lastTestedAt)}` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={test.isPending}
                  onClick={() => {
                    setActionError('');
                    test.mutate(c.id, { onError: showErr });
                  }}
                >
                  Làm mới
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReconnectTarget(c);
                    setReconnectToken('');
                    setActionError('');
                  }}
                >
                  Kết nối lại
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (!window.confirm(t('automation.disconnectConfirm'))) return;
                    setActionError('');
                    remove.mutate(c.id, { onError: showErr });
                  }}
                >
                  <Unplug className="mr-1 h-3.5 w-3.5" />
                  Ngắt kết nối
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={messengerOpen} onOpenChange={setMessengerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('automation.connectMessenger')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Page ID</Label>
              <Input
                value={messengerForm.pageId}
                onChange={(e) => setMessengerForm((f) => ({ ...f, pageId: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Page Access Token</Label>
              <Input
                type="password"
                value={messengerForm.pageAccessToken}
                onChange={(e) =>
                  setMessengerForm((f) => ({ ...f, pageAccessToken: e.target.value }))
                }
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label>Tên Page (tuỳ chọn)</Label>
              <Input
                value={messengerForm.pageName}
                onChange={(e) => setMessengerForm((f) => ({ ...f, pageName: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                connectMessenger.mutate(
                  { ...messengerForm, subscribeWebhook: true },
                  {
                    onSuccess: () => {
                      setMessengerOpen(false);
                      setMessengerForm({ pageId: '', pageAccessToken: '', pageName: '' });
                      setActionInfo('Đã lưu kết nối Messenger');
                    },
                    onError: showErr,
                  },
                )
              }
              disabled={connectMessenger.isPending}
            >
              Lưu kết nối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={zaloOpen} onOpenChange={setZaloOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('automation.connectZaloOa')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>OA ID</Label>
              <Input
                value={zaloForm.oaId}
                onChange={(e) => setZaloForm((f) => ({ ...f, oaId: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Access Token</Label>
              <Input
                type="password"
                value={zaloForm.accessToken}
                onChange={(e) => setZaloForm((f) => ({ ...f, accessToken: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label>Tên OA (tuỳ chọn)</Label>
              <Input
                value={zaloForm.oaName}
                onChange={(e) => setZaloForm((f) => ({ ...f, oaName: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                connectZalo.mutate(zaloForm, {
                  onSuccess: () => {
                    setZaloOpen(false);
                    setZaloForm({ oaId: '', accessToken: '', oaName: '' });
                    setActionInfo('Đã lưu kết nối Zalo OA');
                  },
                  onError: showErr,
                })
              }
              disabled={connectZalo.isPending}
            >
              Lưu kết nối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!reconnectTarget}
        onOpenChange={(open) => {
          if (!open) setReconnectTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Kết nối lại — {reconnectTarget?.displayName || reconnectTarget?.accountRef}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dán token mới. Token hiện tại không hiển thị lại vì lý do bảo mật.
            </p>
            <div className="space-y-1">
              <Label>
                {reconnectTarget?.channel === 'ZALO' ? 'Access Token Zalo' : 'Page Access Token'}
              </Label>
              <Input
                type="password"
                value={reconnectToken}
                onChange={(e) => setReconnectToken(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={reconnect.isPending || reconnectToken.trim().length < 10 || !reconnectTarget}
              onClick={() => {
                if (!reconnectTarget) return;
                const credentials: Record<string, string> =
                  reconnectTarget.channel === 'ZALO'
                    ? {
                        accessToken: reconnectToken.trim(),
                        oaId: reconnectTarget.accountRef,
                      }
                    : {
                        pageAccessToken: reconnectToken.trim(),
                        pageId: reconnectTarget.accountRef,
                      };
                reconnect.mutate(
                  { id: reconnectTarget.id, credentials },
                  {
                    onSuccess: () => {
                      setReconnectTarget(null);
                      setReconnectToken('');
                      setActionInfo('Đã kết nối lại kênh');
                    },
                    onError: showErr,
                  },
                );
              }}
            >
              Lưu token mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ChannelConnectionsPanel;
