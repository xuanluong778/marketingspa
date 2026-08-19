'use client';

import { HelpCircle } from 'lucide-react';
import { CategorySelect } from '@/components/business-goals/category-select';
import { CostLineList } from '@/components/business-goals/cost-line-list';
import { FieldHint, FieldLabel } from '@/components/business-goals/field-hint';
import { MoneyInput } from '@/components/business-goals/money-input';
import { CountInput, PercentInput } from '@/components/business-goals/percent-input';
import {
  FIXED_COST_OPTIONS,
  GOAL_TYPE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  MARKETING_COST_OPTIONS,
  VARIABLE_COST_OPTIONS,
} from '@/config/business-goals-options';
import { type BusinessGoalFormState, safeNumber } from '@/lib/business-goal-form';
import { cn } from '@/lib/utils';

interface BusinessGoalFormProps {
  state: BusinessGoalFormState;
  onChange: (state: BusinessGoalFormState) => void;
  inputMode?: 'quick' | 'detailed';
  onInputModeChange?: (mode: 'quick' | 'detailed') => void;
}

function FieldBlock({
  htmlFor,
  label,
  tip,
  hint,
  children,
}: {
  htmlFor?: string;
  label: string;
  tip: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        <span title={tip} className="mt-0.5 shrink-0 cursor-help text-white/50 hover:text-white/80">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{tip}</span>
        </span>
      </div>
      {children}
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}

export function BusinessGoalForm({ state, onChange }: BusinessGoalFormProps) {
  const patch = (partial: Partial<BusinessGoalFormState>) => onChange({ ...state, ...partial });

  const revenueDisplay = state.totalRevenueManualEnabled
    ? safeNumber(state.totalRevenueManual) || safeNumber(state.targetRevenue)
    : safeNumber(state.transactionCount) * safeNumber(state.avgRevenuePerTransaction);

  const variableCostDisplay =
    state.variableCostLines.length > 0
      ? state.variableCostLines.reduce((s, l) => s + l.amount, 0)
      : state.totalVariableCostManualEnabled && state.totalVariableCostManual > 0
        ? safeNumber(state.totalVariableCostManual)
        : safeNumber(state.variableCostPerTransaction) * safeNumber(state.transactionCount);

  const fixedDisplay =
    state.fixedCostLines.length > 0
      ? state.fixedCostLines.reduce((s, l) => s + l.amount, 0) +
        state.marketingLines.reduce((s, l) => s + l.amount, 0)
      : safeNumber(state.totalFixedCostManual) + safeNumber(state.totalMarketingManual);

  const setTargetRevenue = (targetRevenue: number) => {
    const avg = safeNumber(state.avgRevenuePerTransaction) || 1;
    const tx = Math.max(1, Math.round(targetRevenue / avg));
    const varTotal =
      state.totalVariableCostManualEnabled && state.totalVariableCostManual > 0
        ? safeNumber(state.totalVariableCostManual)
        : Math.round(
            (targetRevenue *
              (avg > 0 ? safeNumber(state.variableCostPerTransaction) / avg : 0)) /
              1,
          ) || Math.round((targetRevenue * (variableCostDisplay / Math.max(1, revenueDisplay))) * 1);
    // Prefer keeping same variable cost absolute if user set it; else keep rate
    const keepVar = variableCostDisplay > 0 ? variableCostDisplay : varTotal;
    patch({
      targetRevenue,
      totalRevenueManual: targetRevenue,
      totalRevenueManualEnabled: true,
      transactionCount: tx,
      totalVariableCostManual: keepVar,
      totalVariableCostManualEnabled: true,
      variableCostLines: [],
      variableCostPerTransaction: avg > 0 ? Math.round(keepVar / tx) : state.variableCostPerTransaction,
    });
  };

  const setAvg = (avgRevenuePerTransaction: number) => {
    const avg = Math.max(0, avgRevenuePerTransaction);
    const target = revenueDisplay > 0 ? revenueDisplay : safeNumber(state.targetRevenue);
    const tx = avg > 0 && target > 0 ? Math.max(1, Math.round(target / avg)) : state.transactionCount;
    const revenue = avg * tx;
    const varTotal = variableCostDisplay > 0 ? variableCostDisplay : Math.round(revenue * 0.33);
    patch({
      avgRevenuePerTransaction: avg,
      avgSellingPrice: avg,
      transactionCount: tx,
      totalRevenueManual: state.totalRevenueManualEnabled ? target || revenue : state.totalRevenueManual,
      targetRevenue: state.totalRevenueManualEnabled ? target || revenue : state.targetRevenue,
      totalVariableCostManual: varTotal,
      totalVariableCostManualEnabled: true,
      variableCostPerTransaction: tx > 0 ? Math.round(varTotal / tx) : 0,
      variableCostLines: [],
    });
  };

  /** Chi phí biến đổi = tổng tiền (dễ hiểu hơn %) — map về form + calc hiện có */
  const setVariableCostTotal = (totalVariableCostManual: number) => {
    const rev = Math.max(1, revenueDisplay);
    const avg = safeNumber(state.avgRevenuePerTransaction) || 1;
    const tx = Math.max(1, safeNumber(state.transactionCount) || Math.round(rev / avg));
    patch({
      totalVariableCostManual: Math.max(0, totalVariableCostManual),
      totalVariableCostManualEnabled: true,
      variableCostLines: [],
      variableCostPerTransaction: Math.round(Math.max(0, totalVariableCostManual) / tx),
      transactionCount: tx,
    });
  };

  const setFixed = (totalFixedCostManual: number) => {
    patch({
      totalFixedCostManual: Math.max(0, totalFixedCostManual),
      totalFixedCostManualEnabled: true,
      fixedCostLines: [],
      totalMarketingManual: 0,
      totalMarketingManualEnabled: true,
      marketingLines: [],
    });
  };

  return (
    <div className="space-y-5">
      {/* 6 fields — always 1 column */}
      <div className="grid grid-cols-1 gap-4">
        <FieldBlock
          htmlFor="bg-target-rev"
          label="Doanh thu mục tiêu"
          tip="Tổng tiền bạn muốn thu về từ bán hàng trong tháng."
          hint="Tổng tiền bán hàng cần đạt trong 1 tháng, trước khi trừ chi phí."
        >
          <MoneyInput
            id="bg-target-rev"
            value={revenueDisplay}
            onChange={setTargetRevenue}
            placeholder="Ví dụ: 600.000.000"
          />
        </FieldBlock>

        <FieldBlock
          htmlFor="bg-avg"
          label="Giá trị TB / đơn"
          tip="Trung bình một khách mua bao nhiêu tiền mỗi lần."
          hint="Trung bình một khách trả bao nhiêu tiền trong một giao dịch."
        >
          <MoneyInput
            id="bg-avg"
            value={state.avgRevenuePerTransaction}
            onChange={setAvg}
            placeholder="Ví dụ: 25.000"
          />
        </FieldBlock>

        <FieldBlock
          htmlFor="bg-var"
          label="Chi phí biến đổi"
          tip="Chi phí tăng khi bán nhiều: hàng hóa, nguyên vật liệu, hoa hồng…"
          hint="Các chi phí tăng theo số lượng bán (hàng, bao bì, hoa hồng…)."
        >
          <MoneyInput
            id="bg-var"
            value={variableCostDisplay}
            onChange={setVariableCostTotal}
            placeholder="Ví dụ: 400.000.000"
          />
        </FieldBlock>

        <FieldBlock
          htmlFor="bg-fixed"
          label="Chi phí cố định"
          tip="Chi phí hàng tháng gần như cố định dù bán nhiều hay ít."
          hint="Lương, thuê mặt bằng… dù bán nhiều hay ít vẫn phải trả."
        >
          <MoneyInput
            id="bg-fixed"
            value={fixedDisplay}
            onChange={setFixed}
            placeholder="Ví dụ: 17.000.000"
          />
        </FieldBlock>

        <FieldBlock
          htmlFor="bg-conv"
          label="Tỷ lệ chuyển đổi"
          tip="Trong 100 khách tiềm năng, bao nhiêu người mua hàng."
          hint="Ví dụ 15% = 100 khách hỏi thì khoảng 15 người mua."
        >
          <PercentInput
            id="bg-conv"
            value={state.leadConversionRate}
            onChange={(leadConversionRate) => patch({ leadConversionRate })}
            placeholder="Ví dụ: 15"
          />
        </FieldBlock>

        <FieldBlock
          htmlFor="bg-profit"
          label="Lợi nhuận mục tiêu"
          tip="Số tiền lãi bạn muốn còn lại sau khi trả hết chi phí."
          hint="Số tiền lãi mong muốn sau khi trả chi phí (trước thuế)."
        >
          <MoneyInput
            id="bg-profit"
            value={state.targetProfit}
            onChange={(targetProfit) => patch({ targetProfit })}
            placeholder="Ví dụ: 183.000.000"
          />
        </FieldBlock>
      </div>

      {/* Advanced — default closed */}
      <details className="group rounded-xl border border-white/10 bg-white/5">
        <summary
          className={cn(
            'flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3',
            'text-sm font-medium text-white marker:content-none [&::-webkit-details-marker]:hidden',
          )}
        >
          <span>Xem thêm</span>
          <span className="text-xs font-normal text-white/50 group-open:hidden">Mở</span>
          <span className="hidden text-xs font-normal text-white/50 group-open:inline">Đóng</span>
        </summary>
        <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-3">
          <p className="text-xs text-white/55">
            Tùy chọn — kê chi tiết dòng chi phí / lead. Không cần mở cũng tính được kết quả.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="bg-tx-adv">Số đơn (kế hoạch)</FieldLabel>
              <CountInput
                id="bg-tx-adv"
                value={state.transactionCount}
                onChange={(transactionCount) =>
                  patch({ transactionCount, totalRevenueManualEnabled: false })
                }
                placeholder="Ví dụ: 24000"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="bg-leads-adv">Số lead hiện có</FieldLabel>
              <CountInput
                id="bg-leads-adv"
                value={state.leadCount}
                onChange={(leadCount) => patch({ leadCount })}
                placeholder="Ví dụ: 500"
              />
            </div>
          </div>
          <CostLineList
            label="Chi phí biến đổi chi tiết"
            lines={state.variableCostLines}
            options={VARIABLE_COST_OPTIONS}
            defaultCategory="COSMETICS_USED"
            addButtonLabel="Thêm dòng"
            onChange={(variableCostLines) =>
              patch({ variableCostLines, totalVariableCostManualEnabled: false })
            }
          />
          <CostLineList
            label="Chi phí cố định chi tiết"
            lines={state.fixedCostLines}
            options={FIXED_COST_OPTIONS}
            defaultCategory="RENT"
            addButtonLabel="Thêm dòng"
            onChange={(fixedCostLines) =>
              patch({ fixedCostLines, totalFixedCostManualEnabled: false })
            }
          />
          <CostLineList
            label="Marketing chi tiết"
            lines={state.marketingLines}
            options={MARKETING_COST_OPTIONS}
            defaultCategory="FACEBOOK_ADS"
            addButtonLabel="Thêm dòng"
            onChange={(marketingLines) =>
              patch({ marketingLines, totalMarketingManualEnabled: false })
            }
          />
          <div className="space-y-2">
            <FieldLabel>Nguồn lead</FieldLabel>
            <CategorySelect
              value={state.leadSource}
              onChange={(leadSource) => patch({ leadSource })}
              options={LEAD_SOURCE_OPTIONS}
              otherNote={state.leadSourceNote}
              onOtherNoteChange={(leadSourceNote) => patch({ leadSourceNote })}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Loại mục tiêu</FieldLabel>
            <CategorySelect
              value={state.goalType}
              onChange={(goalType) => patch({ goalType })}
              options={GOAL_TYPE_OPTIONS}
              otherNote={state.goalTypeNote}
              onOtherNoteChange={(goalTypeNote) => patch({ goalTypeNote })}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
