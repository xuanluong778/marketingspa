'use client';

import { useEffect, useState } from 'react';
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

export interface CrmFilters {
  search: string;
  tag: string;
  leadSourceId: string;
  branchId: string;
}

interface CrmFilterBarProps {
  filters: CrmFilters;
  onChange: (filters: CrmFilters) => void;
  leadSources?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
  showTag?: boolean;
  placeholder?: string;
}

export function CrmFilterBar({
  filters,
  onChange,
  leadSources = [],
  branches = [],
  showTag = true,
  placeholder = 'Tìm theo tên hoặc SĐT...',
}: CrmFilterBarProps) {
  const [search, setSearch] = useState(filters.search);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) onChange({ ...filters, search });
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters, onChange]);

  const hasFilters = filters.tag || filters.leadSourceId || filters.branchId || filters.search;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center mb-4">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {showTag && (
        <Input
          className="w-full sm:w-[140px]"
          placeholder="Lọc tag"
          value={filters.tag}
          onChange={(e) => onChange({ ...filters, tag: e.target.value })}
        />
      )}
      <Select
        value={filters.leadSourceId || 'all'}
        onValueChange={(v) => onChange({ ...filters, leadSourceId: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Nguồn khách" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả nguồn</SelectItem>
          {leadSources.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.branchId || 'all'}
        onValueChange={(v) => onChange({ ...filters, branchId: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Chi nhánh" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả chi nhánh</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch('');
            onChange({ search: '', tag: '', leadSourceId: '', branchId: '' });
          }}
        >
          <X className="h-4 w-4 mr-1" />
          Xóa lọc
        </Button>
      )}
    </div>
  );
}
