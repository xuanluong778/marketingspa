'use client';

import { useMemo, useState } from 'react';
import { Play, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import {
  useEmailAutomations,
  useEmailAutomationRecipes,
  useEmailTemplates,
  useEmailLists,
  useEmailCrmStages,
  useCreateEmailAutomationFromRecipe,
  useUpdateEmailAutomation,
  useDeleteEmailAutomation,
  useRunEmailAutomation,
} from '@/hooks/use-email-marketing';
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_TRIGGER_LABELS,
  type EmailAutomation,
  type EmailAutomationRecipe,
  type EmailAutomationStatus,
} from '@/types/email-marketing';

type RecipeDraft = {
  templateId: string;
  listId: string;
  waitDays: string;
  scoreDelta: string;
  targetStage: string;
};

function presetTemplates(templates: { id: string; name: string; category?: string | null }[]) {
  return templates.filter((t) => t.category?.startsWith('preset:'));
}

export function EmailAutomationsTab() {
  const automations = useEmailAutomations();
  const recipes = useEmailAutomationRecipes();
  const templates = useEmailTemplates({ pageSize: '50' });
  const lists = useEmailLists({ pageSize: '50' });
  const crmStages = useEmailCrmStages();
  const activateRecipe = useCreateEmailAutomationFromRecipe();
  const update = useUpdateEmailAutomation();
  const remove = useDeleteEmailAutomation();
  const run = useRunEmailAutomation();

  const [drafts, setDrafts] = useState<Record<string, RecipeDraft>>({});

  const activeByRecipe = useMemo(() => {
    const map = new Map<string, EmailAutomation>();
    for (const row of automations.data ?? []) {
      if (row.recipeId) map.set(row.recipeId, row);
    }
    return map;
  }, [automations.data]);

  const customAutomations = useMemo(
    () => (automations.data ?? []).filter((a) => !a.recipeId),
    [automations.data],
  );

  const presetList = presetTemplates(templates.data?.items ?? []);

  function getDraft(recipe: EmailAutomationRecipe): RecipeDraft {
    const existing = activeByRecipe.get(recipe.id);
    return (
      drafts[recipe.id] ?? {
        templateId: existing?.templateId ?? '',
        listId: existing?.listId ?? '',
        waitDays: String(existing?.waitDays ?? recipe.defaultWaitDays),
        scoreDelta: String(existing?.scoreDelta ?? recipe.defaultScoreDelta),
        targetStage: existing?.targetStage ?? recipe.defaultStage,
      }
    );
  }

  function patchDraft(recipeId: string, patch: Partial<RecipeDraft>) {
    const recipe = recipes.data?.find((r) => r.id === recipeId);
    if (!recipe) return;
    setDrafts((prev) => ({
      ...prev,
      [recipeId]: { ...getDraft(recipe), ...patch },
    }));
  }

  function activate(recipe: EmailAutomationRecipe) {
    const draft = getDraft(recipe);
    activateRecipe.mutate({
      recipeId: recipe.id,
      templateId: draft.templateId || undefined,
      listId: draft.listId || undefined,
      waitDays: recipe.needsWaitDays ? Number(draft.waitDays) || recipe.defaultWaitDays : undefined,
      scoreDelta: recipe.needsScore ? Number(draft.scoreDelta) || recipe.defaultScoreDelta : undefined,
      targetStage: recipe.needsStage ? draft.targetStage || recipe.defaultStage : undefined,
      activate: true,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Công thức sẵn có</h3>
        <p className="text-sm text-muted-foreground">
          Chọn mẫu → Chọn nhóm khách → Bật Automation. Hệ thống tự kết nối CRM, Funnel và Email.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(recipes.data ?? []).map((recipe) => {
          const active = activeByRecipe.get(recipe.id);
          const draft = getDraft(recipe);
          return (
            <Card key={recipe.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{recipe.name}</CardTitle>
                    <CardDescription className="mt-1">{recipe.description}</CardDescription>
                  </div>
                  {active?.status === 'ACTIVE' ? (
                    <Badge variant="default">Đang bật</Badge>
                  ) : active ? (
                    <Badge variant="secondary">Tạm dừng</Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1 pt-2 text-xs text-muted-foreground">
                  <span>Khi: {recipe.when}</span>
                  <span>→</span>
                  <span>{recipe.then}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {recipe.needsTemplate && (
                  <div className="space-y-1">
                    <Label>Mẫu email</Label>
                    <Select
                      value={draft.templateId || '__none__'}
                      onValueChange={(v) =>
                        patchDraft(recipe.id, { templateId: v === '__none__' ? '' : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn mẫu" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Chọn mẫu —</SelectItem>
                        {presetList.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                        {(templates.data?.items ?? [])
                          .filter((t) => !t.category?.startsWith('preset:') && t.category !== 'campaign')
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {recipe.needsList && (
                  <div className="space-y-1">
                    <Label>Nhóm khách</Label>
                    <Select
                      value={draft.listId || '__none__'}
                      onValueChange={(v) =>
                        patchDraft(recipe.id, { listId: v === '__none__' ? '' : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn danh sách" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Chọn danh sách —</SelectItem>
                        {(lists.data?.items ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {recipe.needsWaitDays && (
                  <div className="space-y-1">
                    <Label>Chờ (ngày)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.waitDays}
                      onChange={(e) => patchDraft(recipe.id, { waitDays: e.target.value })}
                    />
                  </div>
                )}

                {recipe.needsScore && (
                  <div className="space-y-1">
                    <Label>Cộng điểm</Label>
                    <Input
                      type="number"
                      value={draft.scoreDelta}
                      onChange={(e) => patchDraft(recipe.id, { scoreDelta: e.target.value })}
                    />
                  </div>
                )}

                {recipe.needsStage && (
                  <div className="space-y-1">
                    <Label>Giai đoạn CRM</Label>
                    <Select
                      value={draft.targetStage || '__none__'}
                      onValueChange={(v) =>
                        patchDraft(recipe.id, { targetStage: v === '__none__' ? '' : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(crmStages.data ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.code}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  {active?.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        update.mutate({ id: active.id, status: 'PAUSED' as EmailAutomationStatus })
                      }
                    >
                      Tắt
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={activateRecipe.isPending}
                      onClick={() => activate(recipe)}
                    >
                      <Zap className="mr-1 h-4 w-4" /> Bật Automation
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {customAutomations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Tùy chỉnh khác</h3>
          <DataTable
            getRowKey={(r) => r.id}
            data={customAutomations}
            isLoading={automations.isLoading}
            isError={automations.isError}
            onRetry={() => automations.refetch()}
            emptyTitle="Không có tự động hóa tùy chỉnh"
            columns={[
              { key: 'name', header: 'Tên', cell: (r) => r.name },
              {
                key: 'trigger',
                header: 'Trigger',
                cell: (r) => AUTOMATION_TRIGGER_LABELS[r.trigger],
              },
              {
                key: 'action',
                header: 'Hành động',
                cell: (r) => AUTOMATION_ACTION_LABELS[r.action ?? 'SEND_EMAIL'],
              },
              { key: 'template', header: 'Mẫu', cell: (r) => r.template?.name || '—' },
              { key: 'status', header: 'TT', cell: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions',
                header: '',
                cell: (r) => (
                  <div className="flex gap-1">
                    {r.status !== 'ACTIVE' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          update.mutate({ id: r.id, status: 'ACTIVE' as EmailAutomationStatus })
                        }
                      >
                        Bật
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          update.mutate({ id: r.id, status: 'PAUSED' as EmailAutomationStatus })
                        }
                      >
                        Tắt
                      </Button>
                    )}
                    {r.trigger === 'SCHEDULED' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Chạy ngay"
                        onClick={() => run.mutate(r.id)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
