'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { FooterTips, InsightsPanel } from '@/components/business-goals/insights-panel';
import { KpiCards, ResultHeroCard } from '@/components/business-goals/result-hero';
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
import { AdPerformancePanel } from '@/components/business-goals/ad-performance-panel';

import type { BusinessGoalInput, BusinessGoalScenario } from '@/types/business-goals';

type FormErrors = Partial<Record<keyof BusinessGoalInput, string>>;

function validateApiInput(values: BusinessGoalInput): FormErrors {
  const errors: FormErrors = {};
  const rateFields: (keyof BusinessGoalInput)[] = ['variableCostRate', 'leadConversionRate'];

  (Object.keys(values) as (keyof BusinessGoalInput)[]).forEach((key) => {
    const v = values[key];
    if (!Number.isFinite(v) || v < 0) errors[key] = 'Không được nhập số âm';
    if (rateFields.includes(key) && v > 100) errors[key] = 'Tỷ lệ tối đa 100%';
  });

  return errors;
}

function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(new Date());
}

export default function BusinessGoalsPage() {
  const [formState, setFormState] = useState<BusinessGoalFormState>(defaultBusinessGoalFormState);
  const [inputMode, setInputMode] = useState<'quick' | 'detailed'>('quick');
  const [calculated, setCalculated] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  const metrics = useMemo(() => calculateBusinessGoalMetrics(formState), [formState]);

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
    const validation = validateApiInput(metrics.apiInput);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setCalculated(true);
  }, [metrics.apiInput]);

  const handleReset = useCallback(() => {
    setFormState(defaultBusinessGoalFormState);
    setErrors({});
    setCalculated(true);
    setInputMode('quick');
  }, []);

  const handleSample = useCallback(() => {
    setFormState(sampleBusinessGoalFormState);
    setErrors({});
    setCalculated(true);
    setInputMode('quick');
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
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Mục tiêu kinh doanh</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Nhập số liệu thực tế — hệ thống tự tính lãi/lỗ, hòa vốn và mục tiêu cần đạt
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Hướng dẫn
          </Button>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0B2115] px-3 py-1.5 text-sm text-white">
            <Calendar className="h-4 w-4 text-white/70" />
            <span>Tháng {currentMonthLabel()}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1.5" />
            Lịch sử
          </Button>
        </div>
      </div>

      <Tabs defaultValue="goals" className="space-y-5">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="goals">Tính mục tiêu</TabsTrigger>
          <TabsTrigger value="ad-performance">Hiệu quả quảng cáo</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="space-y-5 mt-0">
          {/* Hero + KPIs */}
          {calculated && (
            <div className="space-y-3">
              <ResultHeroCard metrics={metrics} />
              <KpiCards metrics={metrics} />
            </div>
          )}

          {/* Main 2-column layout */}
          <div className="grid gap-5 lg:grid-cols-5">
            <Card className={cn('lg:col-span-3', BG_BOX, BG_BOX_FIELDS)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Nhập liệu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <BusinessGoalForm
                  state={formState}
                  onChange={(s) => {
                    setFormState(s);
                    setCalculated(false);
                  }}
                  inputMode={inputMode}
                  onInputModeChange={setInputMode}
                />

                {Object.keys(errors).length > 0 && (
                  <p className="text-sm text-red-300">
                    {Object.values(errors).filter(Boolean).join(' · ')}
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap pt-2 border-t border-white/10">
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
                  <Button
                    variant="outline"
                    onClick={() => setSaveOpen(true)}
                    disabled={!calculated || createScenario.isPending}
                    className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    Lưu kịch bản
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-4 lg:self-start">
              {!calculated ? (
                <Card className={cn(BG_BOX)}>
                  <CardContent className="py-12 [&_.text-muted-foreground]:text-white/70 [&_p.font-medium]:text-white">
                    <EmptyState
                      title="Chưa có kết quả"
                      description="Nhập số liệu và nhấn Tính toán để xem insight"
                    />
                  </CardContent>
                </Card>
              ) : (
                <InsightsPanel metrics={metrics} />
              )}
            </div>
          </div>

          <FooterTips />
        </TabsContent>

        <TabsContent value="ad-performance" className="mt-0">
          <AdPerformancePanel />
        </TabsContent>
      </Tabs>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lưu kịch bản</DialogTitle>
            <DialogDescription>
              Lưu kịch bản vào hệ thống (theo tài khoản của bạn)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Tên kịch bản</Label>
            <Input
              id="scenario-name"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="VD: Kế hoạch tháng 6/2025"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleSave}
              disabled={!scenarioName.trim() || createScenario.isPending}
            >
              {createScenario.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                'Lưu'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lịch sử kịch bản</DialogTitle>
            <DialogDescription>Các kịch bản đã lưu trên server</DialogDescription>
          </DialogHeader>

          {scenariosLoading && <LoadingState />}
          {scenariosError && (
            <ErrorState message="Không tải được lịch sử" onRetry={() => refetchScenarios()} />
          )}
          {!scenariosLoading && !scenariosError && scenarios.length === 0 && (
            <EmptyState title="Chưa có kịch bản" description="Lưu kịch bản sau khi tính toán" />
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
                        {Number(s.calculatedNetProfit) >= 0 ? 'Lãi' : 'Lỗ'}{' '}
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
                      Tải vào form
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
        title="Xóa kịch bản?"
        description="Kịch bản sẽ bị xóa vĩnh viễn."
        confirmLabel="Xóa"
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
