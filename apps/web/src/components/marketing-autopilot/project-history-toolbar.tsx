'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  MarketingAutopilotProjectFilterOptions,
  MarketingAutopilotProjectListQuery,
  ProjectDatePreset,
  ProjectQuickFilter,
  ProjectSortOption,
} from '@/types/marketing-autopilot';

const DATE_PRESET_LABELS: { value: string; label: string }[] = [
  { value: 'all', label: 'Mọi thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: 'this_year', label: 'Năm nay' },
  { value: 'custom', label: 'Tùy chọn' },
];

const SORT_LABELS: Record<ProjectSortOption, string> = {
  newest: 'Mới nhất',
  oldest: 'Cũ nhất',
  budget: 'Ngân sách',
  name: 'Tên',
};

type Props = {
  query: MarketingAutopilotProjectListQuery;
  filterOptions?: MarketingAutopilotProjectFilterOptions;
  onChange: (patch: Partial<MarketingAutopilotProjectListQuery>) => void;
  onReset: () => void;
};

export function ProjectHistoryToolbar({ query, filterOptions, onChange, onReset }: Props) {
  const [searchDraft, setSearchDraft] = useState(query.q ?? '');

  useEffect(() => {
    setSearchDraft(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchDraft.trim();
      if ((query.q ?? '') !== trimmed) {
        onChange({ q: trimmed || undefined, page: 1 });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, onChange, query.q]);

  const hasFilters = useMemo(
    () =>
      Boolean(
        query.q ||
          query.datePreset ||
          query.status ||
          query.goal ||
          query.product ||
          query.budgetMin != null ||
          query.budgetMax != null ||
          query.quickFilter,
      ),
    [query],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Tìm project / sản phẩm..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </div>

        <Select
          value={query.datePreset ?? 'all'}
          onValueChange={(v) =>
            onChange({
              datePreset: v === 'all' ? undefined : (v as ProjectDatePreset),
              dateFrom: v === 'custom' ? query.dateFrom : undefined,
              dateTo: v === 'custom' ? query.dateTo : undefined,
              page: 1,
            })
          }
        >
          <SelectTrigger className="h-9 w-[130px]">
            <SelectValue placeholder="Thời gian" />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESET_LABELS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {query.datePreset === 'custom' ? (
          <>
            <Input
              type="date"
              className="h-9 w-[140px]"
              value={query.dateFrom ?? ''}
              onChange={(e) => onChange({ dateFrom: e.target.value || undefined, page: 1 })}
            />
            <Input
              type="date"
              className="h-9 w-[140px]"
              value={query.dateTo ?? ''}
              onChange={(e) => onChange({ dateTo: e.target.value || undefined, page: 1 })}
            />
          </>
        ) : null}

        <Select
          value={query.status ?? 'all'}
          onValueChange={(v) => onChange({ status: v === 'all' ? undefined : v, page: 1 })}
        >
          <SelectTrigger className="h-9 w-[130px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {(filterOptions?.statuses ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.goal ?? 'all'}
          onValueChange={(v) => onChange({ goal: v === 'all' ? undefined : v, page: 1 })}
        >
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue placeholder="Mục tiêu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi mục tiêu</SelectItem>
            {(filterOptions?.goals ?? []).map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.product ?? 'all'}
          onValueChange={(v) => onChange({ product: v === 'all' ? undefined : v, page: 1 })}
        >
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue placeholder="Sản phẩm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi sản phẩm</SelectItem>
            {(filterOptions?.products ?? []).map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          className="h-9 w-[100px]"
          placeholder="NS từ"
          min={0}
          value={query.budgetMin ?? ''}
          onChange={(e) =>
            onChange({
              budgetMin: e.target.value ? Number(e.target.value) : undefined,
              page: 1,
            })
          }
        />
        <Input
          type="number"
          className="h-9 w-[100px]"
          placeholder="NS đến"
          min={0}
          value={query.budgetMax ?? ''}
          onChange={(e) =>
            onChange({
              budgetMax: e.target.value ? Number(e.target.value) : undefined,
              page: 1,
            })
          }
        />

        <Select
          value={query.sort ?? 'newest'}
          onValueChange={(v) => onChange({ sort: v as ProjectSortOption, page: 1 })}
        >
          <SelectTrigger className="h-9 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as ProjectSortOption[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onReset}>
            <X className="mr-1 h-3.5 w-3.5" />
            Xóa lọc
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={query.quickFilter === 'running' ? 'default' : 'outline'}
          className="h-8"
          onClick={() =>
            onChange({
              quickFilter: (query.quickFilter === 'running' ? undefined : 'running') as ProjectQuickFilter,
              page: 1,
            })
          }
        >
          Đang chạy
        </Button>
        <Button
          type="button"
          size="sm"
          variant={query.quickFilter === 'needs_approval' ? 'default' : 'outline'}
          className="h-8"
          onClick={() =>
            onChange({
              quickFilter:
                query.quickFilter === 'needs_approval' ? undefined : ('needs_approval' as ProjectQuickFilter),
              page: 1,
            })
          }
        >
          Cần duyệt
        </Button>
      </div>
    </div>
  );
}
