'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
} from 'lucide-react';
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
import { useCurrentUser } from '@/hooks/use-auth';

const INPUT_CELL =
  'bg-amber-50 border-amber-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-amber-400';
const RESULT_CELL = 'bg-slate-50 text-slate-700 font-medium tabular-nums';

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)}%`;
}

function AdPerformanceHero({
  status,
  profitAfterAds,
}: {
  status: 'profit' | 'loss' | 'break_even';
  profitAfterAds: number;
}) {
  const config = {
    profit: {
      bg: 'bg-emerald-600',
      icon: TrendingUp,
      text: `LÃI RỒI! +${formatVnd(Math.abs(profitAfterAds))}`,
    },
    loss: {
      bg: 'bg-red-600',
      icon: TrendingDown,
      text: `ĐANG LỖ -${formatVnd(Math.abs(profitAfterAds))}`,
    },
    break_even: {
      bg: 'bg-orange-500',
      icon: Minus,
      text: 'HÒA VỐN',
    },
  }[status];

  const Icon = config.icon;

  return (
    <div className={cn('rounded-2xl px-6 py-8 text-center text-white shadow-lg', config.bg)}>
      <div className="flex items-center justify-center gap-3">
        <Icon className="h-8 w-8 shrink-0" />
        <p className="text-2xl font-bold tracking-tight sm:text-3xl">{config.text}</p>
      </div>
      <p className="mt-2 text-sm text-white/85">Kết luận lãi / lỗ sau quảng cáo</p>
    </div>
  );
}

export function AdPerformancePanel() {
  const { data: user } = useCurrentUser();
  const userId = user?.id;

  const [formState, setFormState] = useState<AdPerformanceFormState>(defaultAdPerformanceFormState);
  const [calculated, setCalculated] = useState(false);
  const [errors, setErrors] = useState<AdPerformanceFieldErrors>({});
  const [draftSaved, setDraftSaved] = useState(false);

  const metrics = useMemo(() => calculateAdPerformanceMetrics(formState), [formState]);

  useEffect(() => {
    const draft = loadAdPerformanceDraft(userId);
    if (draft) setFormState(draft);
  }, [userId]);

  const updateCampaign = useCallback((index: number, patch: Partial<AdCampaignRow>) => {
    setFormState((prev) => ({
      ...prev,
      campaigns: prev.campaigns.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
    setCalculated(false);
  }, []);

  const handleCalculate = useCallback(() => {
    const validation = validateAdPerformanceInput(formState);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setCalculated(true);
  }, [formState]);

  const handleReset = useCallback(() => {
    setFormState(defaultAdPerformanceFormState);
    setErrors({});
    setCalculated(false);
  }, []);

  const handleSample = useCallback(() => {
    setFormState(sampleAdPerformanceFormState);
    setErrors({});
    setCalculated(true);
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
    setCalculated(false);
  }, []);

  const removeCampaign = useCallback((index: number) => {
    setFormState((prev) => ({
      ...prev,
      campaigns:
        prev.campaigns.length <= 1
          ? [createEmptyCampaignRow()]
          : prev.campaigns.filter((_, i) => i !== index),
    }));
    setCalculated(false);
  }, []);

  const displayMetrics = calculated ? metrics : null;

  return (
    <div className="space-y-5">
      {displayMetrics && (
        <AdPerformanceHero
          status={displayMetrics.status}
          profitAfterAds={displayMetrics.profitAfterAds}
        />
      )}

      <div className="rounded-xl border border-white/10 bg-white shadow-sm overflow-hidden">
        <div className="border-b bg-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Bảng nhập liệu chiến dịch quảng cáo</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Ô vàng là dữ liệu nhập — ô xám là kết quả tự tính
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Tên chiến dịch</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Loại chiến dịch</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Ngân sách</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Giá/CPM</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Tỷ lệ kết quả</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Tần suất</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Kết quả</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Lượt hiển thị</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Chi phí/kết quả</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Số người tiếp cận</th>
                <th className="px-3 py-2.5 font-medium w-12" />
              </tr>
            </thead>
            <tbody>
              {formState.campaigns.map((row, index) => {
                const calc = displayMetrics?.campaigns[index]?.calculated;
                return (
                  <tr key={row.id} className="border-b border-slate-200">
                    <td className="p-2 min-w-[160px]">
                      <Input
                        value={row.name}
                        placeholder="Ví dụ: Quảng cáo bán hàng"
                        className={INPUT_CELL}
                        onChange={(e) => updateCampaign(index, { name: e.target.value })}
                      />
                    </td>
                    <td className="p-2 min-w-[180px]">
                      <Select
                        value={row.campaignType}
                        onValueChange={(v) =>
                          updateCampaign(index, {
                            campaignType: v as AdCampaignRow['campaignType'],
                          })
                        }
                      >
                        <SelectTrigger className={INPUT_CELL}>
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
                    <td className="p-2 min-w-[140px]">
                      <MoneyInput
                        value={row.adBudget}
                        placeholder="Ví dụ: 150.000.000"
                        className={INPUT_CELL}
                        onChange={(v) => updateCampaign(index, { adBudget: v })}
                      />
                    </td>
                    <td className="p-2 min-w-[130px]">
                      <MoneyInput
                        value={row.cpm}
                        placeholder="Ví dụ: 20.000"
                        className={INPUT_CELL}
                        onChange={(v) => updateCampaign(index, { cpm: v })}
                      />
                    </td>
                    <td className="p-2 min-w-[120px]">
                      <PercentInput
                        value={row.resultRate}
                        max={100}
                        placeholder="Ví dụ: 30"
                        className={INPUT_CELL}
                        onChange={(v) => updateCampaign(index, { resultRate: v })}
                      />
                    </td>
                    <td className="p-2 min-w-[100px]">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.frequency || ''}
                        placeholder="Ví dụ: 1.5"
                        className={INPUT_CELL}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          updateCampaign(index, {
                            frequency: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                          });
                        }}
                      />
                    </td>
                    <td className={cn('p-2 whitespace-nowrap', RESULT_CELL)}>
                      {calc ? formatCount(calc.resultCount) : '—'}
                    </td>
                    <td className={cn('p-2 whitespace-nowrap', RESULT_CELL)}>
                      {calc ? formatCount(calc.impressions) : '—'}
                    </td>
                    <td className={cn('p-2 whitespace-nowrap', RESULT_CELL)}>
                      {calc ? formatVnd(calc.costPerResult) : '—'}
                    </td>
                    <td className={cn('p-2 whitespace-nowrap', RESULT_CELL)}>
                      {calc ? formatCount(calc.reachPeople) : '—'}
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeCampaign(index)}
                        aria-label="Xóa dòng"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t bg-slate-50">
          <Button type="button" variant="outline" size="sm" onClick={addCampaign}>
            <Plus className="h-4 w-4 mr-1.5" />
            Thêm chiến dịch
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white shadow-sm overflow-hidden">
        <div className="border-b bg-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Bảng kết quả kinh doanh</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <tbody>
              <tr className="border-b">
                <td className="p-3 font-medium text-slate-700 w-1/2">Giá/đơn hàng</td>
                <td className="p-2 w-1/2">
                  <MoneyInput
                    value={formState.business.averageOrderValue}
                    placeholder="Ví dụ: 2.000.000"
                    className={INPUT_CELL}
                    onChange={(v) => {
                      setFormState((prev) => ({
                        ...prev,
                        business: { ...prev.business, averageOrderValue: v },
                      }));
                      setCalculated(false);
                    }}
                  />
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-3 font-medium text-slate-700">Tỷ suất lợi nhuận gộp</td>
                <td className="p-2">
                  <PercentInput
                    value={formState.business.grossProfitRate}
                    placeholder="Ví dụ: 50"
                    className={INPUT_CELL}
                    onChange={(v) => {
                      setFormState((prev) => ({
                        ...prev,
                        business: { ...prev.business, grossProfitRate: v },
                      }));
                      setCalculated(false);
                    }}
                  />
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-3 font-medium text-slate-700">
                  <div className="flex items-center gap-2">
                    <input
                      id="manual-orders"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={formState.business.useManualOrderCount}
                      onChange={(e) => {
                        setFormState((prev) => ({
                          ...prev,
                          business: {
                            ...prev.business,
                            useManualOrderCount: e.target.checked,
                          },
                        }));
                        setCalculated(false);
                      }}
                    />
                    <Label htmlFor="manual-orders" className="font-medium text-slate-700">
                      Số đơn hàng (nhập thủ công)
                    </Label>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-normal">
                    Bỏ chọn để tự lấy từ chiến dịch &quot;Quảng cáo bán hàng&quot;
                  </p>
                </td>
                <td className="p-2">
                  <CountInput
                    value={formState.business.manualOrderCount}
                    placeholder="Ví dụ: 1.598"
                    disabled={!formState.business.useManualOrderCount}
                    className={cn(
                      INPUT_CELL,
                      !formState.business.useManualOrderCount && 'opacity-50',
                    )}
                    onChange={(v) => {
                      setFormState((prev) => ({
                        ...prev,
                        business: { ...prev.business, manualOrderCount: v },
                      }));
                      setCalculated(false);
                    }}
                  />
                </td>
              </tr>
              <tr className="border-b">
                <td className="p-3 font-medium text-slate-700">
                  <div className="flex items-center gap-2">
                    <input
                      id="manual-ad-spend"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={formState.business.useManualTotalAdSpend}
                      onChange={(e) => {
                        setFormState((prev) => ({
                          ...prev,
                          business: {
                            ...prev.business,
                            useManualTotalAdSpend: e.target.checked,
                          },
                        }));
                        setCalculated(false);
                      }}
                    />
                    <Label htmlFor="manual-ad-spend" className="font-medium text-slate-700">
                      Tổng tiền quảng cáo (nhập thủ công)
                    </Label>
                  </div>
                </td>
                <td className="p-2">
                  <MoneyInput
                    value={formState.business.manualTotalAdSpend}
                    placeholder="Tự tính từ ngân sách"
                    disabled={!formState.business.useManualTotalAdSpend}
                    className={cn(
                      INPUT_CELL,
                      !formState.business.useManualTotalAdSpend && 'opacity-50',
                    )}
                    onChange={(v) => {
                      setFormState((prev) => ({
                        ...prev,
                        business: { ...prev.business, manualTotalAdSpend: v },
                      }));
                      setCalculated(false);
                    }}
                  />
                </td>
              </tr>
              {displayMetrics && (
                <>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Số đơn hàng (dùng tính)</td>
                    <td className={cn('p-3', RESULT_CELL)}>
                      {formatCount(displayMetrics.totalOrders)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Doanh thu</td>
                    <td className={cn('p-3', RESULT_CELL)}>{formatVnd(displayMetrics.revenue)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Vốn nhập hàng / giá vốn</td>
                    <td className={cn('p-3', RESULT_CELL)}>
                      {formatVnd(displayMetrics.costOfGoods)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Lãi/đơn</td>
                    <td className={cn('p-3', RESULT_CELL)}>
                      {formatVnd(displayMetrics.profitPerOrder)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Tiền quảng cáo</td>
                    <td className={cn('p-3', RESULT_CELL)}>
                      {formatVnd(displayMetrics.totalAdSpend)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Tỷ lệ chi quảng cáo</td>
                    <td className={cn('p-3', RESULT_CELL)}>
                      {formatPercent(displayMetrics.adCostRate)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Chi phí quảng cáo / đơn hàng</td>
                    <td className={cn('p-3', RESULT_CELL)}>
                      {formatVnd(displayMetrics.costPerOrder)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700">Lãi trước quảng cáo</td>
                    <td className={cn('p-3', RESULT_CELL)}>
                      {formatVnd(displayMetrics.profitBeforeAds)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-700 font-semibold">Lãi trừ quảng cáo</td>
                    <td className={cn('p-3 font-semibold', RESULT_CELL)}>
                      {formatVnd(displayMetrics.profitAfterAds)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {displayMetrics && displayMetrics.warnings.length > 0 && (
        <div className="space-y-2">
          {displayMetrics.warnings.map((w) => (
            <div
              key={w.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
                w.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                w.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
                w.tone === 'danger' && 'border-red-200 bg-red-50 text-red-900',
              )}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <p className="text-sm text-red-300">{Object.values(errors).filter(Boolean).join(' · ')}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button onClick={handleCalculate} className="sm:flex-1">
          <Calculator className="h-4 w-4 mr-2" />
          Tính toán
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
        >
          <Save className="h-4 w-4 mr-2" />
          {draftSaved ? 'Đã lưu nháp!' : 'Lưu nháp'}
        </Button>
        <Button
          variant="secondary"
          onClick={handleSample}
          className="bg-white/15 text-white hover:bg-white/20"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Dùng dữ liệu mẫu
        </Button>
      </div>
    </div>
  );
}
