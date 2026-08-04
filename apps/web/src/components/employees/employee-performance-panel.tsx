'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/shared/page-state';
import { useEmployeePerformance, defaultPerformanceRange } from '@/hooks/use-employees';
import { formatCurrency } from '@/lib/format';
import type { EmployeeDetail } from '@/types/appointments';

interface EmployeePerformancePanelProps {
  employee: EmployeeDetail;
}

export function EmployeePerformancePanel({ employee }: EmployeePerformancePanelProps) {
  const [range, setRange] = useState(() => defaultPerformanceRange());
  const { data, isLoading } = useEmployeePerformance(employee.id, range, true);

  const kpis = data
    ? [
        { label: 'Lead nhận', value: data.leadsReceived },
        { label: 'Lead đã liên hệ', value: data.leadsContacted },
        { label: 'Lịch hẹn tạo', value: data.appointmentsCreated },
        { label: 'Khách đã đến', value: data.customersArrived },
        { label: 'Khách đã mua', value: data.customersPurchased },
        { label: 'Doanh thu liên quan', value: formatCurrency(data.revenue) },
        {
          label: 'Tỷ lệ chốt',
          value: data.closeRate != null ? `${data.closeRate}%` : '—',
        },
      ]
    : [];

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Hiệu suất — {employee.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Từ</Label>
            <Input
              type="date"
              className="w-[140px]"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến</Label>
            <Input
              type="date"
              className="w-[140px]"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
        </div>
        {isLoading ? (
          <LoadingState message="Đang tải KPI..." />
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold mt-1">{k.value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
