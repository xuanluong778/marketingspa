'use client';

import { Mail, Users, FileText, Send, Ban, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useEmailOverview, useEmailDomains } from '@/hooks/use-email-marketing';

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

export function EmailOverviewTab() {
  const overview = useEmailOverview();
  const domains = useEmailDomains();

  if (overview.isLoading) return <LoadingState />;
  if (overview.isError || !overview.data) {
    return <ErrorState onRetry={() => overview.refetch()} />;
  }

  const d = overview.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Danh bạ" value={d.contacts} icon={Users} subtitle={`${d.subscribed} đang đăng ký`} />
        <StatCard title="Mẫu email" value={d.templates} icon={FileText} />
        <StatCard title="Chiến dịch" value={d.campaigns} icon={Send} subtitle={`${d.running} đang gửi`} />
        <StatCard title="Đã gửi" value={d.sent} icon={Mail} />
        <StatCard
          title="Tỷ lệ mở"
          value={`${d.openRate}%`}
          icon={Mail}
          subtitle={`${d.opened} lượt mở`}
        />
        <StatCard
          title="Tỷ lệ click"
          value={`${d.clickRate}%`}
          icon={Mail}
          subtitle={`${d.clicked} lượt click`}
        />
        <StatCard title="Danh sách" value={d.lists} icon={Users} />
        <StatCard title="Suppression" value={d.suppressions} icon={Ban} />
        <StatCard
          title="Tên miền gửi"
          value={d.domains}
          icon={Globe}
          subtitle="Cấu hình trong tab Tên miền gửi"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tên miền gửi</CardTitle>
        </CardHeader>
        <CardContent>
          {!domains.data?.length ? (
            <p className="text-sm text-muted-foreground">
              Chưa cấu hình tên miền gửi. Vào tab Tên miền gửi để thêm domain của spa — khách sẽ thấy email đến từ thương
              hiệu của bạn.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {domains.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span>
                    {row.fromName} &lt;{row.fromEmail}&gt;
                  </span>
                  <span className="text-muted-foreground">
                    {row.domainVerified ? 'Domain Verified ✅' : 'Chưa xong ❌'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
