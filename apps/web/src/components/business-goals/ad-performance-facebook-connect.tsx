'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Facebook, Loader2, RefreshCw, Unplug, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { defaultDateRange } from '@/lib/facebook-ads-to-form';
import {
  useFacebookAdAccounts,
  useFacebookAdsMutations,
  useFacebookAdsStatus,
  useFacebookCampaigns,
  useFacebookSyncLogs,
} from '@/hooks/use-facebook-ads';
import type { FacebookSyncedCampaign } from '@/types/facebook-ads';
import { AD_CAMPAIGN_TYPE_OPTIONS } from '@/lib/ad-performance-form';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  DISCONNECTED: { label: 'Chưa kết nối', tone: 'bg-slate-100 text-slate-700' },
  CONNECTED: { label: 'Đã kết nối', tone: 'bg-emerald-100 text-emerald-800' },
  SYNCING: { label: 'Đang đồng bộ…', tone: 'bg-blue-100 text-blue-800' },
  TOKEN_EXPIRED: { label: 'Token hết hạn', tone: 'bg-red-100 text-red-800' },
  NO_AD_ACCOUNT_ACCESS: { label: 'Không có quyền ad account', tone: 'bg-amber-100 text-amber-900' },
  ERROR: { label: 'Lỗi kết nối', tone: 'bg-red-100 text-red-800' },
};

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);
}

function formatMoney(n: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(n))}đ`;
}

function formatPercent(n: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n)}%`;
}

export interface AdPerformanceFacebookConnectProps {
  onImportCampaigns: (campaigns: FacebookSyncedCampaign[]) => void;
  oauthMessage?: string | null;
}

export function AdPerformanceFacebookConnect({
  onImportCampaigns,
  oauthMessage,
}: AdPerformanceFacebookConnectProps) {
  const [{ dateFrom, dateTo }, setDateRange] = useState(defaultDateRange);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  const { data: status, isLoading: statusLoading } = useFacebookAdsStatus();
  const connected = status?.connected ?? false;
  const { data: adAccountsData, isLoading: accountsLoading } = useFacebookAdAccounts(connected);
  const { connect, selectAdAccount, sync, disconnect } = useFacebookAdsMutations();
  const {
    data: campaignsData,
    isLoading: campaignsLoading,
    refetch,
  } = useFacebookCampaigns(
    {
      dateFrom,
      dateTo,
      campaignId: campaignFilter !== 'all' ? campaignFilter : undefined,
      adAccountId: status?.selectedAdAccountId ?? undefined,
    },
    connected && !!status?.selectedAdAccountId,
  );
  const { data: syncLogsData } = useFacebookSyncLogs(connected);

  const statusConfig = STATUS_LABEL[status?.status ?? 'DISCONNECTED'] ?? {
    label: 'Chưa kết nối',
    tone: 'bg-slate-100 text-slate-700',
  };
  const campaigns = useMemo(() => campaignsData?.items ?? [], [campaignsData?.items]);
  const adAccounts = useMemo(() => adAccountsData?.items ?? [], [adAccountsData?.items]);

  const campaignOptions = useMemo(() => {
    const unique = new Map<string, string>();
    campaigns.forEach((c) => unique.set(c.campaignId, c.campaignName));
    return Array.from(unique.entries());
  }, [campaigns]);

  useEffect(() => {
    if (connected && status?.selectedAdAccountId && campaigns.length > 0) {
      onImportCampaigns(campaigns);
    }
  }, [campaigns, connected, onImportCampaigns, status?.selectedAdAccountId]);

  const handleSelectAccount = useCallback(
    (accountId: string) => {
      const acc = adAccounts.find((a) => a.id === accountId);
      selectAdAccount.mutate({ adAccountId: accountId, adAccountName: acc?.name });
    },
    [adAccounts, selectAdAccount],
  );

  const handleSync = useCallback(() => {
    sync.mutate({
      dateFrom,
      dateTo,
      campaignId: campaignFilter !== 'all' ? campaignFilter : undefined,
    });
  }, [sync, dateFrom, dateTo, campaignFilter]);

  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-blue-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Facebook className="h-5 w-5 text-blue-600" />
          <div>
            <h2 className="font-semibold text-slate-900">Facebook Ads</h2>
            <p className="text-xs text-slate-600">Đồng bộ chiến dịch qua Meta Marketing API</p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium',
            statusConfig.tone,
          )}
        >
          {statusLoading ? 'Đang kiểm tra…' : statusConfig.label}
        </span>
      </div>

      <div className="space-y-4 p-4">
        {oauthMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {oauthMessage}
          </div>
        )}

        {status?.lastSyncError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {status.lastSyncError}
          </div>
        )}

        {!connected ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Kết nối tài khoản Facebook để tự động lấy spend, impressions, reach và kết quả chiến
              dịch.
            </p>
            <Button
              type="button"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {connect.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Facebook className="mr-2 h-4 w-4" />
              )}
              Kết nối Facebook Ads
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Tài khoản quảng cáo</Label>
                <Select
                  value={status?.selectedAdAccountId ?? ''}
                  onValueChange={handleSelectAccount}
                  disabled={accountsLoading || selectAdAccount.isPending}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Chọn ad account" />
                  </SelectTrigger>
                  <SelectContent>
                    {adAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.accountId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Từ ngày</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateRange((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Đến ngày</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateRange((p) => ({ ...p, dateTo: e.target.value }))}
                  className="bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Chiến dịch</Label>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả chiến dịch</SelectItem>
                    {campaignOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleSync}
                disabled={!status?.selectedAdAccountId || sync.isPending}
              >
                {sync.isPending || status?.status === 'SYNCING' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Đồng bộ ngay
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => refetch()}
                disabled={campaignsLoading}
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', campaignsLoading && 'animate-spin')} />
                Làm mới dữ liệu
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                <Unplug className="mr-2 h-4 w-4" />
                Ngắt kết nối
              </Button>
            </div>

            {status?.lastSyncAt && (
              <p className="text-xs text-slate-500">
                Đồng bộ lần cuối: {formatDateTime(status.lastSyncAt)}
                {status.lastSyncStatus === 'SUCCESS' && ' · Thành công'}
              </p>
            )}

            {campaigns.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[900px] text-xs md:text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-left text-white">
                      <th className="px-2 py-2 font-medium">Chiến dịch</th>
                      <th className="px-2 py-2 font-medium">Loại</th>
                      <th className="px-2 py-2 font-medium">Ngân sách</th>
                      <th className="px-2 py-2 font-medium">Kết quả</th>
                      <th className="px-2 py-2 font-medium">CPM</th>
                      <th className="px-2 py-2 font-medium">CPC</th>
                      <th className="px-2 py-2 font-medium">CTR</th>
                      <th className="px-2 py-2 font-medium">Reach</th>
                      <th className="px-2 py-2 font-medium">Tần suất</th>
                      <th className="px-2 py-2 font-medium">CP/KQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const typeLabel =
                        AD_CAMPAIGN_TYPE_OPTIONS.find((o) => o.value === c.campaignType)?.label ??
                        c.campaignType;
                      return (
                        <tr key={c.campaignId} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-medium text-slate-900">{c.campaignName}</td>
                          <td className="px-2 py-2 text-slate-600">{typeLabel}</td>
                          <td className="px-2 py-2 tabular-nums">{formatMoney(c.spend)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatCount(c.results)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatMoney(c.cpm)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatMoney(c.cpc)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatPercent(c.ctr)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatCount(c.reach)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatCount(c.frequency)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatMoney(c.costPerResult)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {syncLogsData?.items?.length ? (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-medium text-slate-700">
                  Nhật ký đồng bộ
                </summary>
                <ul className="mt-2 space-y-1">
                  {syncLogsData.items.slice(0, 5).map((log) => (
                    <li key={log.id}>
                      {formatDateTime(log.syncStartedAt)} · {log.status} · {log.campaignsSynced}{' '}
                      chiến dịch
                      {log.errorMessage ? ` · ${log.errorMessage}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
