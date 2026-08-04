'use client';

import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { IntegrationsPanel } from '@/components/settings/integrations-panel';
import { useOrganization } from '@/hooks/use-queries';
import { useCurrentUser } from '@/hooks/use-auth';

export default function SettingsPage() {
  const { data: org, isLoading, isError, refetch } = useOrganization();
  const { data: user } = useCurrentUser();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div>
      <PageHeader title="Cài đặt" description="Thông tin spa, tài khoản và tích hợp marketing" />
      <div className="grid gap-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spa / Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tên</span>
              <span className="font-medium">{org?.name ?? '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Slug</span>
              <span className="font-medium">{org?.slug ?? '—'}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tài khoản</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Họ tên</span>
              <span className="font-medium">{user?.name ?? '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email ?? '—'}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vai trò</span>
              <span className="font-medium">{user?.roleName ?? '—'}</span>
            </div>
          </CardContent>
        </Card>
        <div>
          <h2 className="text-lg font-semibold mb-3">Tích hợp Marketing API</h2>
          <IntegrationsPanel />
        </div>
      </div>
    </div>
  );
}
