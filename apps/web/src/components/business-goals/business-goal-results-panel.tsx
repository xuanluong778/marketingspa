'use client';

import { Sparkles } from 'lucide-react';
import type { BusinessGoalMetrics } from '@/lib/business-goal-metrics';
import {
  buildBusinessGoalHighlights,
  buildBusinessGoalPlainSummary,
  buildBusinessGoalResultTable,
  type ResultTone,
} from '@/lib/business-goal-results';
import { BG_BOX, BG_BOX_MUTED } from '@/components/business-goals/business-goals-theme';
import { cn } from '@/lib/utils';

const toneCls: Record<ResultTone, string> = {
  safe: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
  watch: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  risk: 'border-red-400/40 bg-red-500/10 text-red-200',
  neutral: 'border-white/15 bg-white/5 text-white/80',
};

const toneDot: Record<ResultTone, string> = {
  safe: '🟢',
  watch: '🟡',
  risk: '🔴',
  neutral: '⚪',
};

/** 4 KPI + Hiểu nhanh — đặt full-width trên đầu trang */
export function BusinessGoalResultsSummary({ metrics }: { metrics: BusinessGoalMetrics }) {
  const highlights = buildBusinessGoalHighlights(metrics);
  const summary = buildBusinessGoalPlainSummary(metrics);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-2 lg:grid-cols-4">
        {highlights.map((h) => (
          <div key={h.id} className={cn('min-w-0 rounded-xl border border-white/10 p-3.5', BG_BOX)}>
            <div className="mb-2 flex items-start justify-between gap-1.5">
              <p className={cn('text-[11px] font-medium leading-tight', BG_BOX_MUTED)}>{h.label}</p>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                  toneCls[h.tone],
                )}
              >
                {toneDot[h.tone]} {h.toneLabel}
              </span>
            </div>
            <p className="truncate text-base font-bold text-white sm:text-lg">{h.value}</p>
            <p className={cn('mt-1 text-[11px] leading-snug', BG_BOX_MUTED)}>{h.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-orange-400/25 bg-orange-500/10 p-4">
        <div className="mb-2 flex items-center gap-2 text-orange-100">
          <Sparkles className="h-4 w-4 shrink-0" />
          <p className="text-sm font-semibold">Hiểu nhanh</p>
        </div>
        <p className="text-sm leading-relaxed text-white/90">{summary}</p>
      </div>
    </div>
  );
}

/** Bảng chi tiết A–M — cột kết quả */
export function BusinessGoalResultsTable({ metrics }: { metrics: BusinessGoalMetrics }) {
  const rows = buildBusinessGoalResultTable(metrics);

  return (
    <div className={cn('overflow-hidden rounded-xl border border-white/10', BG_BOX)}>
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-base font-semibold text-white">Kết quả mục tiêu kinh doanh</h3>
        <p className={cn('mt-0.5 text-xs', BG_BOX_MUTED)}>
          Xem chi tiết từng chỉ số — vuốt ngang trên điện thoại nếu cần.
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
                  <span className="mr-1 text-white/45">{row.code}.</span>
                  {row.label}
                </td>
                <td className="px-3 py-3 align-top text-center text-white/70 whitespace-nowrap">
                  {row.formula || ''}
                </td>
                <td className="px-3 py-3 align-top text-right font-semibold text-white whitespace-nowrap">
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
  );
}

/** Full panel (summary + table) — dùng khi cần 1 khối */
export function BusinessGoalResultsPanel({ metrics }: { metrics: BusinessGoalMetrics }) {
  return (
    <div className="space-y-4">
      <BusinessGoalResultsSummary metrics={metrics} />
      <BusinessGoalResultsTable metrics={metrics} />
    </div>
  );
}
