'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IntegrationsPanel } from '@/components/settings/integrations-panel';
import { ContentIndustriesAdminPanel } from '@/components/settings/content-industries-admin-panel';
import { KnowledgeBasePage } from '@/components/knowledge-base/knowledge-base-page';
import { useOrganization } from '@/hooks/use-queries';
import { useCurrentUser } from '@/hooks/use-auth';

type SettingsTab = 'general' | 'knowledge-base' | 'integrations' | 'content-industries';

function parseTab(raw: string | null): SettingsTab {
  if (raw === 'knowledge-base' || raw === 'kb') return 'knowledge-base';
  if (raw === 'integrations') return 'integrations';
  if (raw === 'content-industries') return 'content-industries';
  return 'general';
}

export default function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => parseTab(searchParams.get('tab')));

  const { data: org, isLoading, isError, refetch } = useOrganization();
  const { data: user } = useCurrentUser();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    setTab(parseTab(searchParams.get('tab')));
  }, [searchParams]);

  const onTabChange = (value: string) => {
    const next = parseTab(value);
    setTab(next);
    const qs = next === 'general' ? '/settings' : `/settings?tab=${next}`;
    router.replace(qs, { scroll: false });
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div>
      <PageHeader title="Cài đặt" description="Thông tin doanh nghiệp, kho kiến thức và kết nối dịch vụ" />

      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="general">Chung</TabsTrigger>
          <TabsTrigger value="knowledge-base">Kho kiến thức</TabsTrigger>
          <TabsTrigger value="integrations">Kết nối dịch vụ</TabsTrigger>
          {isSuperAdmin ? (
            <TabsTrigger value="content-industries">Ngành Content Studio</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="general" className="space-y-6 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Doanh nghiệp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tên</span>
                <span className="font-medium">{org?.name ?? '—'}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mã tổ chức</span>
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
        </TabsContent>

        <TabsContent value="knowledge-base" className="mt-2">
          <KnowledgeBasePage />
        </TabsContent>

        <TabsContent value="integrations" className="max-w-4xl">
          <h2 className="text-lg font-semibold mb-3">Kết nối dịch vụ marketing</h2>
          <IntegrationsPanel />
        </TabsContent>

        {isSuperAdmin ? (
          <TabsContent value="content-industries" className="max-w-5xl">
            <ContentIndustriesAdminPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
