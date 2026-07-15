'use client';

import { AlertTriangle, Lightbulb, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatVnd } from '@/lib/format';
import type { AdPerformanceMetrics } from '@/types/ad-performance';

export function AdPerformanceInsightsSidebar({ metrics }: { metrics: AdPerformanceMetrics }) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-3">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold text-slate-900">Insight</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {metrics.insights.map((item) => (
            <li key={item.id} className="px-4 py-3 text-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {item.label}
              </p>
              <p className="mt-1 text-slate-800 leading-snug">{item.value}</p>
            </li>
          ))}
        </ul>
      </div>

      {metrics.warnings.length > 0 && (
        <div className="space-y-2">
          {metrics.warnings.map((w) => (
            <div
              key={w.id}
              className={cn(
                'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
                w.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                w.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
                w.tone === 'danger' && 'border-red-200 bg-red-50 text-red-900',
              )}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" />
          Tóm tắt nhanh
        </div>
        <dl className="space-y-2 text-emerald-950/90">
          <div className="flex justify-between gap-2">
            <dt>Lãi trước QC</dt>
            <dd className="font-medium tabular-nums">{formatVnd(metrics.profitBeforeAds)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Giá vốn</dt>
            <dd className="font-medium tabular-nums">{formatVnd(metrics.costOfGoods)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Số đơn hàng</dt>
            <dd className="font-medium tabular-nums">
              {new Intl.NumberFormat('vi-VN').format(metrics.totalOrders)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Hòa vốn cần</dt>
            <dd className="font-medium tabular-nums">
              {new Intl.NumberFormat('vi-VN').format(metrics.breakEvenOrders)} đơn
            </dd>
          </div>
          {metrics.otherCost > 0 && (
            <div className="flex justify-between gap-2">
              <dt>Chi phí khác</dt>
              <dd className="font-medium tabular-nums">{formatVnd(metrics.otherCost)}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
