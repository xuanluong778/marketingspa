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
import { CUSTOMER_SOURCE_OPTIONS } from '@/lib/customer-source-label';
import { useT } from '@/i18n/i18n-provider';

export interface CrmFilters {
  search: string;
  tag: string;
  leadSourceId: string;
  branchId: string;
  /** Canonical Customer 360 source code (crm_manual, funnel_form, …). */
  source?: string;
}

interface CrmFilterBarProps {
  filters: CrmFilters;
  onChange: (filters: CrmFilters) => void;
  /** Customer 360 canonical sources (API); falls back to static catalog when empty. */
  customerSources?: { code: string; label: string }[];
  branches?: { id: string; name: string }[];
  showTag?: boolean;
  placeholder?: string;
}

export function CrmFilterBar({
  filters,
  onChange,
  customerSources = [],
  branches = [],
  showTag = true,
  placeholder,
}: CrmFilterBarProps) {
  const t = useT();
  const [search, setSearch] = useState(filters.search);
  const searchPlaceholder = placeholder ?? t('crm.searchPlaceholder');
  const sourceOptions = customerSources.length > 0 ? customerSources : CUSTOMER_SOURCE_OPTIONS;

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.search) onChange({ ...filters, search });
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters, onChange]);

  const hasFilters =
    filters.tag || filters.leadSourceId || filters.branchId || filters.source || filters.search;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center mb-4">
      <div className="relative min-w-0 w-full flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {showTag && (
        <Input
          className="w-full sm:w-[140px]"
          placeholder={t('crm.filterTag')}
          value={filters.tag}
          onChange={(e) => onChange({ ...filters, tag: e.target.value })}
        />
      )}
      <Select
        value={filters.source || 'all'}
        onValueChange={(v) => onChange({ ...filters, source: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[180px]" data-testid="customer-source-filter">
          <SelectValue placeholder={t('crm.source')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('crm.allSources')}</SelectItem>
          {sourceOptions.map((s) => (
            <SelectItem key={s.code} value={s.code}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.branchId || 'all'}
        onValueChange={(v) => onChange({ ...filters, branchId: v === 'all' ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder={t('crm.branch')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('crm.allBranches')}</SelectItem>
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
            onChange({ search: '', tag: '', leadSourceId: '', branchId: '', source: '' });
          }}
        >
          <X className="h-4 w-4 mr-1" />
          {t('common.clearFilters')}
        </Button>
      )}
    </div>
  );
}
