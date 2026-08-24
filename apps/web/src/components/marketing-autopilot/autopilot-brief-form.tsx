'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CUSTOM_PRODUCT,
  LOW_DATA_HINT,
  isActionableSuggestion,
  suggestAudienceOptions,
  suggestProduct,
  type AudienceOption,
} from '@/lib/marketing-autopilot-suggestions';
import type { AutopilotFormOptions, MarketingContextSnapshot } from '@/types/marketing-autopilot';

export type AutopilotBriefFormState = {
  projectName: string;
  productId: string;
  productName: string;
  productPrice: number;
  customerProfile: string;
  customerMode: 'ai' | 'segment' | 'manual';
  segmentId: string;
  targetArea: string;
  monthlyBudget: number;
  budgetPresetId: string;
  goals: string[];
  primaryGoal: string;
};

const GOAL_CHIPS = [
  { id: 'tang-lead', label: 'Tăng Lead' },
  { id: 'tang-booking', label: 'Tăng Booking' },
  { id: 'tang-doanh-thu', label: 'Tăng doanh thu' },
  { id: 'khach-moi', label: 'Khách mới' },
  { id: 'remarketing', label: 'Remarketing' },
  { id: 'khach-cu', label: 'Khách cũ' },
  { id: 'ra-mat-san-pham', label: 'Ra mắt sản phẩm' },
  { id: 'nhan-dien', label: 'Nhận diện' },
];
const BUDGET_PRESETS = [
  { id: '5tr', label: '5tr', amount: 5_000_000 },
  { id: '10tr', label: '10tr', amount: 10_000_000 },
  { id: '20tr', label: '20tr', amount: 20_000_000 },
  { id: '50tr', label: '50tr', amount: 50_000_000 },
];

/** Digits only → number (empty → 0). */
function parseMoneyDigits(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** 2000000 → "2.000.000"; 0 → "" (no leading zero). */
function formatMoneyInput(amount: number): string {
  if (!amount || amount <= 0) return '';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function AutopilotBriefForm({
  options,
  form,
  setForm,
  snapshot,
  compact = false,
}: {
  options?: AutopilotFormOptions;
  form: AutopilotBriefFormState;
  setForm: (
    next: AutopilotBriefFormState | ((prev: AutopilotBriefFormState) => AutopilotBriefFormState),
  ) => void;
  snapshot?: MarketingContextSnapshot | null;
  compact?: boolean;
}) {
  const products = options?.products ?? [];
  const provinces = options?.provinces ?? [];
  const goalChips = options?.goals?.length ? options.goals : GOAL_CHIPS;
  const [audienceOptions, setAudienceOptions] = useState<AudienceOption[]>([]);
  const [audienceHint, setAudienceHint] = useState<string | null>(null);

  const productSuggestion = useMemo(
    () => suggestProduct(form.projectName, products, snapshot),
    [form.projectName, products, snapshot],
  );
  const productHintReady =
    !!productSuggestion &&
    isActionableSuggestion(productSuggestion.confidence) &&
    Boolean(productSuggestion.name);

  const applyProductSuggestion = () => {
    if (!productHintReady || !productSuggestion) return;
    setForm((prev) => ({
      ...prev,
      productId: productSuggestion.id,
      productName: productSuggestion.name,
      productPrice: productSuggestion.price > 0 ? productSuggestion.price : prev.productPrice,
    }));
  };

  const runAudienceAi = () => {
    const result = suggestAudienceOptions({
      projectName: form.projectName,
      productName: form.productName,
      area: form.targetArea,
      options,
      snapshot,
    });
    if (result.options.length === 0) {
      setAudienceOptions([]);
      setAudienceHint(LOW_DATA_HINT);
      return;
    }
    setAudienceOptions(result.options);
    setAudienceHint(
      result.confidence === 'LOW' || result.confidence === 'INSUFFICIENT_DATA'
        ? 'Gợi ý dựa trên dữ liệu hiện có — bạn nên chỉnh lại cho khớp thực tế.'
        : null,
    );
  };

  const applyAudienceOption = (text: string) => {
    setForm((prev) => ({
      ...prev,
      customerProfile: text,
      customerMode: 'ai',
    }));
  };

  const applyBudget = (id: string) => {
    if (id === 'custom') {
      setForm((prev) => ({ ...prev, budgetPresetId: 'custom' }));
      return;
    }
    const preset = BUDGET_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setForm((prev) => ({ ...prev, budgetPresetId: preset.id, monthlyBudget: preset.amount }));
  };

  const applyArea = (value: string) => {
    setForm((prev) => ({ ...prev, targetArea: value }));
  };

  const toggleGoal = (id: string) => {
    setForm((prev) => {
      const next = prev.goals.includes(id)
        ? prev.goals.filter((g) => g !== id)
        : [...prev.goals, id];
      const labels = goalChips.filter((g) => next.includes(g.id)).map((g) => g.label);
      return { ...prev, goals: next, primaryGoal: labels.join(', ') };
    });
  };

  const fieldGap = compact ? 'space-y-1' : 'space-y-2';
  const sectionGap = compact ? 'space-y-2.5' : 'space-y-4';
  const chipClass = compact
    ? 'rounded-full border px-2.5 py-1 text-xs transition-colors'
    : 'rounded-full border px-3 py-1.5 text-sm transition-colors';

  const projectField = (
    <div className={fieldGap}>
      <Label htmlFor="projectName" className={compact ? 'text-xs' : undefined}>
        Tên project
      </Label>
      <Input
        id="projectName"
        className={compact ? 'h-9' : undefined}
        value={form.projectName}
        onChange={(e) => setForm((prev) => ({ ...prev, projectName: e.target.value }))}
        placeholder="VD: Serum trị nám Q4"
      />
    </div>
  );

  const productField = (
    <div className={fieldGap}>
      <div className={cn('flex items-center justify-between gap-2', compact ? 'min-h-5' : 'h-8')}>
        <Label htmlFor="productName" className={compact ? 'text-xs' : undefined}>
          Sản phẩm / dịch vụ
        </Label>
        {productHintReady ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('gap-1.5 shrink-0', compact ? 'h-7 px-2 text-xs' : 'h-8')}
            onClick={applyProductSuggestion}
            disabled={productSuggestion?.name === form.productName}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Gợi ý AI
          </Button>
        ) : null}
      </div>
      <Input
        id="productName"
        className={compact ? 'h-9' : undefined}
        value={form.productName}
        onChange={(e) => {
          const name = e.target.value;
          const match = products.find((p) => normalize(p.name) === normalize(name));
          setForm((prev) => ({
            ...prev,
            productName: name,
            productId: match?.id ?? CUSTOM_PRODUCT,
            productPrice: match ? Number(match.price) || 0 : prev.productPrice,
          }));
        }}
        placeholder="Serum trị nám cao cấp"
      />
    </div>
  );

  const priceField = (
    <div className={fieldGap}>
      <Label htmlFor="productPrice" className={compact ? 'text-xs' : undefined}>
        Giá bán
      </Label>
      <Input
        id="productPrice"
        className={compact ? 'h-9' : undefined}
        inputMode="numeric"
        autoComplete="off"
        placeholder="VD: 2.000.000"
        value={formatMoneyInput(form.productPrice)}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, productPrice: parseMoneyDigits(e.target.value) }))
        }
      />
    </div>
  );

  const budgetField = (
    <div className={fieldGap}>
      <Label htmlFor="monthlyBudget" className={compact ? 'text-xs' : undefined}>
        Ngân sách tháng
      </Label>
      {form.budgetPresetId === 'custom' ? (
        <div className="flex gap-2">
          <Input
            id="monthlyBudget"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className={cn('flex-1', compact && 'h-9')}
            placeholder="Nhập ngân sách tùy chỉnh"
            value={formatMoneyInput(form.monthlyBudget)}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                monthlyBudget: parseMoneyDigits(e.target.value),
                budgetPresetId: 'custom',
              }))
            }
          />
          <Button
            type="button"
            variant="outline"
            className={cn('shrink-0', compact && 'h-9 px-2.5 text-xs')}
            onClick={() => setForm((prev) => ({ ...prev, budgetPresetId: '' }))}
          >
            Chọn sẵn
          </Button>
        </div>
      ) : (
        <Select
          value={form.budgetPresetId === 'ai' ? undefined : form.budgetPresetId || undefined}
          onValueChange={applyBudget}
        >
          <SelectTrigger id="monthlyBudget" className={compact ? 'h-9' : undefined}>
            <SelectValue placeholder="Chọn ngân sách" />
          </SelectTrigger>
          <SelectContent>
            {BUDGET_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Tùy chỉnh</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );

  const areaField = (
    <div className={fieldGap}>
      <Label className={compact ? 'text-xs' : undefined}>Khu vực</Label>
      <Select value={form.targetArea || undefined} onValueChange={applyArea}>
        <SelectTrigger className={compact ? 'h-9' : undefined}>
          <SelectValue placeholder="Chọn tỉnh/thành" />
        </SelectTrigger>
        <SelectContent>
          {provinces.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const customerField = (
    <div className={fieldGap}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="customerProfile" className={compact ? 'text-xs' : undefined}>
          Khách hàng mục tiêu
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('gap-1.5', compact ? 'h-7 px-2 text-xs' : 'h-8')}
          onClick={runAudienceAi}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Gợi ý AI
        </Button>
      </div>
      {audienceHint ? <p className="text-xs text-muted-foreground">{audienceHint}</p> : null}
      {audienceOptions.length > 0 ? (
        <div
          className={cn(
            'space-y-1 overflow-y-auto rounded-md border p-2',
            compact ? 'max-h-24' : 'max-h-48',
          )}
        >
          {audienceOptions.map((opt) => (
            <button
              key={`${opt.index}-${opt.text}`}
              type="button"
              className={cn(
                'w-full rounded-md px-2.5 py-1 text-left text-sm transition-colors hover:bg-muted',
                form.customerProfile === opt.text && 'bg-primary/10 text-foreground',
              )}
              onClick={() => applyAudienceOption(opt.text)}
            >
              <span className="font-medium text-muted-foreground">{opt.index}.</span> {opt.text}
            </button>
          ))}
        </div>
      ) : null}
      <Textarea
        id="customerProfile"
        value={form.customerProfile}
        onChange={(e) =>
          setForm((prev) => ({ ...prev, customerProfile: e.target.value, customerMode: 'manual' }))
        }
        placeholder="Nữ 28-40 tuổi, quan tâm trị nám, thu nhập trung bình khá..."
        rows={compact ? 2 : 3}
        className={compact ? 'min-h-[4.5rem] resize-none' : undefined}
      />
    </div>
  );

  const goalsField = (
    <div className={fieldGap}>
      <Label className={compact ? 'text-xs' : undefined}>Mục tiêu</Label>
      <div className={cn('flex flex-wrap', compact ? 'gap-1.5' : 'gap-2')}>
        {goalChips.map((g) => {
          const active = form.goals.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              className={cn(
                chipClass,
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              )}
              onClick={() => toggleGoal(g.id)}
            >
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
        <div className={sectionGap}>
          {projectField}
          {productField}
          <div className="grid grid-cols-2 gap-3">
            {priceField}
            {budgetField}
          </div>
          {areaField}
        </div>
        <div className={sectionGap}>
          {customerField}
          {goalsField}
        </div>
      </div>
    );
  }

  return (
    <div className={sectionGap}>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {projectField}
        {productField}
        {priceField}
        {budgetField}
      </div>
      {customerField}
      {areaField}
      {goalsField}
    </div>
  );
}
