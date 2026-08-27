'use client';

import { useEffect, useMemo, useState } from 'react';
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
  useApplyFunnelScoringProposal,
  useFunnelRecommendations,
  useFunnelScoring,
  usePipelineStages,
  useProposeFunnelScoring,
  useSaveFunnelScoring,
  type FunnelScoringRule,
} from '@/hooks/use-funnel-builder';
import { useT } from '@/i18n/i18n-provider';

const EVENT_LABEL: Record<string, string> = {
  FORM_SUBMITTED: 'Submit form',
  CHATBOT_REPLY: 'Reply chatbot',
  ASK_PRICE: 'Hỏi giá',
  CTA_CLICK: 'Click CTA',
  BOOKING_CREATED: 'Booking',
  NO_REPLY: 'Không phản hồi',
  APPOINTMENT_CANCELLED: 'Hủy lịch',
};

export function FunnelScoringPanel({ recommendationId }: { recommendationId?: string }) {
  const t = useT();
  const recs = useFunnelRecommendations();
  const stages = usePipelineStages();
  const [funnelId, setFunnelId] = useState(recommendationId ?? '');
  const scoring = useFunnelScoring(funnelId || null);
  const propose = useProposeFunnelScoring();
  const applyAi = useApplyFunnelScoringProposal();
  const save = useSaveFunnelScoring();

  const [mql, setMql] = useState(50);
  const [sql, setSql] = useState(80);
  const [maxScore, setMaxScore] = useState(100);
  const [mqlStageId, setMqlStageId] = useState('');
  const [sqlStageId, setSqlStageId] = useState('');
  const [rules, setRules] = useState<FunnelScoringRule[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = recs.data ?? [];
  useEffect(() => {
    if (recommendationId) {
      setFunnelId(recommendationId);
      return;
    }
    if (!funnelId && list[0]) setFunnelId(list[0].id);
  }, [funnelId, list, recommendationId]);

  useEffect(() => {
    const cfg = scoring.data;
    if (!cfg) {
      setMql(50);
      setSql(80);
      setMaxScore(100);
      setMqlStageId('');
      setSqlStageId('');
      setRules([]);
      return;
    }
    setMql(cfg.mqlThreshold);
    setSql(cfg.sqlThreshold);
    setMaxScore(cfg.maxScore);
    setMqlStageId(cfg.mqlStageId ?? '');
    setSqlStageId(cfg.sqlStageId ?? '');
    setRules(cfg.rules ?? []);
  }, [scoring.data, funnelId]);

  const stageOptions = useMemo(() => stages.data ?? [], [stages.data]);

  async function onPropose() {
    if (!funnelId) return;
    setError(null);
    setInfo(null);
    try {
      const p = await propose.mutateAsync(funnelId);
      setMql(p.mqlThreshold);
      setSql(p.sqlThreshold);
      setMaxScore(p.maxScore);
      setRules(p.rules);
      setInfo(p.rationale);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đề xuất được');
    }
  }

  async function onApplyAi() {
    if (!funnelId) return;
    setError(null);
    setInfo(null);
    try {
      await applyAi.mutateAsync(funnelId);
      setInfo('Đã lưu rule AI vào funnel này.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được đề xuất');
    }
  }

  async function onSave() {
    if (!funnelId) return;
    setError(null);
    setInfo(null);
    try {
      await save.mutateAsync({
        funnelId,
        maxScore,
        mqlThreshold: mql,
        sqlThreshold: sql,
        mqlStageId: mqlStageId || undefined,
        sqlStageId: sqlStageId || undefined,
        isActive: true,
        rules,
      });
      setInfo('Đã lưu cấu hình Lead Scoring / MQL / SQL.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được');
    }
  }

  if (recs.isLoading) return <LoadingState />;
  if (recs.isError) return <ErrorState onRetry={() => void recs.refetch()} />;
  if (!list.length) {
    return (
      <EmptyState
        title={t('funnel.scoringNoFunnel')}
        description="Tạo phễu bằng AI trước, rồi cấu hình điểm MQL/SQL tại đây."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Scoring 0–100 theo Funnel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!recommendationId && (
            <div className="space-y-2">
              <Label>Funnel</Label>
              <Select value={funnelId} onValueChange={setFunnelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn funnel" />
                </SelectTrigger>
                <SelectContent>
                  {list.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.selectedSlug || r.prompt.slice(0, 48) || r.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>MQL threshold</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={mql}
                onChange={(e) => setMql(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>SQL threshold</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={sql}
                onChange={(e) => setSql(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Điểm tối đa</Label>
              <Input
                type="number"
                min={10}
                max={100}
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Stage khi đạt MQL</Label>
              <Select value={mqlStageId || 'auto'} onValueChange={(v) => setMqlStageId(v === 'auto' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Mặc định (QUALIFIED)</SelectItem>
                  {stageOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Stage khi đạt SQL</Label>
              <Select value={sqlStageId || 'auto'} onValueChange={(v) => setSqlStageId(v === 'auto' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Mặc định (BOOKED)</SelectItem>
                  {stageOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Đạt ngưỡng → đổi stage + activity + automation SCORE_CHANGED/STAGE_CHANGED + task/notify sale.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void onPropose()} disabled={propose.isPending}>
              {propose.isPending ? 'Đang đề xuất…' : 'AI đề xuất rule'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onApplyAi()} disabled={applyAi.isPending}>
              {applyAi.isPending ? 'Đang lưu…' : 'Lưu đề xuất AI'}
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={save.isPending || !rules.length}>
              {save.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
            </Button>
          </div>

          {info ? <p className="text-xs text-emerald-700">{info}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rule theo hành vi</CardTitle>
        </CardHeader>
        <CardContent>
          {!rules.length ? (
            <p className="text-sm text-muted-foreground">
              Bấm “AI đề xuất rule” hoặc “Lưu đề xuất AI” để tạo 7 rule mặc định.
            </p>
          ) : (
            <div className="space-y-3">
              {rules.map((r, i) => (
                <div key={r.key} className="grid grid-cols-[1fr_100px] items-center gap-2">
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {EVENT_LABEL[r.eventType] ?? r.eventType}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={-50}
                    max={100}
                    value={r.points}
                    onChange={(e) => {
                      const points = Number(e.target.value);
                      setRules((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, points } : row)),
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
