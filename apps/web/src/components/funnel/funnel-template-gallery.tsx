'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useApplyFunnelTemplate,
  useCloneFunnelTemplate,
  useFunnelTemplate,
  useFunnelTemplates,
  useUpdateFunnelTemplate,
} from '@/hooks/use-funnel-builder';
import type { FunnelTemplateListItem } from '@/types/funnel';
import { cn } from '@/lib/utils';

const CATEGORY_LABEL: Record<string, string> = {
  acquisition: 'Thu hút',
  sales: 'Bán hàng',
  operations: 'Vận hành',
  nurture: 'Nurture',
  promotion: 'Khuyến mãi',
  retention: 'Giữ chân',
  growth: 'Tăng trưởng',
};

export function FunnelTemplateGallery({
  onApplied,
  initialFocus,
}: {
  onApplied?: (summary: string) => void;
  initialFocus?: string | null;
}) {
  const { data, isLoading, refetch } = useFunnelTemplates();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [editName, setEditName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useFunnelTemplate(selectedSlug);
  const clone = useCloneFunnelTemplate();
  const apply = useApplyFunnelTemplate();
  const update = useUpdateFunnelTemplate();

  const items = data?.items ?? [];
  const systemItems = useMemo(() => items.filter((t) => t.isSystem), [items]);
  const orgItems = useMemo(() => items.filter((t) => !t.isSystem), [items]);
  const appliedFocus = useRef(false);

  function selectTemplate(t: FunnelTemplateListItem) {
    setSelectedSlug(t.slug);
    setEditName(t.name);
    setInputValues({});
    setMessage(null);
    setError(null);
  }

  useEffect(() => {
    if (appliedFocus.current || !initialFocus || items.length === 0) return;
    const t = items.find((x) => x.slug === initialFocus || x.id === initialFocus);
    if (!t) return;
    appliedFocus.current = true;
    selectTemplate(t);
  }, [initialFocus, items]);

  async function onClone() {
    if (!selectedSlug) return;
    setError(null);
    try {
      const res = await clone.mutateAsync({
        idOrSlug: selectedSlug,
        name: editName || undefined,
        inputValues,
      });
      setMessage(`Đã clone về org: ${res.name}`);
      setSelectedSlug(res.id);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clone thất bại');
    }
  }

  async function onApply() {
    if (!selectedSlug) return;
    setError(null);
    try {
      const res = await apply.mutateAsync({
        idOrSlug: selectedSlug,
        inputValues,
        pipelineName: editName || undefined,
        applyStages: true,
        applyFlows: true,
        activateFlows: false,
      });
      const summary = `Áp dụng ${res.templateSlug}: ${res.stages.length} stage, ${res.flows.length} flow`;
      setMessage(summary);
      onApplied?.(summary);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply thất bại');
    }
  }

  async function onSaveOrgEdits() {
    const t = detail.data;
    if (!t?.canEdit) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: t.id,
        name: editName || t.name,
        description: t.description ?? undefined,
      });
      setMessage('Đã lưu chỉnh sửa template org');
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại');
    }
  }

  const selected = detail.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Template hệ thống (10)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
            {systemItems.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t)}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  selectedSlug === t.slug || selectedSlug === t.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="outline">
                    {CATEGORY_LABEL[t.category ?? ''] ?? t.category ?? '—'}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {t.description}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Template của tổ chức</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orgItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa clone template nào. Chọn template hệ thống → Clone.
              </p>
            ) : (
              orgItems.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t)}
                  className={cn(
                    'w-full rounded-md border px-3 py-2 text-left text-sm',
                    selectedSlug === t.id || selectedSlug === t.slug
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="secondary">v{t.version}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.slug}</p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Chi tiết — {selected.name}
              {selected.isSystem ? (
                <Badge className="ml-2" variant="outline">
                  System
                </Badge>
              ) : (
                <Badge className="ml-2" variant="secondary">
                  Org clone
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{selected.description}</p>
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Goal: {selected.goal?.label}</div>
              <div className="text-xs text-muted-foreground">
                {selected.goal?.code}
                {selected.goal?.primaryMetric ? ` · metric ${selected.goal.primaryMetric}` : ''}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-muted-foreground">Nodes</div>
                <div className="text-lg font-semibold">{selected.nodes?.length ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Connections</div>
                <div className="text-lg font-semibold">{selected.connections?.length ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Automations</div>
                <div className="text-lg font-semibold">
                  {selected.recommendedAutomation?.length ?? 0}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tên khi clone / apply</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            {(selected.requiredInputs ?? []).length > 0 && (
              <div className="space-y-3">
                <Label>Required inputs</Label>
                {selected.requiredInputs.map((input) => (
                  <div key={input.key} className="space-y-1">
                    <Label className="text-xs">
                      {input.label}
                      {input.required ? ' *' : ''}
                    </Label>
                    <Input
                      placeholder={input.placeholder ?? input.key}
                      value={inputValues[input.key] ?? ''}
                      onChange={(e) =>
                        setInputValues((prev) => ({ ...prev, [input.key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">Nodes preview</div>
              <div className="flex flex-wrap gap-2">
                {(selected.nodes ?? []).map((n) => (
                  <Badge key={n.id} variant="outline">
                    {n.type}: {n.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={onClone}
                disabled={clone.isPending}
              >
                {clone.isPending ? 'Đang clone…' : 'Clone về org'}
              </Button>
              <Button onClick={onApply} disabled={apply.isPending}>
                {apply.isPending ? 'Đang áp dụng…' : 'Apply vào pipeline'}
              </Button>
              {selected.canEdit && (
                <Button variant="outline" onClick={onSaveOrgEdits} disabled={update.isPending}>
                  Lưu chỉnh sửa
                </Button>
              )}
            </div>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
