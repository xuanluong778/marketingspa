'use client';

import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAdCampaigns } from '@/hooks/use-queries';

export default function AdsPage() {
  const { data, isLoading, isError, refetch } = useAdCampaigns();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const campaigns = data?.items ?? [];

  return (
    <div>
      <PageHeader title="Chiến dịch Ads" description="Quản lý chiến dịch quảng cáo" />
      {campaigns.length === 0 ? (
        <EmptyState title="Chưa có chiến dịch ads" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{c.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                {c.platform && <Badge variant="secondary">{c.platform}</Badge>}
                {c.status && <Badge variant="outline">{c.status}</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
