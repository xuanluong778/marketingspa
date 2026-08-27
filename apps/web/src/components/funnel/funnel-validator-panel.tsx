'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFunnelValidation } from '@/hooks/use-funnel-validator';
import {
  FUNNEL_DIMENSION_LABELS,
  type FunnelScoreDimension,
  type FunnelValidatorResult,
} from '@/types/funnel-validator';
import { CheckCircle2, XCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const DIMENSION_ORDER: FunnelScoreDimension[] = [
  'offer',
  'audience',
  'capture',
  'followUp',
  'automation',
  'conversion',
  'remarketing',
  'tracking',
];

function ScoreBadge({ score, canActivate }: { score: number; canActivate: boolean }) {
  return (
    <div
      className={cn(
        'flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 text-center',
        canActivate
          ? 'border-green-500 text-green-600'
          : score >= 40
            ? 'border-amber-500 text-amber-600'
            : 'border-red-400 text-red-500',
      )}
    >
      <span className="text-2xl font-bold">{score}</span>
      <span className="text-[10px] uppercase tracking-wide">/ 100</span>
    </div>
  );
}

function DimBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ValidatorBody({ data }: { data: FunnelValidatorResult }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <ScoreBadge score={data.score} canActivate={data.canActivate} />
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            <Badge variant={data.canActivate ? 'default' : 'secondary'}>
              {data.canActivate ? 'Sẵn sàng activate' : data.ready ? 'Đạt checks' : 'Chưa ready'}
            </Badge>
            {!data.canActivate && (
              <Badge variant="outline">Tối thiểu 60 điểm để activate</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Validator kiểm tra cấu hình funnel — không dùng KPI ads thực tế.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {DIMENSION_ORDER.map((key) => {
          const dim = data.dimensions[key];
          return (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{FUNNEL_DIMENSION_LABELS[key]}</span>
                <span className="text-muted-foreground">
                  {dim.score}/{dim.max}
                </span>
              </div>
              <DimBar score={dim.score} max={dim.max} />
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.checks.map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              {c.passed ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              ) : c.severity === 'blocking' ? (
                <XCircle className="h-4 w-4 shrink-0 text-red-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              <div>
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground"> — {c.message}</span>
                {c.hint && !c.passed && (
                  <p className="text-xs text-muted-foreground mt-0.5">{c.hint}</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {data.explanation && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Phân tích
              <Badge variant="outline" className="text-[10px]">
                {data.explanation.source === 'ai' ? 'AI' : 'Rules'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {data.explanation.explanation}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Props = {
  recommendations?: Array<{ id: string; prompt: string; selectedSlug?: string | null }>;
  recommendationId?: string | null;
};

export function FunnelValidatorPanel({ recommendations = [], recommendationId }: Props) {
  const [selectedId, setSelectedId] = useState(recommendationId ?? recommendations[0]?.id ?? '');
  const [withExplain, setWithExplain] = useState(false);
  const activeId = recommendationId ?? selectedId;
  const { data, isLoading, isError, refetch, isFetching } = useFunnelValidation(
    activeId || null,
    withExplain,
  );

  return (
    <div className="space-y-4">
      {!recommendationId && recommendations.length > 0 && (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 min-w-[220px]">
            <span className="text-xs text-muted-foreground">Funnel draft</span>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn funnel" />
              </SelectTrigger>
              <SelectContent>
                {recommendations.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {(r.selectedSlug ?? r.prompt).slice(0, 50)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant={withExplain ? 'default' : 'outline'}
            size="sm"
            onClick={() => setWithExplain((v) => !v)}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            AI giải thích
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Làm mới
          </Button>
        </div>
      )}

      {!activeId ? (
        <EmptyState title="Chọn funnel" description="Generate complete spec trước khi validate" />
      ) : isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : data ? (
        <ValidatorBody data={data} />
      ) : null}
    </div>
  );
}
