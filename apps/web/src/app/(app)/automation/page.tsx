'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { TemplateFormDialog } from '@/components/automation/template-form-dialog';
import { FlowFormDialog } from '@/components/automation/flow-form-dialog';
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

function channelLabel(v?: string | null) {
  return CHANNEL_OPTIONS.find((c) => c.value === v)?.label ?? v ?? '—';
}

function triggerLabel(v?: string) {
  return TRIGGER_OPTIONS.find((t) => t.value === v)?.label ?? v ?? '—';
}

export default function AutomationPage() {
  const [templateForm, setTemplateForm] = useState<MessageTemplateDetail | null | 'new'>(null);
  const [flowForm, setFlowForm] = useState<AutomationFlowDetail | null | 'new'>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);

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
        title="Tin nhắn tự động"
        description="Mẫu tin, automation flow và nhật ký gửi (MVP placeholder)"
      />

      <Tabs defaultValue="templates">
        <TabsList className="mb-4">
          <TabsTrigger value="templates">Mẫu tin</TabsTrigger>
          <TabsTrigger value="flows">Automation Flow</TabsTrigger>
          <TabsTrigger value="logs">Nhật ký</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setTemplateForm('new')}>
              <Plus className="h-4 w-4 mr-2" />
              Tạo mẫu tin
            </Button>
          </div>
          {templates.isLoading && <LoadingState />}
          {templates.isError && <ErrorState onRetry={templates.refetch} />}
          {!templates.isLoading && !templates.isError && templateItems.length === 0 && (
            <EmptyState title="Chưa có mẫu tin nhắn" />
          )}
          {!templates.isLoading && !templates.isError && templateItems.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {templateItems.map((t) => (
                <div key={t.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline">{channelLabel(t.channel)}</Badge>
                        {!t.isActive && <Badge variant="secondary">Tắt</Badge>}
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
                  <p className="text-sm text-muted-foreground line-clamp-3">{t.body}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="flows">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setFlowForm('new')}>
              <Plus className="h-4 w-4 mr-2" />
              Tạo flow
            </Button>
          </div>
          {flows.isLoading && <LoadingState />}
          {flows.isError && <ErrorState onRetry={flows.refetch} />}
          {!flows.isLoading && !flows.isError && flowItems.length === 0 && (
            <EmptyState title="Chưa có automation flow" />
          )}
          {!flows.isLoading && !flows.isError && flowItems.length > 0 && (
            <div className="space-y-3">
              {flowItems.map((f) => (
                <div key={f.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">{f.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Trigger: {triggerLabel(f.triggerType)} · Kênh:{' '}
                        {channelLabel(f.channel ?? f.messageTemplate?.channel)} · Delay:{' '}
                        {f.delayMinutes} phút
                      </p>
                      <p className="text-sm">
                        Mẫu: {f.messageTemplate?.name ?? '—'}{' '}
                        {!f.isActive && <Badge variant="secondary">Tắt</Badge>}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
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
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Giả lập
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

        <TabsContent value="logs">
          <DataTable
            data={logItems as AutomationLogDetail[]}
            isLoading={logs.isLoading}
            isError={logs.isError}
            onRetry={logs.refetch}
            emptyTitle="Chưa có nhật ký gửi"
            getRowKey={(r) => r.id}
            columns={[
              {
                key: 'customer',
                header: 'Khách hàng',
                cell: (r) => r.customer?.name ?? r.lead?.name ?? '—',
              },
              { key: 'channel', header: 'Kênh', cell: (r) => channelLabel(r.channel) },
              {
                key: 'content',
                header: 'Nội dung',
                cell: (r) => (
                  <span className="line-clamp-2 max-w-[280px] text-sm">
                    {r.renderedContent ?? '—'}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Trạng thái',
                cell: (r) => <StatusBadge status={LOG_STATUS_LABELS[r.status] ?? r.status} />,
              },
              {
                key: 'time',
                header: 'Thời gian',
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
            updateFlow.mutate({ id: flowForm.id, ...data }, { onSuccess: () => setFlowForm(null) });
          } else {
            createFlow.mutate(data, { onSuccess: () => setFlowForm(null) });
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteTemplateId}
        onOpenChange={(o) => !o && setDeleteTemplateId(null)}
        title="Ẩn mẫu tin?"
        description="Mẫu tin sẽ được đánh dấu không hoạt động."
        confirmLabel="Xóa"
        destructive
        isPending={deleteTemplate.isPending}
        onConfirm={() =>
          deleteTemplateId &&
          deleteTemplate.mutate(deleteTemplateId, { onSuccess: () => setDeleteTemplateId(null) })
        }
      />

      <ConfirmDialog
        open={!!deleteFlowId}
        onOpenChange={(o) => !o && setDeleteFlowId(null)}
        title="Tắt flow?"
        description="Flow sẽ được đánh dấu không hoạt động."
        confirmLabel="Tắt"
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
