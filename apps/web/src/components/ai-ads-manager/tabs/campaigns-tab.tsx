'use client';

import { Pause, Play, Send, Wand2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import type { AdManagerCampaignRow } from '@/types/ai-ads-manager';
import { formatMoney, formatNum, platformLabel } from '../ads-format';

export function AdsCampaignsTab({
  items,
  total,
  isLoading,
  isError,
  onRetry,
  canManage,
  canAnalyze,
  onDetail,
  onPause,
  onEnable,
  onOptimize,
  onSendReport,
}: {
  items: AdManagerCampaignRow[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canManage: boolean;
  canAnalyze: boolean;
  onDetail: (c: AdManagerCampaignRow) => void;
  onPause: (id: string) => void;
  onEnable: (id: string) => void;
  onOptimize: (id: string) => void;
  onSendReport: () => void;
}) {
  if (isLoading) return <LoadingState message="Đang tải chiến dịch từ database..." />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (!items.length) {
    return (
      <EmptyState
        title="Chưa có chiến dịch"
        description="Kết nối tài khoản và đồng bộ để lưu insights vào PostgreSQL."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="px-4 py-2 text-xs text-muted-foreground border-b">
          {items.length}/{total} chiến dịch (đã lọc)
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nền tảng</TableHead>
              <TableHead>Tên</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Chi tiêu</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPA</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">Điểm</TableHead>
              <TableHead>Gợi ý AI</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.insightId}>
                <TableCell>
                  <Badge variant="secondary">{platformLabel(c.platform)}</Badge>
                </TableCell>
                <TableCell className="font-medium max-w-[180px] truncate">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{c.status}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatMoney(c.spend)}</TableCell>
                <TableCell className="text-right">{formatNum(c.ctr)}%</TableCell>
                <TableCell className="text-right">
                  {c.cpa != null && c.cpa > 0 ? formatMoney(c.cpa) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {c.roas != null ? formatNum(c.roas) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={(c.efficiencyScore ?? 0) >= 60 ? 'default' : 'secondary'}
                    className={
                      (c.efficiencyScore ?? 0) < 60 ? 'bg-red-100 text-red-800' : undefined
                    }
                  >
                    {c.efficiencyScore ?? '—'}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                  {c.aiSuggestion ?? '—'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onDetail(c)}>
                      Chi tiết
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onPause(c.id)}>
                          <Pause className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onEnable(c.id)}>
                          <Play className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {canAnalyze && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onOptimize(c.id)}>
                          <Wand2 className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onSendReport}>
                          <Send className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
