'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, LayoutGrid, ListTodo, CalendarDays, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient, getApiBaseUrl } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import { cn } from '@/lib/utils';
import { PRIORITY_LABELS } from '@/types/work-management';
import { useT } from '@/i18n/i18n-provider';

type BucketTask = {
  id: string;
  title: string;
  columnName: string;
  columnKey: string;
  priority: string;
  deadline?: string | null;
  risk?: string;
  project?: { id: string; name: string };
};

function SubNav() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href="/work-management">
          <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Kanban
        </Link>
      </Button>
      <Button variant="default" size="sm" asChild>
        <Link href="/work-management/my">
          <ListTodo className="h-3.5 w-3.5 mr-1" /> Việc của tôi
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href="/work-management/dashboard">
          <BarChart3 className="h-3.5 w-3.5 mr-1" /> Dashboard
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href="/work-management/calendar">
          <CalendarDays className="h-3.5 w-3.5 mr-1" /> Lịch
        </Link>
      </Button>
    </div>
  );
}

function TaskList({ items }: { items: BucketTask[] }) {
  const t = useT();
  if (!items.length) {
    return <p className="text-sm text-muted-foreground py-2">{t('work.noTasks')}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((task) => (
        <li key={task.id} className="rounded-lg border p-2.5 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {task.project?.name || '—'} · {task.columnName}
                {task.deadline ? ` · ${task.deadline}` : ''}
              </p>
            </div>
            <div className="flex gap-1">
              <Badge variant="outline" className="text-[10px]">
                {PRIORITY_LABELS[task.priority] || task.priority}
              </Badge>
              {task.risk && task.risk !== 'NONE' && (
                <Badge variant={task.risk === 'OVERDUE' ? 'destructive' : 'secondary'}>
                  {task.risk === 'OVERDUE' ? t('work.overdue') : t('work.slowRisk')}
                </Badge>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function MyWorkPage() {
  const t = useT();
  // Chờ auth me xong rồi mới gọi my-work — tránh race 401/refresh với AuthGuard
  const meQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient<{ id: string }>('/auth/me'),
    enabled: !!authStorage.getAccessToken(),
    retry: false,
  });

  const q = useQuery({
    queryKey: ['work-management', 'my-work'],
    queryFn: () =>
      apiClient<{
        today: string;
        timezone: string;
        counts: Record<string, number>;
        buckets: Record<string, BucketTask[]>;
        warning?: string | null;
      }>('/work-management/my-work'),
    enabled: meQ.isSuccess,
    retry: (count, err) => {
      // Không spam retry 401
      if (
        err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 401
      ) {
        return false;
      }
      return count < 1;
    },
  });

  if (meQ.isLoading || (meQ.isSuccess && q.isLoading)) {
    return <LoadingState message={t('work.loadingMyWork')} />;
  }
  if (meQ.isError) {
    const msg =
      meQ.error && typeof meQ.error === 'object' && 'message' in meQ.error
        ? String((meQ.error as { message: string }).message)
        : t('work.invalidSession');
    return <ErrorState message={msg} onRetry={() => meQ.refetch()} />;
  }
  if (q.isError) {
    const msg =
      q.error && typeof q.error === 'object' && 'message' in q.error
        ? String((q.error as { message: string }).message)
        : t('work.loadFailed');
    return <ErrorState message={msg} onRetry={() => q.refetch()} />;
  }
  if (!q.data) return <EmptyState title={t('work.noData')} />;

  const sections: Array<{ key: string; title: string }> = [
    { key: 'today', title: t('work.today') },
    { key: 'upcoming', title: t('work.dueSoon') },
    { key: 'overdue', title: t('work.overdue') },
    { key: 'inProgress', title: t('work.inProgress') },
    { key: 'pendingReview', title: t('work.pendingReview') },
    { key: 'done', title: t('work.completed') },
    { key: 'assignedByMe', title: t('work.assignedByMe') },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('work.myWork')}
        description={t('work.myWorkDesc', { timezone: q.data.timezone, today: q.data.today })}
      />
      <SubNav />
      {q.data.warning ? (
        <p className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          {q.data.warning}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((s) => (
          <div key={s.key} className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">{s.title}</p>
            <p className="text-2xl font-semibold">{q.data!.counts[s.key] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((s) => (
          <div key={s.key} className="rounded-xl border p-3 space-y-2">
            <h3 className="text-sm font-semibold">
              {s.title}{' '}
              <span className="text-muted-foreground font-normal">
                ({q.data!.buckets[s.key]?.length ?? 0})
              </span>
            </h3>
            <TaskList items={q.data!.buckets[s.key] ?? []} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkDashboardPageInner() {
  const t = useT();
  const [groupBy, setGroupBy] = useState<'project' | 'department' | 'employee'>('project');
  const q = useQuery({
    queryKey: ['work-management', 'dashboard', groupBy],
    queryFn: () =>
      apiClient<{
        today: string;
        summary: {
          inProgress: number;
          pendingReview: number;
          overdue: number;
          done: number;
          doneOnTime: number;
          onTimeRate: number | null;
          atRisk: number;
          total: number;
        };
        groups: Array<{
          id: string;
          name: string;
          counts: {
            inProgress: number;
            pendingReview: number;
            overdue: number;
            done: number;
            atRisk: number;
            onTimeRate: number | null;
          };
          workload?: { score: number; onTimeRate: number; note: string };
        }>;
      }>(`/work-management/dashboard?groupBy=${groupBy}`),
  });

  async function exportReport(format: 'csv' | 'xlsx') {
    const token = authStorage.getAccessToken();
    const res = await fetch(`${getApiBaseUrl()}/work-management/reports/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `work-report.${format === 'xlsx' ? 'xls' : 'csv'}`;
    a.click();
  }

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState onRetry={q.refetch} />;
  const s = q.data!.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('work.dashboard')}
        description={t('work.dashboardDesc')}
      />
      <SubNav />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>{t('work.groupBy')}</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">{t('work.project')}</SelectItem>
              <SelectItem value="department">{t('work.department')}</SelectItem>
              <SelectItem value="employee">{t('work.employee')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportReport('csv')}>
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportReport('xlsx')}>
          <Download className="h-3.5 w-3.5 mr-1" /> Excel
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Đang làm', s.inProgress],
          ['Chờ duyệt', s.pendingReview],
          ['Quá hạn', s.overdue],
          ['Hoàn thành', s.done],
          ['Đúng hạn %', s.onTimeRate ?? '—'],
          ['Nguy cơ chậm', s.atRisk],
        ].map(([label, val]) => (
          <div key={String(label)} className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold">{val}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2 font-medium">Tên</th>
              <th className="p-2">Đang làm</th>
              <th className="p-2">Chờ duyệt</th>
              <th className="p-2">Quá hạn</th>
              <th className="p-2">HT</th>
              <th className="p-2">Nguy cơ</th>
              <th className="p-2">Đúng hạn%</th>
              <th className="p-2">Điểm*</th>
            </tr>
          </thead>
          <tbody>
            {q.data!.groups.map((g) => (
              <tr key={g.id} className="border-b last:border-0">
                <td className="p-2 font-medium">{g.name}</td>
                <td className="p-2">{g.counts.inProgress}</td>
                <td className="p-2">{g.counts.pendingReview}</td>
                <td className="p-2">{g.counts.overdue}</td>
                <td className="p-2">{g.counts.done}</td>
                <td className="p-2">{g.counts.atRisk}</td>
                <td className="p-2">{g.workload?.onTimeRate ?? g.counts.onTimeRate ?? '—'}</td>
                <td className="p-2">{g.workload?.score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        * Điểm workload kết hợp tỷ lệ đúng hạn, ưu tiên, độ khớp thời gian dự kiến/thực tế và quá
        hạn — không chỉ số lượng hoàn thành.
      </p>
    </div>
  );
}

export function WorkCalendarPageInner() {
  const t = useT();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [view, setView] = useState<'week' | 'month'>('week');
  const range = useMemo(() => {
    const base = new Date(`${today}T00:00:00`);
    if (view === 'week') {
      const from = new Date(base);
      from.setDate(base.getDate() - base.getDay() + 1);
      const to = new Date(from);
      to.setDate(from.getDate() + 6);
      return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      };
    }
    const from = new Date(base.getFullYear(), base.getMonth(), 1);
    const to = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, [today, view]);

  const q = useQuery({
    queryKey: ['work-management', 'calendar', range.from, range.to],
    queryFn: () =>
      apiClient<{
        events: Array<BucketTask & { date: string | null }>;
        timezone: string;
      }>(`/work-management/calendar?from=${range.from}&to=${range.to}`),
  });

  const byDate = useMemo(() => {
    const m = new Map<string, BucketTask[]>();
    for (const e of q.data?.events ?? []) {
      if (!e.date) continue;
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [q.data]);

  const days: string[] = [];
  {
    const cur = new Date(`${range.from}T00:00:00`);
    const end = new Date(`${range.to}T00:00:00`);
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('work.calendar')} description={t('work.calendarDesc')} />
      <SubNav />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={view === 'week' ? 'default' : 'outline'}
          onClick={() => setView('week')}
        >
          Tuần
        </Button>
        <Button
          size="sm"
          variant={view === 'month' ? 'default' : 'outline'}
          onClick={() => setView('month')}
        >
          Tháng
        </Button>
        <span className="text-sm text-muted-foreground self-center">
          {range.from} → {range.to}
        </span>
      </div>
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState onRetry={q.refetch} />}
      <div
        className={cn(
          'grid gap-2',
          view === 'week'
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-7'
            : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7',
        )}
      >
        {days.map((d) => (
          <div key={d} className="rounded-lg border p-2 min-h-[100px]">
            <p className={cn('text-xs font-medium mb-1', d === today && 'text-primary')}>{d}</p>
            <ul className="space-y-1">
              {(byDate.get(d) ?? []).map((t) => (
                <li key={t.id} className="text-[11px] leading-snug rounded bg-muted/50 px-1 py-0.5">
                  {t.title}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
