'use client';

import {
  UserPlus,
  CalendarDays,
  UserCheck,
  Wallet,
  Megaphone,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDashboardData } from '@/hooks/use-dashboard';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { formatCurrency, formatDateTime } from '@/lib/format';

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { isLoading, isError, refetch, stats, appointments, staleLeads, funnel } =
    useDashboardData();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const maxFunnel = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tổng quan hôm nay</h1>
        <p className="text-muted-foreground text-sm">Số liệu realtime từ hệ thống</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="Lead hôm nay" value={stats.leadsToday} icon={UserPlus} />
        <StatCard title="Lịch hẹn hôm nay" value={stats.appointmentsToday} icon={CalendarDays} />
        <StatCard title="Khách đã đến" value={stats.arrivedToday} icon={UserCheck} />
        <StatCard title="Doanh thu" value={formatCurrency(stats.revenue)} icon={Wallet} />
        <StatCard title="Chi phí ads" value={formatCurrency(stats.adSpend)} icon={Megaphone} />
        <StatCard
          title="Lãi ước tính"
          value={formatCurrency(stats.profit)}
          icon={TrendingUp}
          subtitle="Doanh thu − chi phí"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phễu chuyển đổi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((step) => (
              <div key={step.status} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{step.label}</span>
                  <span className="font-medium">{step.count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(step.count / maxFunnel) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Lịch hẹn hôm nay</CardTitle>
            <Badge variant="secondary">{appointments.length}</Badge>
          </CardHeader>
          <CardContent>
            {appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Chưa có lịch hẹn</p>
            ) : (
              <ul className="space-y-3">
                {appointments.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{a.customer?.name ?? 'Khách'}</p>
                      <p className="text-muted-foreground text-xs">
                        {a.service?.name ?? 'Dịch vụ'} · {a.employee?.name ?? '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs">{formatDateTime(a.scheduledAt)}</p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {a.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {staleLeads.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base text-amber-900">
              Cảnh báo: {staleLeads.length} lead chưa xử lý (&gt;10 phút)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {staleLeads.slice(0, 5).map((l) => (
                <li key={l.id} className="flex justify-between text-sm">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-muted-foreground">{formatDateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
