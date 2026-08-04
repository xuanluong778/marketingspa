'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Calculator,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AdPerformanceInsightsSidebar } from '@/components/business-goals/ad-performance-insights';
import { AdPerformanceFacebookConnect } from '@/components/business-goals/ad-performance-facebook-connect';
import { AdPerformanceKpiSection } from '@/components/business-goals/ad-performance-kpi';
import { MoneyInput } from '@/components/business-goals/money-input';
import { PercentInput, CountInput } from '@/components/business-goals/percent-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatVnd } from '@/lib/format';
import {
  AD_CAMPAIGN_TYPE_OPTIONS,
  createEmptyCampaignRow,
  defaultAdPerformanceFormState,
  loadAdPerformanceDraft,
  sampleAdPerformanceFormState,
  saveAdPerformanceDraft,
} from '@/lib/ad-performance-form';
import {
  calculateAdPerformanceMetrics,
  validateAdPerformanceInput,
  type AdPerformanceFieldErrors,
} from '@/lib/ad-performance-metrics';
import type { AdCampaignRow, AdPerformanceFormState } from '@/types/ad-performance';
import type { FacebookSyncedCampaign } from '@/types/facebook-ads';
import { facebookCampaignsToFormRows } from '@/lib/facebook-ads-to-form';
import { useCurrentUser } from '@/hooks/use-auth';

const INPUT_CELL =
  'h-8 bg-amber-50 border-amber-200 text-slate-900 text-xs placeholder:text-slate-400 focus-visible:ring-amber-400 md:text-sm';
const RESULT_CELL = 'bg-slate-50 text-slate-700 text-xs font-medium tabular-nums md:text-sm';

function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
}

function EmptyState({ onSample }: { onSample: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50">
        <BarChart3 className="h-7 w-7 text-violet-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">Chưa có dữ liệu quảng cáo</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Thêm chiến dịch và nhập số liệu kinh doanh — hệ thống tự tính ROAS, lãi/lỗ và insight chiến
        dịch.
      </p>
      <Button type="button" className="mt-6" onClick={onSample}>
        <Sparkles className="mr-2 h-4 w-4" />
        Dùng dữ liệu mẫu
      </Button>
    </div>
  );
}

export function AdPerformancePanel() {
  const { data: user } = useCurrentUser();
  const userId = user?.id;

  const [formState, setFormState] = useState<AdPerformanceFormState>(defaultAdPerformanceFormState);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [errors, setErrors] = useState<AdPerformanceFieldErrors>({});
  const [draftSaved, setDraftSaved] = useState(false);
  const lastFacebookImportRef = useRef('');
  const searchParams = useSearchParams();

  const oauthMessage = useMemo(() => {
    const fb = searchParams.get('facebook');
    if (fb === 'connected')
      return 'Kết nối Facebook Ads thành công! Chọn tài khoản quảng cáo và đồng bộ.';
    if (fb === 'error') {
      const msg = searchParams.get('message');
      return msg ? `Kết nối thất bại: ${decodeURIComponent(msg)}` : 'Kết nối Facebook thất bại.';
    }
    return null;
  }, [searchParams]);

  const metrics = useMemo(() => calculateAdPerformanceMetrics(formState), [formState]);

  useEffect(() => {
    const draft = loadAdPerformanceDraft(userId);
    if (draft) setFormState(draft);
    setDraftLoaded(true);
  }, [userId]);

  const updateCampaign = useCallback((index: number, patch: Partial<AdCampaignRow>) => {
    setFormState((prev) => ({
      ...prev,
      campaigns: prev.campaigns.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }, []);

  const updateBusiness = useCallback((patch: Partial<AdPerformanceFormState['business']>) => {
    setFormState((prev) => ({
      ...prev,
      business: { ...prev.business, ...patch },
    }));
  }, []);

  const handleCalculate = useCallback(() => {
    const validation = validateAdPerformanceInput(formState);
    setErrors(validation);
  }, [formState]);

  const handleReset = useCallback(() => {
    setFormState(defaultAdPerformanceFormState);
    setErrors({});
  }, []);

  const handleSample = useCallback(() => {
    setFormState(sampleAdPerformanceFormState);
    setErrors({});
  }, []);

  const handleSaveDraft = useCallback(() => {
    saveAdPerformanceDraft(formState, userId);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  }, [formState, userId]);

  const addCampaign = useCallback(() => {
    setFormState((prev) => ({
      ...prev,
      campaigns: [...prev.campaigns, createEmptyCampaignRow()],
    }));
  }, []);

  const removeCampaign = useCallback((index: number) => {
    setFormState((prev) => ({
      ...prev,
      campaigns:
        prev.campaigns.length <= 1
          ? [createEmptyCampaignRow()]
          : prev.campaigns.filter((_, i) => i !== index),
    }));
  }, []);

  const handleImportFacebookCampaigns = useCallback((campaigns: FacebookSyncedCampaign[]) => {
    if (!campaigns.length) return;
    const key = campaigns.map((c) => `${c.campaignId}:${c.syncedAt}:${c.spend}`).join('|');
    if (key === lastFacebookImportRef.current) return;
    lastFacebookImportRef.current = key;
    const rows = facebookCampaignsToFormRows(campaigns);
    setFormState((prev) => ({ ...prev, campaigns: rows }));
  }, []);

  if (!draftLoaded) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Đang tải dữ liệu nháp…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdPerformanceFacebookConnect
        onImportCampaigns={handleImportFacebookCampaigns}
        oauthMessage={oauthMessage}
      />

      {!metrics.hasInput && <EmptyState onSample={handleSample} />}

      {metrics.hasInput && <AdPerformanceKpiSection metrics={metrics} />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Chiến dịch quảng cáo</h2>
          <p className="mt-0.5 text-xs text-slate-600">Ô vàng = nhập liệu · Ô xám = tự tính</p>
        </div>
        <div className="p-2 sm:p-3">
          <table className="w-full table-fixed text-xs md:text-sm">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[3%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-800 text-left text-white">
                <th className="px-1.5 py-2 font-medium md:px-2">Tên chiến dịch</th>
                <th className="px-1.5 py-2 font-medium md:px-2">Loại</th>
                <th className="px-1.5 py-2 font-medium md:px-2">Ngân sách</th>
                <th className="px-1.5 py-2 font-medium md:px-2">CPM</th>
                <th className="px-1.5 py-2 font-medium md:px-2">Tỷ lệ KQ</th>
                <th className="px-1.5 py-2 font-medium md:px-2">Tần suất</th>
                <th className="px-1.5 py-2 font-medium md:px-2">Kết quả</th>
                <th className="px-1.5 py-2 font-medium md:px-2">Hiển thị</th>
                <th className="px-1.5 py-2 font-medium md:px-2">CP/KQ</th>
                <th className="px-1.5 py-2 font-medium md:px-2">Tiếp cận</th>
                <th className="px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {formState.campaigns.map((row, index) => {
                const calc = metrics.campaigns[index]?.calculated;
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="p-1 md:p-1.5">
                      <Input
                        value={row.name}
                        placeholder="Ví dụ: Quảng cáo bán hàng"
                        className={cn(INPUT_CELL, 'min-w-0')}
                        onChange={(e) => updateCampaign(index, { name: e.target.value })}
                      />
                    </td>
                    <td className="p-1 md:p-1.5">
                      <Select
                        value={row.campaignType}
                        onValueChange={(v) =>
                          updateCampaign(index, {
                            campaignType: v as AdCampaignRow['campaignType'],
                          })
                        }
                      >
                        <SelectTrigger className={cn(INPUT_CELL, 'min-w-0 w-full truncate')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AD_CAMPAIGN_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1 md:p-1.5">
                      <MoneyInput
                        value={row.adBudget}
                        placeholder="150.000.000"
                        className={cn(INPUT_CELL, 'min-w-0')}
                        onChange={(v) => updateCampaign(index, { adBudget: v })}
                      />
                    </td>
                    <td className="p-1 md:p-1.5">
                      <MoneyInput
                        value={row.cpm}
                        placeholder="20.000"
                        className={cn(INPUT_CELL, 'min-w-0')}
                        onChange={(v) => updateCampaign(index, { cpm: v })}
                      />
                    </td>
                    <td className="p-1 md:p-1.5">
                      <PercentInput
                        value={row.resultRate}
                        max={100}
                        placeholder="30"
                        className={cn(INPUT_CELL, 'min-w-0')}
                        onChange={(v) => updateCampaign(index, { resultRate: v })}
                      />
                    </td>
                    <td className="p-1 md:p-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.frequency || ''}
                        placeholder="1.5"
                        className={cn(INPUT_CELL, 'min-w-0')}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          updateCampaign(index, {
                            frequency: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                          });
                        }}
                      />
                    </td>
                    <td className={cn('truncate p-1 md:p-1.5', RESULT_CELL)}>
                      {formatCount(calc?.resultCount ?? 0)}
                    </td>
                    <td className={cn('truncate p-1 md:p-1.5', RESULT_CELL)}>
                      {formatCount(calc?.impressions ?? 0)}
                    </td>
                    <td className={cn('truncate p-1 md:p-1.5', RESULT_CELL)}>
                      {calc && calc.costPerResult > 0 ? formatVnd(calc.costPerResult) : '—'}
                    </td>
                    <td className={cn('truncate p-1 md:p-1.5', RESULT_CELL)}>
                      {formatCount(calc?.reachPeople ?? 0)}
                    </td>
                    <td className="p-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => removeCampaign(index)}
                        aria-label="Xóa dòng"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t bg-slate-50 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={addCampaign}>
            <Plus className="mr-1.5 h-4 w-4" />
            Thêm chiến dịch
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b bg-slate-50 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Dữ liệu kinh doanh</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Nhập giá trị đơn, tỷ suất lợi nhuận và số đơn thực tế
            </p>
          </div>
          <div className="grid gap-4 p-4">
            <div className="space-y-1.5">
              <Label className="text-slate-700">Giá trị trung bình/đơn hàng</Label>
              <MoneyInput
                value={formState.business.averageOrderValue}
                placeholder="Ví dụ: 2.000.000"
                className={INPUT_CELL}
                onChange={(v) => updateBusiness({ averageOrderValue: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-700">Tỷ suất lợi nhuận gộp</Label>
              <PercentInput
                value={formState.business.grossProfitRate}
                placeholder="Ví dụ: 50"
                className={INPUT_CELL}
                onChange={(v) => updateBusiness({ grossProfitRate: v })}
              />
              <p className="text-xs text-slate-500">
                % lãi gộp trên doanh thu mỗi đơn sau khi trừ giá vốn hàng/dịch vụ.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  id="manual-orders"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={formState.business.useManualOrderCount}
                  onChange={(e) => updateBusiness({ useManualOrderCount: e.target.checked })}
                />
                <Label htmlFor="manual-orders" className="text-slate-700">
                  Số đơn hàng thực tế (nhập tay)
                </Label>
              </div>
              <CountInput
                value={formState.business.manualOrderCount}
                placeholder="Ví dụ: 1.598"
                disabled={!formState.business.useManualOrderCount}
                className={cn(INPUT_CELL, !formState.business.useManualOrderCount && 'opacity-50')}
                onChange={(v) => updateBusiness({ manualOrderCount: v })}
              />
              <p className="text-xs text-slate-500">
                Bỏ chọn để lấy từ chiến dịch &quot;Quảng cáo bán hàng&quot; hoặc lead × tỷ lệ chốt
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-700">Tỷ lệ chốt lead (nếu có)</Label>
              <PercentInput
                value={formState.business.leadCloseRate}
                placeholder="Ví dụ: 20"
                className={INPUT_CELL}
                onChange={(v) => updateBusiness({ leadCloseRate: v })}
              />
              <p className="text-xs text-slate-500">
                % lead/inbox được chốt thành đơn hàng — dùng khi chưa có chiến dịch bán hàng.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-700">Chi phí khác (nếu có)</Label>
              <MoneyInput
                value={formState.business.otherCost}
                placeholder="Ví dụ: 5.000.000"
                className={INPUT_CELL}
                onChange={(v) => updateBusiness({ otherCost: v })}
              />
              <p className="text-xs text-slate-500">
                Chi phí ngoài quảng cáo: lương sale, thuê mặt bằng, vật tư, phần mềm… trong kỳ tính.
              </p>
            </div>
          </div>

          {metrics.hasInput && (
            <div className="border-t bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Số đơn dùng tính:{' '}
              <span className="font-semibold text-slate-900 tabular-nums">
                {new Intl.NumberFormat('vi-VN').format(metrics.totalOrders)}
              </span>
              {' · '}
              Lãi/đơn:{' '}
              <span className="font-semibold text-slate-900 tabular-nums">
                {formatVnd(metrics.profitPerOrder)}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          {metrics.hasInput ? (
            <AdPerformanceInsightsSidebar metrics={metrics} />
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Nhập dữ liệu hoặc dùng mẫu để xem insight và cảnh báo chiến dịch.
            </div>
          )}
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {Object.values(errors).filter(Boolean).join(' · ')}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" onClick={handleCalculate} className="sm:flex-1">
          <Calculator className="mr-2 h-4 w-4" />
          Tính toán
        </Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reset
        </Button>
        <Button type="button" variant="outline" onClick={handleSaveDraft}>
          <Save className="mr-2 h-4 w-4" />
          {draftSaved ? 'Đã lưu nháp!' : 'Lưu nháp'}
        </Button>
        <Button type="button" variant="secondary" onClick={handleSample}>
          <Sparkles className="mr-2 h-4 w-4" />
          Dùng dữ liệu mẫu
        </Button>
      </div>
    </div>
  );
}
