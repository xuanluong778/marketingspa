'use client';

import { useMemo, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { useMessagingIdentities } from '@/hooks/use-messaging-identities';
import { CHANNEL_OPTIONS, type MessageChannel } from '@/types/automation-messaging';
import type { MessagingSegmentConfig } from '@/types/messaging-campaign';
import type { BulkCampaignPrefill } from './bulk-campaign-panel';

type Props = {
  onCreateBulkCampaign: (prefill: BulkCampaignPrefill) => void;
};

export function AudiencePanel({ onCreateBulkCampaign }: Props) {
  const [channel, setChannel] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params = useMemo(() => {
    const p: Record<string, string> = { pageSize: '50' };
    if (channel) p.channel = channel;
    if (search.trim()) p.search = search.trim();
    return p;
  }, [channel, search]);

  const query = useMessagingIdentities(params);
  const items = query.data?.items ?? [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.map((i) => i.id)));
  }

  function createCampaign() {
    const ids = [...selected];
    const first = items.find((i) => ids.includes(i.id));
    const segmentConfig: MessagingSegmentConfig = {
      identityIds: ids.length ? ids : undefined,
      excludeSuppressed: true,
      requireOptIn: false,
    };
    onCreateBulkCampaign({
      channel: (first?.channel as MessageChannel) || (channel as MessageChannel) || 'MESSENGER',
      segmentConfig,
      name: ids.length ? `Blast ${ids.length} liên hệ` : 'Chiến dịch hàng loạt mới',
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Kênh</label>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">Tất cả</option>
            {CHANNEL_OPTIONS.filter((c) => c.value === 'MESSENGER' || c.value === 'ZALO').map(
              (c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="min-w-[200px] flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Tìm kiếm</label>
          <Input
            placeholder="Tên, SĐT, external ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={selectAll} disabled={!items.length}>
          Chọn trang này
        </Button>
        <Button onClick={createCampaign} disabled={selected.size === 0}>
          <Megaphone className="mr-2 h-4 w-4" />
          Tạo chiến dịch ({selected.size})
        </Button>
      </div>

      {query.isLoading && <LoadingState message="Đang tải tệp khách hàng…" />}
      {query.isError && <ErrorState onRetry={query.refetch} />}
      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          title="Chưa có danh bạ nhắn tin"
          description="Đồng bộ Fanpage/Zalo OA hoặc khách tương tác sẽ xuất hiện tại đây."
        />
      )}

      {!query.isLoading && !query.isError && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 w-10" />
                <th className="p-3">Tên</th>
                <th className="p-3">Kênh</th>
                <th className="p-3">Trạng thái</th>
                <th className="p-3">Khách / Lead</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      aria-label={`Chọn ${row.displayName || row.externalUserId}`}
                    />
                  </td>
                  <td className="p-3 font-medium">{row.displayName || row.externalUserId}</td>
                  <td className="p-3">
                    <Badge variant="outline">{row.channel}</Badge>
                  </td>
                  <td className="p-3">
                    {row.optedOut ? (
                      <Badge variant="secondary">Opt-out</Badge>
                    ) : row.isBlocked ? (
                      <Badge variant="destructive">Blocked</Badge>
                    ) : (
                      <Badge variant="outline">{row.followStatus || row.consentStatus}</Badge>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {row.customer?.name || row.lead?.name || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Send className="h-3.5 w-3.5" />
        Chọn liên hệ rồi bấm “Tạo chiến dịch” để chuyển sang tab Nhắn tin hàng loạt.
      </p>
    </div>
  );
}

export default AudiencePanel;
