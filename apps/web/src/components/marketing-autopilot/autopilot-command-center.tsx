'use client';

import Link from 'next/link';
import { AlertTriangle, Gauge, OctagonAlert, RefreshCw, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/shared/stat-card';
import { StatCardGrid } from '@/components/shared/feature-card-grid';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import type { MarketingAutopilotCommandCenter } from '@/types/marketing-autopilot';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { useMarketingAutopilotEmergencyStop } from '@/hooks/use-marketing-autopilot';

function formatKpi(value: number | null, unit?: string): string {
  if (value == null) return '—';
  const n =
    unit === 'VND'
      ? Math.round(value).toLocaleString('vi-VN')
      : Number.isInteger(value)
        ? String(value)
        : value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  return unit && unit !== 'VND' ? `${n} ${unit}` : unit === 'VND' ? `${n} ₫` : n;
}

const RISK_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  LOW: 'secondary',
  MEDIUM: 'outline',
  HIGH: 'destructive',
};

const MODE_LABEL: Record<string, string> = {
  RECOMMEND_ONLY: 'Recommend only',
  APPROVAL_AUTOPILOT: 'Approval Autopilot',
  FULL_AUTOPILOT: 'Full Autopilot',
};

export function AutopilotCommandCenter({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data?: MarketingAutopilotCommandCenter;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const emergencyStop = useMarketingAutopilotEmergencyStop();

  if (isLoading) return <LoadingState message="Đang tải Command Center từ dữ liệu thật…" />;
  if (isError || !data) {
    return <ErrorState message="Không tải được Command Center" onRetry={onRetry} />;
  }

  const op = data.operational;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">AI Command Center</h2>
          <p className="text-sm text-muted-foreground">
            Số liệu từ Customer 360, Events, CRM, Booking, Sales, Ads, Email, Zalo, Automation,
            Funnel. Không dùng LLM bịa metric.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{data.lifecycle}</Badge>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Làm mới
          </Button>
        </div>
      </div>

      {op ? (
        <Card className={cn(op.emergencyStop && 'border-destructive/60 bg-destructive/5')}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Trạng thái Autopilot</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={op.emergencyStop ? 'destructive' : 'secondary'}>
                {MODE_LABEL[op.effectiveMode] ?? op.effectiveMode}
              </Badge>
              {op.fullAutopilotActive ? (
                <Badge variant="outline">Full active</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 text-sm">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Chờ duyệt mission</p>
                <p className="text-lg font-semibold tabular-nums">{op.pendingMissionApprovals}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Đang chạy</p>
                <p className="text-lg font-semibold tabular-nums">{op.runningMissions}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tối ưu chờ duyệt</p>
                <p className="text-lg font-semibold tabular-nums">
                  {op.pendingOptimizationApprovals}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Cooldown execute</p>
                <p className="text-lg font-semibold tabular-nums">{op.cooldownMinutes} phút</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Email live: {op.liveChannels.email ? 'ON' : 'OFF'}</Badge>
              <Badge variant="outline">
                Google Ads live: {op.liveChannels.googleAds ? 'ON' : 'OFF'}
              </Badge>
              <Badge variant="outline">
                Automation: {op.liveChannels.automation ? 'ON' : 'OFF'}
              </Badge>
              <Badge variant="outline">
                Facebook Fanpage: {op.liveChannels.facebook ? 'live ON' : 'chưa bật guardrail'}
              </Badge>
            </div>

            {op.recentErrors.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="mb-1 font-medium text-amber-800">Lỗi / chặn gần đây</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {op.recentErrors.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      {e.result}: {e.message}{' '}
                      <span className="opacity-70">· {formatDateTime(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={op.emergencyStop || emergencyStop.isPending}
                onClick={() => emergencyStop.mutate(true, { onSuccess: () => onRetry() })}
              >
                <OctagonAlert className="mr-1.5 h-3.5 w-3.5" />
                Emergency Stop
              </Button>
              {op.emergencyStop ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={emergencyStop.isPending}
                  onClick={() => emergencyStop.mutate(false, { onSuccess: () => onRetry() })}
                >
                  Tắt Emergency Stop
                </Button>
              ) : null}
              {op.pendingMissionApprovals > 0 ? (
                <Link
                  href="/marketing-autopilot?tab=history&quickFilter=needs_approval"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Xem mission cần duyệt
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <StatCardGrid>
        {data.kpis.map((kpi) => (
          <StatCard
            key={kpi.id}
            href={kpi.href}
            label={kpi.label}
            value={formatKpi(kpi.value, kpi.unit)}
            hint={kpi.evidence}
            badge={
              <Badge variant={kpi.status === 'OK' ? 'secondary' : 'outline'} className="text-[10px]">
                {kpi.status}
              </Badge>
            }
          />
        ))}
      </StatCardGrid>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Next Best Actions</h3>
          <span className="text-xs text-muted-foreground">
            tối đa 5 —{' '}
            {data.safety.approvalRequired ? 'cần duyệt trước khi chạy' : 'Full Autopilot có guardrail'}
          </span>
        </div>
        {data.nextBestActions.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Chưa đủ tín hiệu để đề xuất hành động. Thu thập thêm lead / booking / ads rồi làm mới.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {data.nextBestActions.map((action) => (
              <Card key={`${action.priority}-${action.title}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>P{action.priority}</Badge>
                      <CardTitle className="text-base">{action.title}</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground">{action.whyNow}</p>
                  </div>
                  <Badge variant={RISK_VARIANT[action.risk] ?? 'outline'}>risk {action.risk}</Badge>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0 text-sm">
                  <p>
                    <span className="font-medium">Evidence: </span>
                    <span className="text-muted-foreground">{action.evidence}</span>
                  </p>
                  <p>
                    <span className="font-medium">Impact: </span>
                    {action.expectedImpact}
                    {action.estimatedCost != null ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · cost {Math.round(action.estimatedCost).toLocaleString('vi-VN')} ₫
                      </span>
                    ) : (
                      <span className="text-muted-foreground"> · cost n/a (không bịa)</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline">{action.confidence}</Badge>
                    <Badge variant="outline">{action.recommendedAction}</Badge>
                    <Link
                      href={action.editUrl}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Xem & chỉnh sửa
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {!data.noFakeMetrics || !data.coverage.pass ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            {!data.noFakeMetrics
              ? 'Cảnh báo: board chưa đạt NO_FAKE_METRICS.'
              : `Thiếu nguồn bắt buộc: ${data.coverage.required.filter((d) => !data.coverage.present.includes(d)).join(', ') || 'n/a'}`}
          </p>
        </div>
      ) : null}

      <p className={cn('text-xs text-muted-foreground')}>
        {data.safety.draftOnly ? 'Recommend-only / draft · ' : ''}
        {data.safety.approvalRequired ? 'Mọi action quan trọng cần USER APPROVE. ' : 'Full Autopilot + guardrail. '}
        {data.safety.facebookReadOnly ? 'Facebook read-only. ' : ''}
        engine {data.engineVersion} · {data.version}
        {data.fromCache ? ' · cache' : ''}
      </p>
    </div>
  );
}
