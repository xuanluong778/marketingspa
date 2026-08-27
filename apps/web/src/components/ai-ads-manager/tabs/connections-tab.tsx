'use client';

import { AlertTriangle, Facebook, Mail, Unplug } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { CONNECTION_STATUS_LABEL, type AdConnectionItem } from '@/types/ai-ads-manager';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

function ConnectionCard({
  title,
  icon,
  conn,
  canConnect,
  onConnect,
  onDisconnect,
  metaPermissions,
}: {
  title: string;
  icon: React.ReactNode;
  conn?: AdConnectionItem;
  canConnect: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  metaPermissions?: {
    ads_read: string;
    ads_management: string;
    missing: string[];
  } | null;
}) {
  const status = conn?.status ?? 'DISCONNECTED';
  const tone =
    status === 'CONNECTED'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'TOKEN_EXPIRED' || status === 'ERROR'
        ? 'bg-red-100 text-red-800'
        : status === 'INSUFFICIENT_PERMISSIONS'
          ? 'bg-amber-100 text-amber-900'
          : 'bg-slate-100 text-slate-700';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
        <span className={cn('inline-flex w-fit rounded px-2 py-0.5 text-xs', tone)}>
          {CONNECTION_STATUS_LABEL[status]}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {conn?.accountName && (
          <p className="text-sm text-muted-foreground">{conn.accountName}</p>
        )}
        {conn?.lastSyncAt && (
          <p className="text-xs text-muted-foreground">
            Sync lần cuối: {new Date(conn.lastSyncAt).toLocaleString('vi-VN')}
          </p>
        )}
        {conn?.lastError && (
          <p className="text-xs text-destructive line-clamp-2">{conn.lastError}</p>
        )}
        {metaPermissions && title.includes('Meta') && (
          <div className="rounded border border-border/60 bg-muted/30 p-2 text-xs space-y-1">
            <p>
              ads_read:{' '}
              <span className="font-medium">{metaPermissions.ads_read}</span>
              {' · '}
              ads_management:{' '}
              <span className="font-medium">{metaPermissions.ads_management}</span>
            </p>
            {metaPermissions.missing.length > 0 && (
              <p className="text-amber-700">
                Thiếu: {metaPermissions.missing.join(', ')} — kết nối lại OAuth
              </p>
            )}
            {metaPermissions.ads_management !== 'granted' && metaPermissions.ads_read === 'granted' && (
              <p className="text-amber-800">
                Báo cáo vẫn xem được; mọi thao tác ghi (tạo/sửa/pause) bị khóa.
              </p>
            )}
          </div>
        )}
        {!canConnect ? (
          <p className="text-xs text-muted-foreground">Bạn không có quyền ads.connect</p>
        ) : !conn?.connected ? (
          <Button size="sm" className="w-full" onClick={onConnect}>
            Kết nối OAuth
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full" onClick={onDisconnect}>
            <Unplug className="mr-2 h-4 w-4" /> Ngắt kết nối
          </Button>
        )}
        {(status === 'TOKEN_EXPIRED' || status === 'INSUFFICIENT_PERMISSIONS') && (
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Vui lòng kết nối lại
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AdsConnectionsTab({
  items,
  isLoading,
  isError,
  onRetry,
  canConnect,
  gmailEmail,
  gmailToken,
  onGmailEmail,
  onGmailToken,
  onConnectMeta,
  onConnectGoogle,
  onConnectGmail,
  onDisconnect,
  gmailPending,
  metaPermissions,
}: {
  items: AdConnectionItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canConnect: boolean;
  gmailEmail: string;
  gmailToken: string;
  onGmailEmail: (v: string) => void;
  onGmailToken: (v: string) => void;
  onConnectMeta: () => void;
  onConnectGoogle: () => void;
  onConnectGmail: () => void;
  onDisconnect: (provider: string) => void;
  gmailPending: boolean;
  metaPermissions?: {
    ads_read: string;
    ads_management: string;
    missing: string[];
  } | null;
}) {
  const t = useT();
  if (isLoading) return <LoadingState message={t('aiAds.loadingConnections')} />;
  if (isError) return <ErrorState onRetry={onRetry} />;

  const map = Object.fromEntries(items.map((c) => [c.provider, c]));

  if (!items.length) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <EmptyState
          title="Chưa tải được danh sách kết nối"
          description={t('aiAds.retryOrCheckAds')}
          className="col-span-full"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        OAuth server-side — frontend không nhận raw token. Credential lưu mã hóa trong PostgreSQL.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <ConnectionCard
        title="Meta Ads"
        icon={<Facebook className="h-5 w-5 text-blue-600" />}
        conn={map.META}
        canConnect={canConnect}
        onConnect={onConnectMeta}
        onDisconnect={() => onDisconnect('META')}
        metaPermissions={metaPermissions}
      />
      <ConnectionCard
        title="Google Ads"
        icon={<span className="text-emerald-600 font-bold">G</span>}
        conn={map.GOOGLE}
        canConnect={canConnect}
        onConnect={onConnectGoogle}
        onDisconnect={() => onDisconnect('GOOGLE')}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5" /> Gmail báo cáo
          </CardTitle>
          <CardDescription>
            {map.GMAIL ? CONNECTION_STATUS_LABEL[map.GMAIL.status] : 'Tuỳ chọn'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!canConnect ? (
            <p className="text-xs text-muted-foreground">Cần quyền ads.connect</p>
          ) : (
            <>
              <Input
                placeholder="Email nhận báo cáo"
                value={gmailEmail}
                onChange={(e) => onGmailEmail(e.target.value)}
              />
              <Input
                placeholder="Gmail refresh token"
                type="password"
                value={gmailToken}
                onChange={(e) => onGmailToken(e.target.value)}
                autoComplete="off"
              />
              <Button
                size="sm"
                className="w-full"
                onClick={onConnectGmail}
                disabled={!gmailEmail || !gmailToken || gmailPending}
              >
                Kết nối Gmail
              </Button>
              {map.GMAIL?.connected && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => onDisconnect('GMAIL')}
                >
                  Ngắt Gmail
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
