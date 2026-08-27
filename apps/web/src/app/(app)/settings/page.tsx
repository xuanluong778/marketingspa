'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseSettingsTab, type SettingsTab } from '@/config/navigation';
import { SettingsAccountPanel } from '@/components/settings/settings-account-panel';
import { SettingsApiPanel } from '@/components/settings/settings-api-panel';
import { SettingsConnectionsPanel } from '@/components/settings/settings-connections-panel';
import { SettingsLanguagePanel } from '@/components/settings/settings-language-panel';
import { SettingsSystemPanel } from '@/components/settings/settings-system-panel';
import { SettingsAssignmentPanel } from '@/components/settings/settings-assignment-panel';
import { KnowledgeBasePage } from '@/components/knowledge-base/knowledge-base-page';
import { ModuleHubRoute } from '@/components/module-hub/module-hub-route';
import { useT } from '@/i18n/i18n-provider';

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const [tab, setTab] = useState<SettingsTab>(() => parseSettingsTab(rawTab));

  useEffect(() => {
    if (rawTab) setTab(parseSettingsTab(rawTab));
  }, [rawTab]);

  // Module Hub overview when opening /settings without tab
  if (!rawTab) {
    return <ModuleHubRoute hubId="settings" />;
  }

  const onTabChange = (value: string) => {
    const next = parseSettingsTab(value);
    setTab(next);
    router.replace(`/settings?tab=${next}`, { scroll: false });
  };

  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="account">{t('settings.tabs.account')}</TabsTrigger>
          <TabsTrigger value="language">{t('settings.tabs.language')}</TabsTrigger>
          <TabsTrigger value="knowledge">{t('settings.tabs.knowledge')}</TabsTrigger>
          <TabsTrigger value="connections">{t('settings.tabs.connections')}</TabsTrigger>
          <TabsTrigger value="api">{t('settings.tabs.api')}</TabsTrigger>
          <TabsTrigger value="system">{t('settings.tabs.system')}</TabsTrigger>
          <TabsTrigger value="assignment">{t('settings.tabs.assignment')}</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-2">
          <SettingsAccountPanel />
        </TabsContent>

        <TabsContent value="language" className="mt-2">
          <SettingsLanguagePanel />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-2">
          <KnowledgeBasePage />
        </TabsContent>

        <TabsContent value="connections" className="mt-2">
          <SettingsConnectionsPanel />
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
