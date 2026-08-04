'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useAdminUsage } from '@/hooks/use-platform-admin';
import { formatCurrency } from '@/lib/format';

type UsageRow = {
  organizationId: string;
  organization: { name: string; slug: string; email: string | null; isActive: boolean };
  month: string;
  usage: {
    ai: { replies: number; reports: number; chatbotCredits: number };
    posts: number;
    images: number;
    chatbot: { aiReplies: number; creditsUsed: number };
    leads: number;
    ads: { spend: number };
    cost: { creditDebits: number; creditBalance: number; adsSpend: number };
  };
};

export default function AdminUsagePage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminUsage({ q, page, pageSize: 20 });

  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  const items = (list.data?.items ?? []) as UsageRow[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Mức sử dụng theo tổ chức</h2>
        <p className="text-sm text-muted-foreground">
          AI, bài viết, ảnh, chatbot, lead, quảng cáo và chi phí — không lộ secret.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 rounded-md border bg-background px-3 text-sm"
          placeholder="Tìm spa / email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
          Làm mới
        </Button>
      </div>

      {!items.length ? (
        <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Tổ chức</th>
                <th className="px-3 py-2 text-right">AI replies</th>
                <th className="px-3 py-2 text-right">Bài viết</th>
                <th className="px-3 py-2 text-right">Ảnh</th>
                <th className="px-3 py-2 text-right">Chatbot</th>
                <th className="px-3 py-2 text-right">Leads</th>
                <th className="px-3 py-2 text-right">Ads spend</th>
                <th className="px-3 py-2 text-right">Credit debit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.organizationId} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.organization.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.organization.email} · {row.month}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{row.usage.ai.replies}</td>
                  <td className="px-3 py-2 text-right">{row.usage.posts}</td>
                  <td className="px-3 py-2 text-right">{row.usage.images}</td>
                  <td className="px-3 py-2 text-right">{row.usage.chatbot.aiReplies}</td>
                  <td className="px-3 py-2 text-right">{row.usage.leads}</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(row.usage.ads.spend)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.usage.cost.creditDebits}
                    <div className="text-[10px] text-muted-foreground">
                      bal {row.usage.cost.creditBalance}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 border-t px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Trước
            </Button>
            <span className="text-xs text-muted-foreground">
              {page}/{list.data?.totalPages ?? 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= (list.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
