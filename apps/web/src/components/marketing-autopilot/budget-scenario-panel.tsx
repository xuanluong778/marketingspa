'use client';

import { useMemo, useState } from 'react';
import {
  describeBudgetDataGaps,
  simulateBudgetScenariosFromAssumptions,
  toBudgetScenarioUiView,
  type BudgetScenario,
  type NbaV2ContextMetrics,
} from '@marketingspa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LooseEstimate = {
  value?: number | null;
  status?: string;
  confidence?: string;
  basedOn?: string[];
  sampleSize?: number | null;
  timeRange?: { from: string; to: string } | null;
  note?: string;
};

export type BudgetScenarioPanelItem = {
  scenarioId: string;
  label: string;
  monthlyBudget: number;
  estimates: Record<string, LooseEstimate>;
  dataQuality: string;
  assumptions?: string[];
  timeRange?: { from: string; to: string } | null;
  mode?: 'historical' | 'assumption';
};

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function snapshotMetricsToNba(raw?: Record<string, unknown> | null): NbaV2ContextMetrics | undefined {
  if (!raw) return undefined;
  const leads = asRecord(raw.leads);
  const bookings = asRecord(raw.bookings);
  const conversion = asRecord(raw.conversion);
  const revenue = asRecord(raw.revenue);
  const ads = asRecord(raw.ads);
  return {
    leads: leads ? { total: asNumber(leads.total) } : undefined,
    bookings: bookings ? { total: asNumber(bookings.total) } : undefined,
    conversion: conversion ? { leadToBookingRate: asNumber(conversion.leadToBookingRate) } : undefined,
    revenue: revenue ? { total: asNumber(revenue.total) } : undefined,
    ads: ads
      ? {
          spend: asNumber(ads.spend),
          cpl: asNumber(ads.cpl),
          roas: asNumber(ads.roas),
          leads: asNumber(ads.leads),
        }
      : undefined,
  };
}

function parsePositiveNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function metricFromLoose(raw?: LooseEstimate, timeRange?: { from: string; to: string } | null) {
  const value = raw?.value ?? null;
  const hasValue = value != null;
  return {
    value,
    status: (hasValue ? (raw?.status as 'historical' | 'estimate') ?? 'estimate' : 'estimate') as
      | 'historical'
      | 'estimate'
      | 'INSUFFICIENT_DATA',
    basedOn: raw?.basedOn ?? [],
    timeRange: raw?.timeRange ?? timeRange ?? null,
    sampleSize: raw?.sampleSize ?? null,
    confidence: (hasValue ? (raw?.confidence as 'HIGH' | 'MEDIUM' | 'LOW') ?? 'LOW' : 'LOW') as
      | 'HIGH'
      | 'MEDIUM'
      | 'LOW'
      | 'INSUFFICIENT_DATA',
    note: raw?.note,
  };
}

function toTypedScenarios(items?: BudgetScenarioPanelItem[] | null): BudgetScenario[] {
  return (items ?? []).map((s) => ({
    scenarioId: s.scenarioId as BudgetScenario['scenarioId'],
    label: s.label,
    monthlyBudget: s.monthlyBudget,
    estimates: {
      leads: metricFromLoose(s.estimates.leads, s.timeRange),
      bookings: metricFromLoose(s.estimates.bookings, s.timeRange),
      revenue: metricFromLoose(s.estimates.revenue, s.timeRange),
      cpl: metricFromLoose(s.estimates.cpl, s.timeRange),
      cpa: metricFromLoose(s.estimates.cpa, s.timeRange),
      roas: metricFromLoose(s.estimates.roas, s.timeRange),
    },
    dataQuality: (s.dataQuality === 'SUFFICIENT' || s.dataQuality === 'PARTIAL'
      ? s.dataQuality
      : 'PARTIAL') as BudgetScenario['dataQuality'],
    assumptions: s.assumptions ?? [],
    timeRange: s.timeRange ?? null,
    mode: s.mode,
  }));
}

export function BudgetScenarioPanel({
  scenarios,
  productPrice,
  metrics,
}: {
  scenarios?: BudgetScenarioPanelItem[] | null;
  productPrice?: number;
  metrics?: Record<string, unknown> | null;
}) {
  const nbaMetrics = useMemo(() => snapshotMetricsToNba(metrics), [metrics]);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [cpl, setCpl] = useState('');
  const [rate, setRate] = useState('');
  const [aov, setAov] = useState(productPrice && productPrice > 0 ? String(productPrice) : '');
  const [assumptionScenarios, setAssumptionScenarios] = useState<BudgetScenario[] | null>(null);
  const [assumptionError, setAssumptionError] = useState<string | null>(null);

  const historicalView = useMemo(
    () =>
      toBudgetScenarioUiView(toTypedScenarios(scenarios), {
        metrics: nbaMetrics,
        productPrice,
        mode: 'historical',
      }),
    [scenarios, nbaMetrics, productPrice],
  );

  const assumptionView = useMemo(
    () =>
      assumptionScenarios
        ? toBudgetScenarioUiView(assumptionScenarios, { mode: 'assumption' })
        : null,
    [assumptionScenarios],
  );

  const gaps = useMemo(
    () => describeBudgetDataGaps(nbaMetrics, productPrice),
    [nbaMetrics, productPrice],
  );

  const view = assumptionView?.kind === 'ready' ? assumptionView : historicalView;

  const applyAssumptions = () => {
    const parsedCpl = parsePositiveNumber(cpl);
    const parsedRate = parsePositiveNumber(rate);
    const parsedAov = parsePositiveNumber(aov);
    if (!parsedCpl || !parsedRate || !parsedAov) {
      setAssumptionError('Nhập CPL, tỷ lệ Lead → Booking và giá trị đơn hàng lớn hơn 0.');
      setAssumptionScenarios(null);
      return;
    }
    if (parsedRate > 100) {
      setAssumptionError('Tỷ lệ Lead → Booking tối đa 100%.');
      setAssumptionScenarios(null);
      return;
    }
    setAssumptionError(null);
    setAssumptionScenarios(
      simulateBudgetScenariosFromAssumptions({
        cpl: parsedCpl,
        leadToBookingRatePct: parsedRate,
        averageOrderValue: parsedAov,
      }),
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Mô phỏng ngân sách</h3>
      {view.kind === 'ready' ? (
        <div className="space-y-2">
          {view.disclaimer ? (
            <p className="text-xs text-muted-foreground">{view.disclaimer}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ước tính từ dữ liệu lịch sử Ads/CRM. Các mức ngân sách dùng cùng công thức, không bịa số.
            </p>
          )}
          <ul className="grid gap-2 sm:grid-cols-2">
            {view.cards.map((card) => (
              <li key={card.scenarioId} className="space-y-1 rounded-md border px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{card.label}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                  <dt>Ngân sách</dt>
                  <dd className="text-right text-foreground">{card.budgetLabel}</dd>
                  <dt>Lead dự kiến</dt>
                  <dd className="text-right text-foreground">{card.leadsLabel}</dd>
                  <dt>Booking/Chuyển đổi dự kiến</dt>
                  <dd className="text-right text-foreground">{card.bookingsLabel}</dd>
                  <dt>Doanh thu dự kiến</dt>
                  <dd className="text-right text-foreground">{card.revenueLabel}</dd>
                  <dt>ROAS dự kiến</dt>
                  <dd className="text-right text-foreground">{card.roasLabel}</dd>
                  <dt>Độ tin cậy</dt>
                  <dd className="text-right text-foreground">{card.confidenceLabel}</dd>
                </dl>
              </li>
            ))}
          </ul>
          {view.source === 'assumption' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAssumptionScenarios(null);
                setShowAssumptions(true);
              }}
            >
              Sửa giả định
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2 rounded-md border px-3 py-3 text-sm">
          <p className="font-medium text-foreground">{view.reason}</p>
          <p className="text-xs text-muted-foreground">
            Cần số liệu thật về chi phí quảng cáo, lead, booking và doanh thu trong cửa sổ phân tích.
          </p>
          {(view.missing.length ? view.missing : gaps.missing).length ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {(view.missing.length ? view.missing : gaps.missing).map((item) => (
                <li key={item}>Còn thiếu: {item}</li>
              ))}
            </ul>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowAssumptions(true)}>
            Nhập giả định để mô phỏng
          </Button>
        </div>
      )}

      {showAssumptions ? (
        <div className="space-y-3 rounded-md border px-3 py-3">
          <p className="text-sm font-medium">Giả định mô phỏng</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="budget-sim-cpl">CPL (đ/lead)</Label>
              <Input
                id="budget-sim-cpl"
                inputMode="decimal"
                value={cpl}
                onChange={(e) => setCpl(e.target.value)}
                placeholder="vd. 150000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-sim-rate">Tỷ lệ Lead → Booking (%)</Label>
              <Input
                id="budget-sim-rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="vd. 20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-sim-aov">Giá trị đơn hàng (đ)</Label>
              <Input
                id="budget-sim-aov"
                inputMode="decimal"
                value={aov}
                onChange={(e) => setAov(e.target.value)}
                placeholder="vd. 2000000"
              />
            </div>
          </div>
          {assumptionError ? <p className="text-xs text-destructive">{assumptionError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={applyAssumptions}>
              Mô phỏng theo giả định
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAssumptions(false);
                setAssumptionError(null);
              }}
            >
              Đóng
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
