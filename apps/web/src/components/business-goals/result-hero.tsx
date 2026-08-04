'use client';

import { TrendingUp, TrendingDown, Minus, Target, Wallet, Users, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatVnd } from '@/lib/format';
import type { BusinessGoalMetrics } from '@/lib/business-goal-metrics';
import {
  BG_BOX,
  BG_BOX_MUTED,
  STATUS_BORDER,
} from '@/components/business-goals/business-goals-theme';

const statusStyles = {
  profit: {
    icon: TrendingUp,
    label: 'Đang lãi',
    prefix: '+',
    iconWrap: 'bg-emerald-500/20 text-emerald-300',
  },
  loss: {
    icon: TrendingDown,
    label: 'Đang lỗ',
    prefix: '-',
    iconWrap: 'bg-red-500/20 text-red-300',
  },
  break_even: {
    icon: Minus,
    label: 'Đang hòa vốn',
    prefix: '',
    iconWrap: 'bg-amber-500/20 text-amber-300',
  },
} as const;

export function ResultHeroCard({ metrics }: { metrics: BusinessGoalMetrics }) {
  const style = statusStyles[metrics.status];
  const Icon = style.icon;
  const amount =
    metrics.status === 'break_even'
      ? ''
      : `${style.prefix}${formatVnd(Math.abs(metrics.netProfit))}`;

  return (
    <div className={cn('rounded-2xl p-6 md:p-8', BG_BOX, STATUS_BORDER[metrics.status])}>
      <div className="flex items-start gap-4">
        <div className={cn('rounded-xl p-3 shrink-0', style.iconWrap)}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <p className={cn('text-sm font-medium uppercase tracking-wide', BG_BOX_MUTED)}>
            Kết quả kinh doanh
          </p>
          <p className="text-2xl md:text-3xl font-bold mt-1 truncate text-white">
            {style.label}
            {amount && ` ${amount}`}
          </p>
          <p className={cn('text-sm mt-2 leading-relaxed', BG_BOX_MUTED)}>{metrics.heroMessage}</p>
        </div>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}

function KpiCard({ label, value, icon, accent }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl p-4', BG_BOX)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('rounded-lg p-2', accent)}>{icon}</div>
        <p className={cn('text-xs font-medium leading-tight', BG_BOX_MUTED)}>{label}</p>
      </div>
      <p className="text-xl font-bold tracking-tight text-white">{value}</p>
    </div>
  );
}

export function KpiCards({ metrics }: { metrics: BusinessGoalMetrics }) {
  const profitMargin = metrics.profitMargin !== null ? `${metrics.profitMargin.toFixed(2)}%` : '—';
  const breakEvenTx =
    metrics.breakEvenTransactions !== null
      ? metrics.breakEvenTransactions.toLocaleString('vi-VN')
      : '—';
  const breakEvenLeads = metrics.breakEvenLeadsInsufficientData
    ? '—'
    : metrics.breakEvenLeads !== null
      ? metrics.breakEvenLeads.toLocaleString('vi-VN')
      : '—';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Tỷ lệ lợi nhuận"
        value={profitMargin}
        icon={<BarChart3 className="h-4 w-4 text-violet-300" />}
        accent="bg-violet-500/20"
      />
      <KpiCard
        label="Lãi gộp"
        value={formatVnd(metrics.grossProfit)}
        icon={<Wallet className="h-4 w-4 text-emerald-300" />}
        accent="bg-emerald-500/20"
      />
      <KpiCard
        label="Giao dịch hòa vốn"
        value={breakEvenTx}
        icon={<Target className="h-4 w-4 text-blue-300" />}
        accent="bg-blue-500/20"
      />
      <KpiCard
        label="Lead cần để hòa vốn"
        value={breakEvenLeads}
        icon={<Users className="h-4 w-4 text-orange-300" />}
        accent="bg-orange-500/20"
      />
    </div>
  );
}
