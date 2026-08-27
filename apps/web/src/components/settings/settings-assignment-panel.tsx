'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/page-state';
import {
  useAssignmentRules,
  useBranches,
  useDeleteAssignmentRule,
  useLeadSources,
  useUpsertAssignmentRule,
  useUpsertPipelineStage,
  type AssignmentRule,
} from '@/hooks/use-crm';
import { usePipelineStages } from '@/hooks/use-funnel-builder';
import { useAdCampaigns, useEmployees } from '@/hooks/use-queries';
import { useT } from '@/i18n/i18n-provider';

const MODE_OPTIONS: { value: AssignmentRule['mode']; label: string }[] = [
  { value: 'ROUND_ROBIN', label: 'Round Robin' },
  { value: 'LEAST_LOADED', label: 'Least Loaded' },
  { value: 'BRANCH', label: 'Theo chi nhánh' },
  { value: 'EMPLOYEE', label: 'Gán cố định' },
  { value: 'BY_SCORE', label: 'Theo score' },
];

export function SettingsAssignmentPanel() {
  const t = useT();
  const rules = useAssignmentRules();
  const upsert = useUpsertAssignmentRule();
  const remove = useDeleteAssignmentRule();
  const stages = usePipelineStages();
  const saveStage = useUpsertPipelineStage();
  const { data: branches } = useBranches();
  const { data: sourcesData } = useLeadSources();
  const { data: campaignsData } = useAdCampaigns();
  const { data: employeesData } = useEmployees();

  const [form, setForm] = useState<{
    id?: string;
    name: string;
    mode: AssignmentRule['mode'];
    branchId: string;
    leadSourceId: string;
    adCampaignId: string;
    minScore: string;
    maxScore: string;
    employeeIds: string;
    priority: string;
    reassignOnSla: boolean;
    notifyManager: boolean;
  }>({
    name: '',
    mode: 'ROUND_ROBIN',
    branchId: '',
    leadSourceId: '',
    adCampaignId: '',
    minScore: '',
    maxScore: '',
    employeeIds: '',
    priority: '0',
    reassignOnSla: false,
    notifyManager: true,
  });
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slaEdits, setSlaEdits] = useState<Record<string, string>>({});

  const branchList = Array.isArray(branches) ? branches : [];
  const sources = sourcesData?.items ?? [];
  const campaigns = campaignsData?.items ?? [];
  const employees = employeesData?.items ?? [];
  const stageList = stages.data ?? [];

  const list = useMemo(() => rules.data ?? [], [rules.data]);

  function resetForm() {
    setForm({
      name: '',
      mode: 'ROUND_ROBIN',
      branchId: '',
      leadSourceId: '',
      adCampaignId: '',
      minScore: '',
      maxScore: '',
      employeeIds: '',
      priority: '0',
      reassignOnSla: false,
      notifyManager: true,
    });
  }

  function editRule(r: AssignmentRule) {
    setForm({
      id: r.id,
      name: r.name ?? '',
      mode: r.mode,
      branchId: r.branchId ?? '',
      leadSourceId: r.leadSourceId ?? '',
      adCampaignId: r.adCampaignId ?? '',
      minScore: r.minScore != null ? String(r.minScore) : '',
      maxScore: r.maxScore != null ? String(r.maxScore) : '',
      employeeIds: (r.employeeIds ?? []).join(','),
      priority: String(r.priority ?? 0),
      reassignOnSla: r.reassignOnSla,
      notifyManager: r.notifyManager,
    });
  }

  async function onSaveRule() {
    setError(null);
    setInfo(null);
    try {
      await upsert.mutateAsync({
        id: form.id,
        name: form.name || undefined,
        mode: form.mode,
        branchId: form.branchId || null,
        leadSourceId: form.leadSourceId || null,
        adCampaignId: form.adCampaignId || null,
        minScore: form.minScore ? Number(form.minScore) : null,
        maxScore: form.maxScore ? Number(form.maxScore) : null,
        employeeIds: form.employeeIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        priority: Number(form.priority) || 0,
        reassignOnSla: form.reassignOnSla,
        notifyManager: form.notifyManager,
        isActive: true,
      });
      setInfo(form.id ? 'Đã cập nhật rule.' : 'Đã tạo rule phân lead.');
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được rule');
    }
  }

  async function onSaveSla(stageId: string, name: string, code?: string) {
    const raw = slaEdits[stageId];
    const minutes = raw === '' || raw == null ? null : Number(raw);
    setError(null);
    try {
      await saveStage.mutateAsync({
        id: stageId,
        name,
        code,
        slaMinutes: minutes != null && Number.isFinite(minutes) ? minutes : null,
      });
      setInfo(`Đã cập nhật SLA stage “${name}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu SLA');
    }
  }

  if (rules.isLoading || stages.isLoading) return <LoadingState />;
  if (rules.isError) return <ErrorState onRetry={() => void rules.refetch()} />;

  return (
    <div className="grid gap-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rule phân lead</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            Round Robin · Least Loaded · theo chi nhánh / nguồn / campaign / score. Quá SLA có thể
            notify manager và reassign.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Tên rule</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Lead ads score cao"
              />
            </div>
            <div className="space-y-1">
              <Label>Mode</Label>
              <Select
                value={form.mode}
                onValueChange={(v) => setForm((f) => ({ ...f, mode: v as AssignmentRule['mode'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Chi nhánh</Label>
              <Select
                value={form.branchId || 'any'}
                onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === 'any' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Mọi chi nhánh</SelectItem>
                  {branchList.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nguồn lead</Label>
              <Select
                value={form.leadSourceId || 'any'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, leadSourceId: v === 'any' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Mọi nguồn</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Campaign</Label>
              <Select
                value={form.adCampaignId || 'any'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, adCampaignId: v === 'any' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Mọi campaign</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Min score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.minScore}
                  onChange={(e) => setForm((f) => ({ ...f, minScore: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Max score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.maxScore}
                  onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Employee IDs (phẩy, để trống = pool chi nhánh/org)</Label>
              <Input
                value={form.employeeIds}
                onChange={(e) => setForm((f) => ({ ...f, employeeIds: e.target.value }))}
                placeholder={employees.slice(0, 2).map((e) => e.id).join(',') || 'uuid,...'}
              />
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.reassignOnSla}
                  onChange={(e) => setForm((f) => ({ ...f, reassignOnSla: e.target.checked }))}
                />
                Reassign khi quá SLA
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.notifyManager}
                  onChange={(e) => setForm((f) => ({ ...f, notifyManager: e.target.checked }))}
                />
                Notify manager khi SLA
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onSaveRule()} disabled={upsert.isPending}>
              {upsert.isPending ? 'Đang lưu…' : form.id ? 'Cập nhật rule' : 'Tạo rule'}
            </Button>
            {form.id ? (
              <Button type="button" variant="outline" onClick={resetForm}>
                Hủy sửa
              </Button>
            ) : null}
          </div>

          {info ? <p className="text-xs text-emerald-700">{info}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {!list.length ? (
            <EmptyState
              title={t('settingsAssignment.emptyRules')}
              description={t('settingsAssignment.emptyRulesDesc')}
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <div className="font-medium">
                      {r.name || MODE_OPTIONS.find((m) => m.value === r.mode)?.label || r.mode}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.mode}
                      {r.branch ? ` · ${r.branch.name}` : ''}
                      {r.leadSource ? ` · ${r.leadSource.name}` : ''}
                      {r.adCampaign ? ` · ${r.adCampaign.name}` : ''}
                      {r.minScore != null || r.maxScore != null
                        ? ` · score ${r.minScore ?? 0}–${r.maxScore ?? 100}`
                        : ''}
                      {r.reassignOnSla ? ' · reassign SLA' : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => editRule(r)}>
                      Sửa
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void remove.mutateAsync(r.id)}
                      disabled={remove.isPending}
                    >
                      Xóa
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SLA theo FunnelStage (phút)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Mỗi stage có slaMinutes. Quá hạn → overdue → notify sale/manager → tùy chọn reassign.
          </p>
          {!stageList.length ? (
            <p className="text-muted-foreground">{t('settingsAssignment.noPipelineStage')}</p>
          ) : (
            stageList.map((s) => (
              <div key={s.id} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px] flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.code}</div>
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">SLA (phút)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={
                      slaEdits[s.id] ??
                      (s.slaMinutes != null ? String(s.slaMinutes) : '')
                    }
                    onChange={(e) =>
                      setSlaEdits((prev) => ({ ...prev, [s.id]: e.target.value }))
                    }
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void onSaveSla(s.id, s.name, s.code)}
                  disabled={saveStage.isPending}
                >
                  Lưu
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
