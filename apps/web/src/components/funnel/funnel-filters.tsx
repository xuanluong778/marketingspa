'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { FunnelFilters } from '@/types/funnel';

interface FunnelFilterBarProps {
  filters: FunnelFilters;
  onChange: (f: FunnelFilters) => void;
  leadSources?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
  employees?: { id: string; name: string }[];
  campaigns?: { id: string; name: string }[];
}

export function FunnelFilterBar({
  filters,
  onChange,
  leadSources = [],
  branches = [],
  employees = [],
  campaigns = [],
}: FunnelFilterBarProps) {
  const hasExtra =
    filters.leadSourceId || filters.assignedToId || filters.branchId || filters.adCampaignId;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border bg-card mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nguồn lead</Label>
          <Select
            value={filters.leadSourceId || 'all'}
            onValueChange={(v) => onChange({ ...filters, leadSourceId: v === 'all' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
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
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chiến dịch ads</Label>
          <Select
            value={filters.adCampaignId || 'all'}
            onValueChange={(v) => onChange({ ...filters, adCampaignId: v === 'all' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chiến dịch</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nhân viên</Label>
          <Select
            value={filters.assignedToId || 'all'}
            onValueChange={(v) => onChange({ ...filters, assignedToId: v === 'all' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả NV</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chi nhánh</Label>
          <Select
            value={filters.branchId || 'all'}
            onValueChange={(v) => onChange({ ...filters, branchId: v === 'all' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tất cả" />
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
        </div>
      </div>
      {hasExtra && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() =>
            onChange({
              ...filters,
              leadSourceId: '',
              assignedToId: '',
              branchId: '',
              adCampaignId: '',
            })
          }
        >
          <X className="h-4 w-4 mr-1" />
          Xóa bộ lọc
        </Button>
      )}
    </div>
  );
}
