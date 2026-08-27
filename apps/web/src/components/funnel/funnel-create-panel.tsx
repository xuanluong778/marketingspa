'use client';

import { useState } from 'react';
import { CalendarCheck, HeartHandshake, Sparkles, Target, UserPlus, Wallet } from 'lucide-react';
import { FunnelReadyCard } from '@/components/funnel/funnel-ready-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/shared/page-state';
import {
  useGenerateFunnelComplete,
  useGenerateFunnelRecommendations,
  useSelectFunnelRecommendation,
} from '@/hooks/use-funnel-builder';
import {
  FUNNEL_SIMPLE_GOALS,
  FUNNEL_TEMPLATE_SIMPLE_NAME,
  getFunnelSimpleGoal,
  pickFunnelTemplateSlug,
  type FunnelSimpleGoal,
} from '@/lib/funnel-create-goals';
import { cn } from '@/lib/utils';
import type { FunnelCompleteSpec } from '@/types/funnel';
import type { FunnelCreateSource } from '@/lib/funnel-tabs';

const GOAL_ICON = {
  lead: UserPlus,
  booking: CalendarCheck,
  sales: Wallet,
  reactivate: HeartHandshake,
};

const TEMPLATE_HINT: Record<string, string> = {
  voucher: 'Thu lead bằng ưu đãi, rồi tư vấn đặt lịch.',
  giveaway: 'Mini game viral để lấy SĐT.',
  quiz: 'Quiz nhu cầu rồi CTA đặt lịch.',
  consultation: 'Form tư vấn → gọi → chốt liệu trình.',
  booking: 'Đặt lịch → xác nhận → đến spa.',
  content: 'Nuôi dưỡng khách bằng nội dung rồi chuyển đổi.',
  'flash-sale': 'Deal có hạn, giữ chỗ / thanh toán nhanh.',
  retargeting: 'Nhắc khách đã xem nhưng chưa chốt.',
  referral: 'Khách cũ giới thiệu bạn mới.',
  reactivation: 'Offer đánh thức khách / lead ngủ.',
};

type Step = 1 | 2 | 3;

export function FunnelCreatePanel({
  initialGoal,
  initialMethod,
}: {
  initialGoal?: string | null;
  initialMethod?: FunnelCreateSource;
} = {}) {
  const parsedGoal = getFunnelSimpleGoal(initialGoal)?.id ?? null;
  const [step, setStep] = useState<Step>(parsedGoal ? 2 : 1);
  const [goalId, setGoalId] = useState<FunnelSimpleGoal | null>(parsedGoal);
  const [method, setMethod] = useState<FunnelCreateSource | null>(initialMethod ?? null);
  const [error, setError] = useState<string | null>(null);
  const [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [complete, setComplete] = useState<FunnelCompleteSpec | null>(null);

  const generate = useGenerateFunnelRecommendations();
  const select = useSelectFunnelRecommendation();
  const generateComplete = useGenerateFunnelComplete();

  const goal = goalId ? getFunnelSimpleGoal(goalId) : null;
  const busy = generate.isPending || select.isPending || generateComplete.isPending;

  async function createDraft(preferredSlug?: string) {
    if (!goal) return;
    setError(null);
    setComplete(null);
    try {
      const notes = preferredSlug
        ? `Bắt buộc dùng template ${preferredSlug} (${FUNNEL_TEMPLATE_SIMPLE_NAME[preferredSlug] ?? preferredSlug}).`
        : undefined;
      const recs = await generate.mutateAsync({
        prompt: preferredSlug ? `${goal.prompt} Template: ${preferredSlug}.` : goal.prompt,
        goal: goal.apiGoal,
        productService: 'Dịch vụ spa / thẩm mỹ',
        notes,
      });
      if (!recs.id) throw new Error('Không tạo được phễu');
      const slug = pickFunnelTemplateSlug(recs.recommendations, preferredSlug, goal.slugs);
      if (!slug) throw new Error('AI chưa đề xuất được mẫu phù hợp');
      await select.mutateAsync({ id: recs.id, templateSlug: slug });
      const done = await generateComplete.mutateAsync(recs.id);
      setRecommendationId(recs.id);
      setComplete(done.complete);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được phễu');
    }
  }

  function reset() {
    setStep(1);
    setGoalId(null);
    setMethod(null);
    setError(null);
    setComplete(null);
    setRecommendationId(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ol className="grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
        {[
          { n: 1 as const, label: 'Mục tiêu' },
          { n: 2 as const, label: 'Cách tạo' },
          { n: 3 as const, label: 'Hoàn tất' },
        ].map((s) => (
          <li
            key={s.n}
            className={cn(
              'rounded-md border px-2 py-2',
              step === s.n && 'border-primary bg-primary/5 font-medium',
              step > s.n && 'text-muted-foreground',
            )}
          >
            B{s.n}. {s.label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Bạn muốn phễu này làm gì?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FUNNEL_SIMPLE_GOALS.map((g) => {
              const Icon = GOAL_ICON[g.id];
              return (
                <button
                  key={g.id}
                  type="button"
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors hover:bg-muted/40',
                    goalId === g.id && 'border-primary bg-primary/5 ring-1 ring-primary',
                  )}
                  onClick={() => {
                    setGoalId(g.id);
                    setMethod(null);
                    setStep(2);
                    setError(null);
                  }}
                >
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <p className="font-medium">{g.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && goal && !busy && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Tạo phễu cho “{goal.label}”</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
              Đổi mục tiêu
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="text-left"
              onClick={() => {
                setMethod('ai');
                void createDraft();
              }}
            >
              <Card
                className={cn(
                  'h-full transition-colors hover:bg-muted/30',
                  method === 'ai' && 'border-primary ring-1 ring-primary',
                )}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" />
                    AI tạo giúp tôi
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Tự chọn mẫu trong catalog rồi dựng phễu hoàn chỉnh.
                </CardContent>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => setMethod('templates')}>
              <Card
                className={cn(
                  'h-full transition-colors hover:bg-muted/30',
                  method === 'templates' && 'border-primary ring-1 ring-primary',
                )}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4" />
                    Chọn mẫu có sẵn
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Chọn 1 mẫu theo mục tiêu — không cần cấu hình kỹ thuật.
                </CardContent>
              </Card>
            </button>
          </div>

          {method === 'templates' && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Mẫu cho {goal.label}</p>
              <div className="grid gap-2">
                {goal.slugs.map((slug) => (
                  <button
                    key={slug}
                    type="button"
                    className="rounded-md border px-3 py-3 text-left text-sm hover:bg-muted/40"
                    onClick={() => void createDraft(slug)}
                  >
                    <span className="font-medium">
                      {FUNNEL_TEMPLATE_SIMPLE_NAME[slug] ?? slug}
                    </span>
                    {TEMPLATE_HINT[slug] && (
                      <span className="mt-0.5 block text-muted-foreground">
                        {TEMPLATE_HINT[slug]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {busy && (
        <LoadingState
          message={
            method === 'templates' ? 'Đang dựng phễu từ mẫu…' : 'AI đang tạo phễu hoàn chỉnh…'
          }
        />
      )}
      {error && step === 2 && !busy && <p className="text-sm text-destructive">{error}</p>}

      {step === 3 && complete && recommendationId && !busy && (
        <FunnelReadyCard
          recommendationId={recommendationId}
          spec={complete}
          onCreateAnother={reset}
        />
      )}
    </div>
  );
}
