'use client';

import type { ElementType } from 'react';
import {
  DollarSign,
  Minus,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatVnd } from '@/lib/format';
import type { AdPerformanceMetrics } from '@/types/ad-performance';

function formatRoas(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)}%`;
}

function HeroBanner({ metrics }: { metrics: AdPerformanceMetrics }) {
  const config = {
    profit: {
      bg: 'from-emerald-600 to-emerald-700',
      icon: TrendingUp,
      text: `LÃI RỒI +${formatVnd(metrics.profitAfterAds)}`,
    },
    loss: {
      bg: 'from-red-600 to-red-700',
      icon: TrendingDown,
      text: `ĐANG LỖ -${formatVnd(Math.abs(metrics.profitAfterAds))}`,
    },
    break_even: {
      bg: 'from-orange-500 to-orange-600',
      icon: Minus,
      text: 'HÒA VỐN',
    },
  }[metrics.status];

  const Icon = config.icon;

  return (
    <>
      <div className={cn('fixed top-14 z-40 left-0 right-0 lg:left-64', 'px-4 py-2 md:px-6')}>
        <div
          className={cn(
            'rounded-2xl bg-gradient-to-br px-6 py-5 text-white shadow-lg sm:px-8 sm:py-6',
            config.bg,
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/15 p-3">
                <Icon className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-white/80">
                  Lãi / lỗ sau quảng cáo
                </p>
                <p className="text-2xl font-bold sm:text-3xl">{config.text}</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-white/75">ROAS</p>
              <p className="text-3xl font-bold tabular-nums">{formatRoas(metrics.roas)}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="h-[108px] sm:h-[116px]" aria-hidden />
    </>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
            {label}
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums truncate">{value}</p>
        </div>
        <div className={cn('rounded-lg p-2 shrink-0', accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function AdPerformanceKpiSection({ metrics }: { metrics: AdPerformanceMetrics }) {
  return (
    <div className="space-y-4">
      <HeroBanner metrics={metrics} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Lãi sau QC"
          value={formatVnd(metrics.profitAfterAds)}
          icon={TrendingUp}
          accent="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label="ROAS"
          value={formatRoas(metrics.roas)}
          icon={Target}
          accent="bg-violet-50 text-violet-600"
        />
        <KpiCard
          label="Doanh thu"
          value={formatVnd(metrics.revenue)}
          icon={DollarSign}
          accent="bg-blue-50 text-blue-600"
        />
        <KpiCard
          label="Chi phí QC"
          value={formatVnd(metrics.totalAdSpend)}
          icon={Wallet}
          accent="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Chi phí/đơn"
          value={formatVnd(metrics.costPerOrder)}
          icon={ShoppingCart}
          accent="bg-orange-50 text-orange-600"
        />
        <KpiCard
          label="Tỷ lệ chi QC"
          value={formatPercent(metrics.adCostRate)}
          icon={Target}
          accent="bg-rose-50 text-rose-600"
        />
      </div>
    </div>
  );
}
