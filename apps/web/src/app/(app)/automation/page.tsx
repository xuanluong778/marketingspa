'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Pencil, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { TemplateFormDialog } from '@/components/automation/template-form-dialog';
import { FlowFormDialog } from '@/components/automation/flow-form-dialog';
import { ChannelConnectionsPanel } from '@/components/automation/channel-connections-panel';
import { AudiencePanel } from '@/components/automation/audience-panel';
import {
  BulkCampaignPanel,
  type BulkCampaignPrefill,
} from '@/components/automation/bulk-campaign-panel';
import { MessagingPolicyPanel } from '@/components/automation/messaging-policy-panel';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import {
  useAutomationTemplates,
  useAutomationFlows,
  useAutomationLogs,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useCreateFlow,
  useUpdateFlow,
  useDeleteFlow,
  useSimulateFlow,
} from '@/hooks/use-automation';
import {
  CHANNEL_OPTIONS,
  TRIGGER_OPTIONS,
  LOG_STATUS_LABELS,
  type MessageTemplateDetail,
  type AutomationFlowDetail,
  type AutomationLogDetail,
} from '@/types/automation-messaging';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';

function channelLabel(v?: string | null) {
  return CHANNEL_OPTIONS.find((c) => c.value === v)?.label ?? v ?? '—';
}

function triggerLabel(v?: string) {
  return TRIGGER_OPTIONS.find((t) => t.value === v)?.label ?? v ?? '—';
}

const TAB_VALUES = ['audience', 'templates', 'campaigns', 'flows', 'logs', 'channels'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function AutomationPageInner() {
  const tr = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const initialTab: TabValue =
    tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)
      ? (tabParam as TabValue)
      : 'campaigns';

  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const [campaignPrefill, setCampaignPrefill] = useState<BulkCampaignPrefill | null>(null);
  const [templateForm, setTemplateForm] = useState<MessageTemplateDetail | null | 'new'>(null);
  const [flowForm, setFlowForm] = useState<AutomationFlowDetail | null | 'new'>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);

  useEffect(() => {
    if (tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)) {
      setActiveTab(tabParam as TabValue);
      return;
    }
    // Không có ?tab= → mặc định campaigns; vẫn đồng bộ URL để sidebar active đúng
    setActiveTab('campaigns');
    if (!tabParam) {
      router.replace('/automation?tab=campaigns', { scroll: false });
    }
  }, [tabParam, router]);

  function changeTab(v: string) {
    const next = (TAB_VALUES as readonly string[]).includes(v) ? (v as TabValue) : 'campaigns';
    setActiveTab(next);
    router.replace(`/automation?tab=${next}`, { scroll: false });
  }

  const templates = useAutomationTemplates({ pageSize: '50' });
  const flows = useAutomationFlows();
  const logs = useAutomationLogs({ pageSize: '50' });

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const createFlow = useCreateFlow();
  const updateFlow = useUpdateFlow();
  const deleteFlow = useDeleteFlow();
  const simulateFlow = useSimulateFlow();

  const templateItems = templates.data?.items ?? [];
  const flowItems = flows.data ?? [];
  const logItems = logs.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title={tr('automation.pageTitle')}
        description={tr('automation.pageDescription')}
      />

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
          <TabsTrigger value="campaigns">{tr('automation.tabs.campaigns')}</TabsTrigger>
          <TabsTrigger value="audience">{tr('automation.tabs.audience')}</TabsTrigger>
          <TabsTrigger value="templates">{tr('automation.tabs.templates')}</TabsTrigger>
          <TabsTrigger value="flows">{tr('automation.tabs.flows')}</TabsTrigger>
          <TabsTrigger value="logs">{tr('automation.tabs.logs')}</TabsTrigger>
          <TabsTrigger value="channels">{tr('automation.tabs.channels')}</TabsTrigger>
        </TabsList>

        <TabsContent value="audience">
          <AudiencePanel
            onCreateBulkCampaign={(prefill) => {
              setCampaignPrefill(prefill);
              changeTab('campaigns');
            }}
          />
        </TabsContent>

        <TabsContent value="templates">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setTemplateForm('new')}>
              <Plus className="mr-2 h-4 w-4" />
              {tr('automation.createTemplate')}
            </Button>
          </div>
          {templates.isLoading && <LoadingState />}
          {templates.isError && <ErrorState onRetry={templates.refetch} />}
          {!templates.isLoading && !templates.isError && templateItems.length === 0 && (
            <EmptyState title={tr('automation.emptyTemplates')} />
          )}
          {!templates.isLoading && !templates.isError && templateItems.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {templateItems.map((t) => (
                <div key={t.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <div className="mt-1 flex gap-1">
                        <Badge variant="outline">{channelLabel(t.channel)}</Badge>
                        {!t.isActive && <Badge variant="secondary">{tr('status.disabled')}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTemplateForm(t)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteTemplateId(t.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{t.body}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="campaigns">
          <BulkCampaignPanel
            prefill={campaignPrefill}
            onPrefillConsumed={() => setCampaignPrefill(null)}
          />
        </TabsContent>

        <TabsContent value="flows">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setFlowForm('new')}>
              <Plus className="mr-2 h-4 w-4" />
              {tr('automation.createFlow')}
            </Button>
          </div>
          {flows.isLoading && <LoadingState />}
          {flows.isError && <ErrorState onRetry={flows.refetch} />}
          {!flows.isLoading && !flows.isError && flowItems.length === 0 && (
            <EmptyState title={tr('automation.emptyFlows')} />
          )}
          {!flows.isLoading && !flows.isError && flowItems.length > 0 && (
            <div className="space-y-3">
              {flowItems.map((f) => (
                <div key={f.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">{f.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Funnel:{' '}
                        {f.funnel?.selectedSlug ||
                          f.funnel?.prompt?.slice(0, 40) ||
                          (f.funnelId ? f.funnelId.slice(0, 8) : 'Toàn tổ chức')}{' '}
                        · Trigger: {triggerLabel(f.triggerType)} · Kênh:{' '}
                        {channelLabel(f.channel ?? f.messageTemplate?.channel)} · Delay:{' '}
                        {f.delayMinutes} phút
                      </p>
                      <p className="text-sm">
                        Mẫu: {f.messageTemplate?.name ?? '—'}{' '}
                        {!f.isActive && <Badge variant="secondary">{tr('status.disabled')}</Badge>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={simulatingId === f.id}
                        onClick={() => {
                          setSimulatingId(f.id);
                          simulateFlow.mutate(
                            { id: f.id },
                            { onSettled: () => setSimulatingId(null) },
                          );
                        }}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" />
                        {tr('automation.simulate')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setFlowForm(f)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteFlowId(f.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="channels">
          <div className="space-y-6">
            <ChannelConnectionsPanel />
            <MessagingPolicyPanel />
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <DataTable
            data={logItems as AutomationLogDetail[]}
            isLoading={logs.isLoading}
            isError={logs.isError}
            onRetry={logs.refetch}
            emptyTitle={tr('automation.emptyLogs')}
            getRowKey={(r) => r.id}
            columns={[
              {
                key: 'customer',
                header: tr('automation.logs.customer'),
                cell: (r) => r.customer?.name ?? r.lead?.name ?? '—',
              },
              { key: 'channel', header: tr('automation.logs.channel'), cell: (r) => channelLabel(r.channel) },
              {
                key: 'content',
                header: tr('automation.logs.content'),
                cell: (r) => (
                  <span className="line-clamp-2 max-w-[280px] text-sm">
                    {r.renderedContent ?? '—'}
                  </span>
                ),
              },
              {
                key: 'status',
                header: tr('automation.logs.status'),
                cell: (r) => <StatusBadge status={LOG_STATUS_LABELS[r.status] ?? r.status} />,
              },
              {
                key: 'time',
                header: tr('automation.logs.time'),
                cell: (r) => formatDateTime(r.executedAt ?? r.createdAt),
              },
            ]}
          />
        </TabsContent>
      </Tabs>

      <TemplateFormDialog
        open={templateForm !== null}
        onOpenChange={(o) => !o && setTemplateForm(null)}
        initial={templateForm && templateForm !== 'new' ? templateForm : undefined}
        isPending={createTemplate.isPending || updateTemplate.isPending}
        onSubmit={(data) => {
          if (templateForm && templateForm !== 'new') {
            updateTemplate.mutate(
              { id: templateForm.id, ...data },
              { onSuccess: () => setTemplateForm(null) },
            );
          } else {
            createTemplate.mutate(data, { onSuccess: () => setTemplateForm(null) });
          }
        }}
      />

      <FlowFormDialog
        open={flowForm !== null}
        onOpenChange={(o) => !o && setFlowForm(null)}
        initial={flowForm && flowForm !== 'new' ? flowForm : undefined}
        templates={templateItems}
        isPending={createFlow.isPending || updateFlow.isPending}
        onSubmit={(data) => {
          if (flowForm && flowForm !== 'new') {
            updateFlow.mutate(
              { id: flowForm.id, ...data },
              { onSuccess: () => setFlowForm(null) },
            );
          } else {
            createFlow.mutate(data, { onSuccess: () => setFlowForm(null) });
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteTemplateId}
        onOpenChange={(o) => !o && setDeleteTemplateId(null)}
        title={tr('automation.hideTemplateTitle')}
        description={tr('automation.hideTemplateDesc')}
        confirmLabel={tr('common.delete')}
        destructive
        isPending={deleteTemplate.isPending}
        onConfirm={() =>
          deleteTemplateId &&
          deleteTemplate.mutate(deleteTemplateId, {
            onSuccess: () => setDeleteTemplateId(null),
          })
        }
      />

      <ConfirmDialog
        open={!!deleteFlowId}
        onOpenChange={(o) => !o && setDeleteFlowId(null)}
        title={tr('automation.disableFlowTitle')}
        description={tr('automation.disableFlowDesc')}
        confirmLabel={tr('automation.disable')}
        destructive
        isPending={deleteFlow.isPending}
        onConfirm={() =>
          deleteFlowId &&
          deleteFlow.mutate(deleteFlowId, { onSuccess: () => setDeleteFlowId(null) })
        }
      />
    </div>
  );
}

export default function AutomationPage() {
  const tr = useT();
  return (
    <Suspense fallback={<LoadingState message={tr('automation.loading')} />}>
      <AutomationPageInner />
    </Suspense>
  );
}
