'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Calculator,
  Calendar,
  History,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { BusinessGoalForm } from '@/components/business-goals/business-goal-form';
import { FooterTips } from '@/components/business-goals/insights-panel';
import { BusinessGoalResultsSummary, BusinessGoalResultsTable } from '@/components/business-goals/business-goal-results-panel';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import {
  useBusinessGoalScenarios,
  useCreateBusinessGoalScenario,
  useDeleteBusinessGoalScenario,
} from '@/hooks/use-business-goals';
import {
  defaultBusinessGoalFormState,
  formStateFromApiInput,
  loadBusinessGoalDraft,
  saveBusinessGoalDraft,
  sampleBusinessGoalFormState,
  type BusinessGoalFormState,
} from '@/lib/business-goal-form';
import { calculateBusinessGoalMetrics } from '@/lib/business-goal-metrics';
import { formatDateTime, formatVnd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BG_BOX, BG_BOX_FIELDS } from '@/components/business-goals/business-goals-theme';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/i18n/i18n-provider';

function AdPerformanceTabLoading() {
  const t = useT();
  return (
    <div className="rounded-lg border border-white/10 bg-[#0B2115] p-8 text-center text-white/70">
      {t('businessGoals.loadingAdPerformance')}
    </div>
  );
}

function AdGoalTabLoading() {
  const t = useT();
  return (
    <div className="rounded-lg border border-white/10 bg-[#0B2115] p-8 text-center text-white/70">
      {t('businessGoals.loadingAdGoal')}
    </div>
  );
}

const AdPerformancePanel = dynamic(
  () =>
    import('@/components/business-goals/ad-performance-panel').then((m) => m.AdPerformancePanel),
  {
    ssr: false,
    loading: () => <AdPerformanceTabLoading />,
  },
);

const AdGoalPanel = dynamic(
  () => import('@/components/business-goals/ad-goal-panel').then((m) => m.AdGoalPanel),
  {
    ssr: false,
    loading: () => <AdGoalTabLoading />,
  },
);

import type { BusinessGoalInput, BusinessGoalScenario } from '@/types/business-goals';

type FormErrors = Partial<Record<keyof BusinessGoalInput, string>>;

function validateApiInput(
  values: BusinessGoalInput,
  msgs: { negative: string; rateMax: string },
): FormErrors {
  const errors: FormErrors = {};
  const rateFields: (keyof BusinessGoalInput)[] = ['variableCostRate', 'leadConversionRate'];

  (Object.keys(values) as (keyof BusinessGoalInput)[]).forEach((key) => {
    const v = values[key];
    if (!Number.isFinite(v) || v < 0) errors[key] = msgs.negative;
    if (rateFields.includes(key) && v > 100) errors[key] = msgs.rateMax;
  });

  return errors;
}

function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(new Date());
}

export default function BusinessGoalsPage() {
  const t = useT();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('goals');

  useEffect(() => {
    if (searchParams.get('tab') === 'ad-performance') {
      setActiveTab('ad-performance');
    } else if (searchParams.get('tab') === 'ad-goal') {
      setActiveTab('ad-goal');
    }
  }, [searchParams]);

  const [formState, setFormState] = useState<BusinessGoalFormState>(defaultBusinessGoalFormState);
  const [calculated, setCalculated] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  const metrics = useMemo(() => calculateBusinessGoalMetrics(formState), [formState]);
  // Always show live preview; "Tính toán" validates + confirms
  const showResults = calculated;

  const createScenario = useCreateBusinessGoalScenario();
  const deleteScenario = useDeleteBusinessGoalScenario();
  const {
    data: scenariosData,
    isLoading: scenariosLoading,
    isError: scenariosError,
    refetch: refetchScenarios,
  } = useBusinessGoalScenarios();

  const scenarios = scenariosData?.items ?? [];

  useEffect(() => {
    const draft = loadBusinessGoalDraft();
    if (draft) setFormState(draft);
  }, []);

  const handleCalculate = useCallback(() => {
    const validation = validateApiInput(metrics.apiInput, {
      negative: t('businessGoals.negativeNotAllowed'),
      rateMax: t('businessGoals.rateMax100'),
    });
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setCalculated(true);
  }, [metrics.apiInput, t]);

  const handleReset = useCallback(() => {
    setFormState(defaultBusinessGoalFormState);
    setErrors({});
    setCalculated(true);
  }, []);

  const handleSample = useCallback(() => {
    setFormState(sampleBusinessGoalFormState);
    setErrors({});
    setCalculated(true);
  }, []);

  const handleSaveDraft = useCallback(() => {
    saveBusinessGoalDraft(formState);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  }, [formState]);

  const handleSave = useCallback(() => {
    if (!scenarioName.trim()) return;
    createScenario.mutate(
      { ...metrics.apiInput, name: scenarioName.trim() },
      {
        onSuccess: () => {
          setSaveOpen(false);
          setScenarioName('');
        },
      },
    );
  }, [createScenario, metrics.apiInput, scenarioName]);

  const loadScenario = useCallback((scenario: BusinessGoalScenario) => {
    setFormState(formStateFromApiInput(scenario));
    setErrors({});
    setCalculated(true);
    setHistoryOpen(false);
  }, []);

  return (
    <div className={cn('space-y-5 max-w-[1400px] mx-auto', activeTab === 'goals' && 'pb-20')}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('businessGoals.title')}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('businessGoals.description')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm">
            <BookOpen className="h-4 w-4 mr-1.5" />
            {t('businessGoals.guide')}
          </Button>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0B2115] px-3 py-1.5 text-sm text-white">
            <Calendar className="h-4 w-4 text-white/70" />
            <span>{t('businessGoals.month', { label: currentMonthLabel() })}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1.5" />
            {t('businessGoals.history')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="grid w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="goals">{t('businessGoals.tabs.goals')}</TabsTrigger>
          <TabsTrigger value="ad-goal">{t('businessGoals.tabs.adGoal')}</TabsTrigger>
          <TabsTrigger value="ad-performance">{t('businessGoals.tabs.adPerformance')}</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="mt-0 space-y-5">
          {/* 4 KPI + Hiểu nhanh — full width trên đầu */}
          {showResults && <BusinessGoalResultsSummary metrics={metrics} />}

          <div className="flex w-full flex-col gap-5 lg:flex-row lg:items-start">
            {/* Cột nhập số liệu — 450px trên desktop */}
            <Card
              className={cn(
                'min-w-0 w-full lg:w-[450px] lg:min-w-[450px] lg:max-w-[450px] lg:shrink-0',
                BG_BOX,
                BG_BOX_FIELDS,
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white">{t('businessGoals.enterFigures')}</CardTitle>
                <p className="text-xs font-normal text-white/60">{t('businessGoals.basicSix')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <BusinessGoalForm
                  state={formState}
                  onChange={(s) => {
                    setFormState(s);
                    setCalculated(true);
                  }}
                />
                {Object.keys(errors).length > 0 && (
                  <p className="text-sm text-red-300">
                    {Object.values(errors).filter(Boolean).join(' · ')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Cột bảng kết quả — chiếm phần còn lại */}
            <div className="min-w-0 w-full flex-1 space-y-4">
              {showResults ? (
                <BusinessGoalResultsTable metrics={metrics} />
              ) : (
                <Card className={cn(BG_BOX)}>
                  <CardContent className="py-10 [&_.text-muted-foreground]:text-white/70 [&_p.font-medium]:text-white">
                    <EmptyState
                      title={t('businessGoals.noResults')}
                      description={t('businessGoals.noResultsHint')}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <FooterTips />
        </TabsContent>

        <TabsContent value="ad-goal" className="mt-0">
          <AdGoalPanel />
        </TabsContent>

        <TabsContent value="ad-performance" className="mt-0">
          <AdPerformancePanel />
        </TabsContent>
      </Tabs>

      {/* Fixed action bar — tab Tính mục tiêu only; one row, no wrap */}
      {activeTab === 'goals' && (
        <div
          className={cn(
            'fixed bottom-0 left-0 right-0 z-40 lg:left-64',
            'border-t border-white/10 bg-[#0B2115]/95 backdrop-blur-sm',
            'px-3 py-2.5 md:px-6',
          )}
        >
          <div className="mx-auto flex w-full max-w-full flex-row flex-nowrap items-center justify-start gap-2 overflow-x-auto">
            <Button onClick={handleCalculate} className="shrink-0">
              <Calculator className="h-4 w-4 mr-2" />
              {t('businessGoals.calculate')}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              className="shrink-0 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              className="shrink-0 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {draftSaved ? t('businessGoals.draftSaved') : t('businessGoals.saveDraft')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleSample}
              className="shrink-0 bg-white/15 text-white hover:bg-white/20"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {t('businessGoals.useSample')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(true)}
              disabled={!calculated || createScenario.isPending}
              className="shrink-0 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              {t('businessGoals.saveScenario')}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('businessGoals.saveScenario')}</DialogTitle>
            <DialogDescription>
              {t('businessGoals.saveScenarioDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="scenario-name">{t('businessGoals.scenarioName')}</Label>
            <Input
              id="scenario-name"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder={t('businessGoals.scenarioNamePlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!scenarioName.trim() || createScenario.isPending}
            >
              {createScenario.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('businessGoals.scenarioHistory')}</DialogTitle>
            <DialogDescription>{t('businessGoals.historyDesc')}</DialogDescription>
          </DialogHeader>

          {scenariosLoading && <LoadingState />}
          {scenariosError && (
            <ErrorState message={t('businessGoals.loadHistoryFailed')} onRetry={() => refetchScenarios()} />
          )}
          {!scenariosLoading && !scenariosError && scenarios.length === 0 && (
            <EmptyState title={t('businessGoals.noScenarios')} description={t('businessGoals.saveScenarioHint')} />
          )}

          {!scenariosLoading && scenarios.length > 0 && (
            <div className="space-y-3">
              {scenarios.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">{s.name}</p>
                      <Badge
                        variant={Number(s.calculatedNetProfit) >= 0 ? 'default' : 'outline'}
                        className={
                          Number(s.calculatedNetProfit) < 0
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : undefined
                        }
                      >
                        {Number(s.calculatedNetProfit) >= 0 ? t('businessGoals.profitLoss') : t('businessGoals.loss')}{' '}
                        {formatVnd(Math.abs(Number(s.calculatedNetProfit)))}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(s.createdAt)}
                      {s.createdBy?.name ? ` · ${s.createdBy.name}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => loadScenario(s)}>
                      {t('businessGoals.loadIntoForm')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t('businessGoals.deleteScenarioTitle')}
        description={t('businessGoals.deleteScenarioDesc')}
        confirmLabel={t('common.delete')}
        destructive
        isPending={deleteScenario.isPending}
        onConfirm={() => {
          if (!deleteId) return;
          deleteScenario.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
}
