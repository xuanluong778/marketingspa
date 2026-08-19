'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseSettingsTab, type SettingsTab } from '@/config/navigation';
import { SettingsAccountPanel } from '@/components/settings/settings-account-panel';
import { SettingsApiPanel } from '@/components/settings/settings-api-panel';
import { SettingsSystemPanel } from '@/components/settings/settings-system-panel';
import { SettingsAssignmentPanel } from '@/components/settings/settings-assignment-panel';
import { KnowledgeBasePage } from '@/components/knowledge-base/knowledge-base-page';

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => parseSettingsTab(searchParams.get('tab')));

  useEffect(() => {
    setTab(parseSettingsTab(searchParams.get('tab')));
  }, [searchParams]);

  const onTabChange = (value: string) => {
    const next = parseSettingsTab(value);
    setTab(next);
    router.replace(`/settings?tab=${next}`, { scroll: false });
  };

  return (
    <div>
      <PageHeader
        title="Cài đặt"
        description="Tài khoản, kho kiến thức AI, API và hệ thống tổ chức"
      />

      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="knowledge">AI Knowledge Base</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="assignment">Phân lead & SLA</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-2">
          <SettingsAccountPanel />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-2">
          <KnowledgeBasePage />
        </TabsContent>

        <TabsContent value="api" className="mt-2">
          <SettingsApiPanel />
        </TabsContent>

        <TabsContent value="system" className="mt-2">
          <SettingsSystemPanel />
        </TabsContent>
        <TabsContent value="assignment" className="mt-2">
          <SettingsAssignmentPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
