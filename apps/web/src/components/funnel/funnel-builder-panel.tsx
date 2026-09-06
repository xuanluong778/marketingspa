'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useApplyFunnelBlueprint,
  useDiscardFunnelBlueprint,
  useFunnelBlueprints,
  useGenerateFunnelBlueprint,
  usePipelineStages,
} from '@/hooks/use-funnel-builder';
import { useFunnelValidationPayload } from '@/hooks/use-funnel-validator';
import type { FunnelBlueprintDraft } from '@/types/funnel';
import { cn } from '@/lib/utils';

const PROMPT_EXAMPLES = [
  'Spa thẩm mỹ: lead Facebook → tư vấn → đặt lịch liệu trình → xác nhận → đến spa → mua gói',
  'Phễu nail salon: tin nhắn Zalo, nhắc lịch 24h, follow-up no-show',
  'Clinic da liễu: qualify lead đủ điều kiện trước khi book bác sĩ',
];

export function FunnelBuilderPanel() {
  const [prompt, setPrompt] = useState('');
  const [industryHint, setIndustryHint] = useState('spa');
  const [includeAutomations, setIncludeAutomations] = useState(true);
  const [activateFlows, setActivateFlows] = useState(false);
  const [draft, setDraft] = useState<FunnelBlueprintDraft | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  const { data: stages } = usePipelineStages();
  const { data: history, refetch: refetchHistory } = useFunnelBlueprints();
  const generate = useGenerateFunnelBlueprint();
  const apply = useApplyFunnelBlueprint();
  const discard = useDiscardFunnelBlueprint();
  const validationQuery = useFunnelValidationPayload(
    draft ? { draft } : null,
    false,
  );
  const validation = validationQuery.data;

  const stagePreview = useMemo(() => draft?.stages ?? [], [draft]);

  async function onGenerate() {
    setError(null);
    setApplyResult(null);
    try {
      const res = await generate.mutateAsync({
        prompt: prompt.trim(),
        industryHint: industryHint.trim() || undefined,
        includeAutomations,
      });
      setDraft(res.draft);
      setBlueprintId(res.id);
      setSource(res.source);
      await refetchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được phễu');
    }
  }

  async function onApply() {
    if (!blueprintId && !draft) return;
    setError(null);
    setApplyResult(null);
    try {
      const res = await apply.mutateAsync({
        blueprintId: blueprintId ?? undefined,
        draft: blueprintId ? undefined : (draft ?? undefined),
        applyStages: true,
        applyFlows: includeAutomations,
        activateFlows,
        deactivateMissingStages: false,
      });
      setApplyResult(
        `Đã áp dụng ${res.stages.length} giai đoạn` +
          (res.flows.length
            ? `, tạo ${res.flows.length} automation flow (nháp${activateFlows ? '/đã bật' : ''})`
            : '') +
          '.',
      );
      setDraft(res.draft);
      setBlueprintId(res.blueprintId);
      await refetchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không áp dụng được phễu');
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mô tả phễu bằng ngôn ngữ tự nhiên</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="funnel-prompt">Yêu cầu</Label>
              <Textarea
                id="funnel-prompt"
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ví dụ: Tạo phễu spa từ lead Messenger, nhắc lịch 24h và follow-up lead chưa gọi..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Ngành (gợi ý)</Label>
              <Input
                id="industry"
                value={industryHint}
                onChange={(e) => setIndustryHint(e.target.value)}
                placeholder="spa / nail / clinic"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAutomations}
                onChange={(e) => setIncludeAutomations(e.target.checked)}
              />
              Sinh kèm automation flows
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activateFlows}
                onChange={(e) => setActivateFlows(e.target.checked)}
              />
              Bật flow ngay khi apply (cần quyền duyệt + Validator ≥60)
            </label>
            {activateFlows && validation && (
              <p
                className={cn(
                  'text-xs',
                  validation.canActivate ? 'text-green-700' : 'text-amber-700',
                )}
              >
                Funnel Score {validation.score}/100
                {validation.canActivate ? ' — sẵn sàng kích hoạt' : ' — chưa đủ điều kiện chạy'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {PROMPT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setPrompt(ex)}
                >
                  {ex.slice(0, 48)}…
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={onGenerate}
                disabled={prompt.trim().length < 8 || generate.isPending}
              >
                {generate.isPending ? 'Đang tạo…' : 'AI tạo phễu'}
              </Button>
              <Button
                variant="secondary"
                onClick={onApply}
                disabled={(!blueprintId && !draft) || apply.isPending}
              >
                {apply.isPending ? 'Đang áp dụng…' : 'Áp dụng vào org'}
              </Button>
            </div>
            {source && (
              <p className="text-xs text-muted-foreground">
                Nguồn draft: <Badge variant="outline">{source}</Badge>
                {blueprintId ? ` · id ${blueprintId.slice(0, 8)}…` : null}
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {applyResult && <p className="text-sm text-green-700">{applyResult}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline hiện tại (org)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stages ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có giai đoạn — sẽ seed mặc định khi apply.
              </p>
            ) : (
              (stages ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: s.color || '#94a3b8' }}
                    />
                    {s.name}
                  </span>
                  <span className="text-muted-foreground">{s.code ?? '—'}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {draft && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview giai đoạn — {draft.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.summary && (
                <p className="text-sm text-muted-foreground">{draft.summary}</p>
              )}
              {stagePreview.map((s) => (
                <div
                  key={s.code}
                  className={cn(
                    'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: s.color || '#94a3b8' }}
                    />
                    {s.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    #{s.position} · {s.code}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Preview automation ({draft.flows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.flows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có flow trong draft.</p>
              ) : (
                draft.flows.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="space-y-1 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{f.name}</span>
                      <Badge variant="outline">{f.triggerType}</Badge>
                    </div>
                    {f.rationale && (
                      <p className="text-xs text-muted-foreground">{f.rationale}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      delay {f.delayMinutes ?? 0}p · {f.actions.length} action(s)
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lịch sử blueprint (org này)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(history ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có blueprint nào.</p>
          ) : (
            (history ?? []).map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{b.prompt}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{b.status}</Badge>
                  {b.status === 'DRAFT' && (
                    <Button size="sm" variant="ghost" onClick={() => discard.mutate(b.id)}>
                      Huỷ
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
