'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMemo, useState } from 'react';
import { useSyncZaloTemplates, useZaloOas, useZaloTemplates } from '@/hooks/use-zalo-marketing';

export function ZaloTemplatesTab() {
  const oas = useZaloOas();
  const zbsConnections = useMemo(
    () => (oas.data ?? []).filter((c) => c.providerKind === 'ZBS_TEMPLATE'),
    [oas.data],
  );
  const [connectionId, setConnectionId] = useState('');
  const activeConnection = connectionId || zbsConnections[0]?.id || '';
  const templates = useZaloTemplates(activeConnection || undefined);
  const sync = useSyncZaloTemplates();

  if (oas.isLoading) return <LoadingState label="Đang tải kết nối ZBS..." />;
  if (oas.isError) return <ErrorState message="Không tải được kết nối" onRetry={() => oas.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] space-y-1">
          <p className="text-sm font-medium">Kết nối ZBS</p>
          <Select value={activeConnection} onValueChange={setConnectionId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn kết nối ZBS" />
            </SelectTrigger>
            <SelectContent>
              {zbsConnections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.displayName || c.accountRef}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={!activeConnection || sync.isPending}
          onClick={() => sync.mutate(activeConnection)}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Đồng bộ từ Zalo
        </Button>
      </div>

      {zbsConnections.length === 0 ? (
        <EmptyState
          title="Chưa có kết nối ZBS"
          description="Kết nối ZBS Business API ở tab Zalo OA trước khi đồng bộ template."
        />
      ) : templates.isLoading ? (
        <LoadingState label="Đang tải mẫu ZBS..." />
      ) : (templates.data ?? []).length === 0 ? (
        <EmptyState title="Chưa có template" description="Nhấn Đồng bộ để lấy mẫu đã duyệt từ Zalo." />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-left">Mã Zalo</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-left">Biến</th>
              </tr>
            </thead>
            <tbody>
              {(templates.data ?? []).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{t.providerTemplateId}</td>
                  <td className="px-3 py-2">
                    <Badge variant={t.approvalStatus === 'APPROVED' ? 'default' : 'outline'}>
                      {t.approvalStatus}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {Array.isArray(t.variables) ? t.variables.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
