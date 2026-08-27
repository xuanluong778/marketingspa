'use client';

import { useMemo, useState } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';
import { MoneyInput } from '@/components/business-goals/money-input';
import { PercentInput } from '@/components/business-goals/percent-input';
import { FieldHint, FieldLabel } from '@/components/business-goals/field-hint';
import { BG_BOX, BG_BOX_FIELDS, BG_BOX_MUTED } from '@/components/business-goals/business-goals-theme';
import {
  buildAdGoalHighlights,
  buildAdGoalPlainSummary,
  buildAdGoalResultTable,
  calculateAdGoalMetrics,
} from '@/lib/ad-goal-calculator';
import { defaultAdGoalInput, sampleAdGoalInput, type AdGoalInput } from '@/types/ad-goals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

function FieldBlock({
  htmlFor,
  label,
  tip,
  hint,
  children,
}: {
  htmlFor?: string;
  label: string;
  tip: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        <span title={tip} className="mt-0.5 shrink-0 cursor-help text-white/50 hover:text-white/80">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{tip}</span>
        </span>
      </div>
      {children}
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}

/**
 * Tab "Tính mục tiêu quảng cáo" — module độc lập, không dùng state/calc của 2 tab kia.
 */
export function AdGoalPanel() {
  const t = useT();
  const [input, setInput] = useState<AdGoalInput>(defaultAdGoalInput);
  const patch = (partial: Partial<AdGoalInput>) => setInput((s) => ({ ...s, ...partial }));

  const metrics = useMemo(() => calculateAdGoalMetrics(input), [input]);
  const highlights = useMemo(() => buildAdGoalHighlights(metrics), [metrics]);
  const rows = useMemo(() => buildAdGoalResultTable(input, metrics), [input, metrics]);
  const summary = useMemo(() => buildAdGoalPlainSummary(input, metrics), [input, metrics]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Ước tính đơn, ngân sách QC và ROAS theo CPM & tỷ lệ chuyển đổi — riêng với các tab khác.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setInput({ ...sampleAdGoalInput })}
          >
            Dữ liệu mẫu
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setInput({ ...defaultAdGoalInput })}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* KPI tóm tắt: 1 hàng 4 cột */}
      <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
        {highlights.map((h) => (
          <div key={h.id} className={cn('min-w-0 rounded-xl border border-white/10 p-3.5', BG_BOX)}>
            <p className={cn('text-[11px] font-medium', BG_BOX_MUTED)}>{h.label}</p>
            <p className="mt-1 truncate text-lg font-bold text-white">{h.value}</p>
            <p className={cn('mt-1 text-[11px]', BG_BOX_MUTED)}>{h.hint}</p>
          </div>
        ))}
      </div>

      {/* Hiểu nhanh: full width, phía trên form nhập */}
      <div className="w-full rounded-xl border border-orange-400/25 bg-orange-500/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-orange-100">
          <Sparkles className="h-4 w-4 shrink-0" />
          <p className="text-sm font-semibold">{t('businessGoals.quickUnderstand')}</p>
        </div>
        <p className="text-sm leading-relaxed text-white/90">{summary}</p>
      </div>

      <div className="flex w-full flex-col gap-5 lg:flex-row lg:items-start">
        {/* Cột trái: Nhập */}
        <Card
          className={cn(
            'min-w-0 w-full lg:w-[450px] lg:min-w-[450px] lg:max-w-[450px] lg:shrink-0',
            BG_BOX,
            BG_BOX_FIELDS,
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">{t('businessGoals.enterFigures')}</CardTitle>
            <p className={cn('text-xs font-normal', BG_BOX_MUTED)}>5 chỉ số — kết quả bên phải</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldBlock
              htmlFor="adg-cpm"
              label="CPM"
              tip="Chi phí cho 1.000 lượt hiển thị quảng cáo."
              hint="Tiền phải trả để quảng cáo hiện ra 1.000 lần."
            >
              <MoneyInput
                id="adg-cpm"
                value={input.cpm}
                onChange={(cpm) => patch({ cpm })}
                placeholder="Ví dụ: 35.000"
              />
            </FieldBlock>

            <FieldBlock
              htmlFor="adg-cr"
              label="Tỷ lệ chuyển đổi (%)"
              tip="Trong các lượt hiển thị, bao nhiêu % thành đơn hàng."
              hint="Ví dụ 0,15% ≈ cứ 1.000 lượt hiển thị có khoảng 1–2 đơn."
            >
              <PercentInput
                id="adg-cr"
                value={input.conversionRate}
                onChange={(conversionRate) => patch({ conversionRate })}
                placeholder="Ví dụ: 0.15"
                max={100}
              />
            </FieldBlock>

            <FieldBlock
              htmlFor="adg-aov"
              label="Doanh thu trung bình / đơn"
              tip="Trung bình một khách trả bao nhiêu khi mua."
              hint="Giá trị trung bình một đơn hàng mang lại."
            >
              <MoneyInput
                id="adg-aov"
                value={input.averageOrderRevenue}
                onChange={(averageOrderRevenue) => patch({ averageOrderRevenue })}
                placeholder="Ví dụ: 500.000"
              />
            </FieldBlock>

            <FieldBlock
              htmlFor="adg-margin"
              label="Tỷ suất lợi nhuận (%)"
              tip="Phần trăm lãi gộp trên doanh thu đơn (chưa trừ QC)."
              hint="Sau giá vốn, còn giữ lại bao nhiêu % trên mỗi đơn (trước QC)."
            >
              <PercentInput
                id="adg-margin"
                value={input.grossProfitRate}
                onChange={(grossProfitRate) => patch({ grossProfitRate })}
                placeholder="Ví dụ: 38"
              />
            </FieldBlock>

            <FieldBlock
              htmlFor="adg-target"
              label={t('businessGoals.profitGoalMonth')}
              tip="Số tiền lãi ròng muốn kiếm sau khi đã trừ QC."
              hint="Mức lãi ròng/tháng bạn muốn đạt được."
            >
              <MoneyInput
                id="adg-target"
                value={input.targetMonthlyProfit}
                onChange={(targetMonthlyProfit) => patch({ targetMonthlyProfit })}
                placeholder="Ví dụ: 27.000.000"
              />
            </FieldBlock>
          </CardContent>
        </Card>

        {/* Cột phải: Bảng kết quả chi tiết */}
        <div className="min-w-0 w-full flex-1">
          <div className={cn('overflow-hidden rounded-xl border border-white/10', BG_BOX)}>
            <div className="border-b border-white/10 px-4 py-3">
              <h3 className="text-base font-semibold text-white">Kết quả mục tiêu quảng cáo</h3>
              <p className={cn('mt-0.5 text-xs', BG_BOX_MUTED)}>
                Mục · Công thức · Kết quả · Giải thích — vuốt ngang trên điện thoại nếu cần.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[11px] uppercase tracking-wide text-white/55">
                    <th className="px-3 py-2.5 font-semibold">Mục</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Công thức</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Kết quả</th>
                    <th className="px-3 py-2.5 font-semibold">Giải thích</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-white/10 last:border-0">
                      <td className="px-3 py-3 align-top font-semibold text-white">
                        {row.code !== '—' && (
                          <span className="mr-1 text-white/45">{row.code}.</span>
                        )}
                        {row.label}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-top text-center text-white/70">
                        {row.formula || ''}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-top text-right font-semibold text-white">
                        {row.resultText}
                      </td>
                      <td className={cn('px-3 py-3 align-top text-xs leading-relaxed', BG_BOX_MUTED)}>
                        {row.explanation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
