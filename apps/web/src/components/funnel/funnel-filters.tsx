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
import { useT } from '@/i18n/i18n-provider';

interface FunnelFilterBarProps {
  filters: FunnelFilters;
  onChange: (f: FunnelFilters) => void;
  leadSources?: { id: string; name: string }[];
  funnels?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
  employees?: { id: string; name: string }[];
  campaigns?: { id: string; name: string }[];
  advanced?: boolean;
}

export function FunnelFilterBar({
  filters,
  onChange,
  leadSources = [],
  funnels = [],
  branches = [],
  employees = [],
  campaigns = [],
  advanced = false,
}: FunnelFilterBarProps) {
  const t = useT();
  const hasExtra =
    filters.leadSourceId ||
    filters.funnelRecommendationId ||
    filters.assignedToId ||
    filters.branchId ||
    filters.adCampaignId ||
    filters.utmSource ||
    filters.utmMedium ||
    filters.utmCampaign;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">{t('funnel.dateFrom')}</Label>
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('funnel.dateTo')}</Label>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Funnel</Label>
          <Select
            value={filters.funnelRecommendationId || 'all'}
            onValueChange={(v) =>
              onChange({ ...filters, funnelRecommendationId: v === 'all' ? '' : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('common.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('funnel.allFunnels')}</SelectItem>
              {funnels.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('funnel.customerSource')}</Label>
          <Select
            value={filters.leadSourceId || 'all'}
            onValueChange={(v) => onChange({ ...filters, leadSourceId: v === 'all' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('common.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('funnel.allSources')}</SelectItem>
              {leadSources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {advanced && (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Attribution</Label>
            <Select
              value={filters.touchModel}
              onValueChange={(v) =>
                onChange({ ...filters, touchModel: v as FunnelFilters['touchModel'] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last">Last Touch</SelectItem>
                <SelectItem value="first">First Touch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('funnel.adCampaign')}</Label>
            <Select
              value={filters.adCampaignId || 'all'}
              onValueChange={(v) => onChange({ ...filters, adCampaignId: v === 'all' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('common.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('funnel.allCampaigns')}</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('funnel.saleStaff')}</Label>
            <Select
              value={filters.assignedToId || 'all'}
              onValueChange={(v) => onChange({ ...filters, assignedToId: v === 'all' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('common.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('funnel.allStaff')}</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('funnel.branch')}</Label>
            <Select
              value={filters.branchId || 'all'}
              onValueChange={(v) => onChange({ ...filters, branchId: v === 'all' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('common.all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('funnel.allBranches')}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">UTM Source</Label>
            <Input
              placeholder="facebook, google…"
              value={filters.utmSource}
              onChange={(e) => onChange({ ...filters, utmSource: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">UTM Medium</Label>
            <Input
              placeholder="cpc, email…"
              value={filters.utmMedium}
              onChange={(e) => onChange({ ...filters, utmMedium: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">UTM Campaign</Label>
            <Input
              placeholder="summer-promo…"
              value={filters.utmCampaign}
              onChange={(e) => onChange({ ...filters, utmCampaign: e.target.value })}
            />
          </div>
        </div>
      )}

      {hasExtra && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() =>
            onChange({
              ...filters,
              leadSourceId: '',
              funnelRecommendationId: '',
              assignedToId: '',
              branchId: '',
              adCampaignId: '',
              utmSource: '',
              utmMedium: '',
              utmCampaign: '',
            })
          }
        >
          <X className="mr-1 h-4 w-4" />
          {t('common.clearFilters')}
        </Button>
      )}
    </div>
  );
}
