'use client';

import { AlertTriangle, CheckCircle2, Info, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatVnd } from '@/lib/format';
import type { BusinessGoalMetrics, BusinessGoalWarning } from '@/lib/business-goal-metrics';
import {
  BG_BOX,
  BG_BOX_INNER,
  BG_BOX_MUTED,
} from '@/components/business-goals/business-goals-theme';

function WarningIcon({ severity }: { severity: BusinessGoalWarning['severity'] }) {
  if (severity === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />;
  if (severity === 'error') return <AlertTriangle className="h-4 w-4 text-red-300 shrink-0" />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0" />;
  return <Info className="h-4 w-4 text-blue-300 shrink-0" />;
}

const warningBg: Record<BusinessGoalWarning['severity'], string> = {
  error: 'border-red-400/30 bg-red-500/10',
  warning: 'border-amber-400/30 bg-amber-500/10',
  success: 'border-emerald-400/30 bg-emerald-500/10',
  info: 'border-blue-400/30 bg-blue-500/10',
};

function DarkBox({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl p-4 md:p-5', BG_BOX)}>
      <h3
        className={cn(
          'text-sm font-semibold uppercase tracking-wide flex items-center gap-2 mb-4',
          BG_BOX_MUTED,
        )}
      >
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

export function InsightsPanel({ metrics }: { metrics: BusinessGoalMetrics }) {
  const detailRows = [
    { label: 'Tổng doanh thu', value: formatVnd(metrics.totalRevenue) },
    { label: 'Tổng chi phí biến đổi', value: formatVnd(metrics.variableCost) },
    { label: 'Lãi gộp', value: formatVnd(metrics.grossProfit) },
    {
      label: 'Tỷ lệ lãi gộp',
      value: metrics.grossProfitMargin !== null ? `${metrics.grossProfitMargin.toFixed(2)}%` : '—',
    },
    { label: 'Chi phí cố định', value: formatVnd(metrics.fixedCostOnly) },
    { label: 'Chi phí marketing', value: formatVnd(metrics.marketingCost) },
    {
      label: 'Tổng chi phí',
      value: formatVnd(metrics.variableCost + metrics.fixedCostOnly + metrics.marketingCost),
    },
    { label: 'Lãi trước thuế', value: formatVnd(metrics.netProfit) },
    {
      label: 'Tỷ lệ lợi nhuận',
      value: metrics.profitMargin !== null ? `${metrics.profitMargin.toFixed(2)}%` : '—',
    },
  ];

  return (
    <div className="space-y-4">
      <DarkBox title="Kết quả chi tiết">
        <div className="space-y-2">
          {detailRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-sm py-1">
              <span className={BG_BOX_MUTED}>{row.label}</span>
              <span className="font-semibold text-right text-white">{row.value}</span>
            </div>
          ))}
        </div>
      </DarkBox>

      <DarkBox title="Insight & gợi ý" icon={<Lightbulb className="h-4 w-4 text-amber-300" />}>
        <div className="space-y-3">
          {metrics.insights.map((insight) => (
            <div
              key={insight.text}
              className={cn('rounded-lg px-3 py-2.5 text-sm leading-relaxed', BG_BOX_INNER)}
            >
              {insight.text}
            </div>
          ))}

          {metrics.warnings.length > 0 && (
            <div className="space-y-2 pt-1">
              {metrics.warnings.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 flex gap-2.5 text-white',
                    warningBg[w.severity],
                  )}
                >
                  <WarningIcon severity={w.severity} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{w.title}</p>
                    <p className={cn('text-xs mt-0.5', BG_BOX_MUTED)}>{w.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DarkBox>
    </div>
  );
}

export function FooterTips() {
  const tips = [
    { title: 'Tăng giá trị đơn hàng', desc: 'Upsell combo liệu trình cho khách hiện tại' },
    { title: 'Tối ưu marketing', desc: 'Theo dõi chi phí/lead từng kênh quảng cáo' },
    { title: 'Nâng cao chuyển đổi', desc: 'Chốt sale nhanh trong 24h sau khi nhận lead' },
  ];

  return (
    <div className={cn('rounded-xl p-4', BG_BOX)}>
      <p className="text-sm font-medium flex items-center gap-2 mb-3 text-white">
        <Lightbulb className="h-4 w-4 text-amber-300" />
        Mẹo
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {tips.map((tip) => (
          <div key={tip.title} className={cn('rounded-lg px-3 py-2', BG_BOX_INNER)}>
            <p className="text-sm font-medium">{tip.title}</p>
            <p className={cn('text-xs mt-0.5', BG_BOX_MUTED)}>{tip.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
