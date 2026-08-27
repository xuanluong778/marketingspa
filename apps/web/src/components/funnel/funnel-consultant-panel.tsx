'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useFunnelConsultantApply,
  useFunnelConsultantPropose,
} from '@/hooks/use-funnel-consultant';
import {
  FUNNEL_CONSULTANT_CHIPS,
  type FunnelConsultantIntent,
  type FunnelConsultantProposal,
} from '@/types/funnel-consultant';
import type { FunnelCompleteSpec } from '@/types/funnel';
import { Sparkles, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  recommendationId: string;
  spec: FunnelCompleteSpec;
  dirty?: boolean;
  onApplied: (complete: FunnelCompleteSpec) => void;
};

export function FunnelConsultantPanel({ recommendationId, spec, dirty, onApplied }: Props) {
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<FunnelConsultantProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const propose = useFunnelConsultantPropose();
  const apply = useFunnelConsultantApply();

  async function runPropose(intent?: FunnelConsultantIntent, text?: string) {
    setError(null);
    try {
      const res = await propose.mutateAsync({
        id: recommendationId,
        intent,
        prompt: (text ?? prompt).trim() || undefined,
        includeAnalytics: true,
      });
      setProposal(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được đề xuất');
    }
  }

  async function onConfirm() {
    if (!proposal) return;
    if (dirty && !window.confirm('Thiết kế chưa lưu. Áp đề xuất sẽ ghi đè nháp — tiếp tục?')) {
      return;
    }
    setError(null);
    try {
      const saved = await apply.mutateAsync({
        id: recommendationId,
        complete: proposal.proposed,
        specHash: proposal.specHash,
      });
      onApplied(saved.complete);
      setProposal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không áp dụng được đề xuất');
    }
  }

  return (
    <Card className="flex h-full min-h-[620px] flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4" />
          AI Funnel Consultant
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Chỉ sửa draft qua schema. Không tự đổi Funnel/ngân sách khi chưa xác nhận.
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FUNNEL_CONSULTANT_CHIPS.map((c) => (
            <Button
              key={c.intent}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={propose.isPending}
              onClick={() => {
                setPrompt(c.label);
                void runPropose(c.intent, c.label);
              }}
            >
              {c.label}
            </Button>
          ))}
        </div>

        <Textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ví dụ: đổi offer sang tư vấn miễn phí, không giảm giá…"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void runPropose()}
            disabled={propose.isPending || prompt.trim().length < 3}
          >
            {propose.isPending ? 'Đang phân tích…' : 'Đề xuất'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={propose.isPending}
            onClick={() => void runPropose('OPTIMIZE_FROM_DATA', 'tối ưu theo dữ liệu thật')}
          >
            Phân tích dữ liệu
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {proposal && (
          <ScrollArea className="min-h-0 flex-1 rounded-md border p-3">
            <div className="space-y-3 pr-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{proposal.source === 'ai' ? 'AI' : 'Rules'}</Badge>
                <Badge variant="secondary">Draft only</Badge>
                {proposal.budgetChanged === false && (
                  <Badge variant="outline">Không đổi ngân sách</Badge>
                )}
                <Badge variant={proposal.validation.canActivate ? 'default' : 'outline'}>
                  Score {proposal.validation.score}/100
                </Badge>
              </div>
              <p className="text-sm whitespace-pre-wrap">{proposal.rationale}</p>
              {proposal.insights.length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {proposal.insights.map((i, idx) => (
                    <li key={`${i.topic}-${idx}`}>• {i.message}</li>
                  ))}
                </ul>
              )}
              {proposal.changes.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Thay đổi đề xuất</p>
                  <ul className="space-y-1 text-xs">
                    {proposal.changes.map((c) => (
                      <li key={c}>• {c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {proposal.diff.length > 0 && (
                <div className="space-y-1">
                  {proposal.diff.map((d) => (
                    <p key={d.path} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{d.path}</span>:{' '}
                      <span className="line-through">{d.before.slice(0, 40)}</span>
                      {' → '}
                      {d.after.slice(0, 40)}
                    </p>
                  ))}
                </div>
              )}
              {proposal.diff.length === 0 && (
                <p className="text-xs text-muted-foreground">Không có thay đổi cấu hình so với draft hiện tại.</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={apply.isPending || proposal.diff.length === 0}
                  onClick={() => void onConfirm()}
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  {apply.isPending ? 'Đang lưu draft…' : 'Xác nhận áp vào draft'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setProposal(null)}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Bỏ
                </Button>
              </div>
              <p className={cn('text-[11px] text-muted-foreground')}>
                Áp dụng chỉ ghi Funnel draft ({spec.schemaVersion}). Không deploy ads / không đổi budget.
              </p>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
