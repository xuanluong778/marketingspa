'use client';

import { Banknote, Target, Users, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccordionItem } from '@/components/business-goals/accordion-item';
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
import {
  computeTotalRevenue,
  computeTotalVariableCost,
  type BusinessGoalFormState,
} from '@/lib/business-goal-form';
import { BG_BOX_INNER, BG_BOX_MUTED } from '@/components/business-goals/business-goals-theme';
import { formatMoneyDisplay } from '@/lib/money-input';
import { cn } from '@/lib/utils';

interface BusinessGoalFormProps {
  state: BusinessGoalFormState;
  onChange: (state: BusinessGoalFormState) => void;
  inputMode: 'quick' | 'detailed';
  onInputModeChange: (mode: 'quick' | 'detailed') => void;
}

function ReadOnlyMoney({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className={cn('rounded-lg px-3 py-2.5 space-y-1', BG_BOX_INNER)}>
      <p className={cn('text-xs', BG_BOX_MUTED)}>{label}</p>
      <p className="text-base font-semibold text-white">{formatMoneyDisplay(value)}</p>
      {hint && <p className={cn('text-xs', BG_BOX_MUTED)}>{hint}</p>}
    </div>
  );
}

export function BusinessGoalForm({
  state,
  onChange,
  inputMode,
  onInputModeChange,
}: BusinessGoalFormProps) {
  const patch = (partial: Partial<BusinessGoalFormState>) => onChange({ ...state, ...partial });

  const totalRevenueAuto = state.transactionCount * state.avgRevenuePerTransaction;
  const totalRevenue = computeTotalRevenue(state);
  const totalVariable = computeTotalVariableCost(state);

  return (
    <div className="space-y-4">
      <Tabs value={inputMode} onValueChange={(v) => onInputModeChange(v as 'quick' | 'detailed')}>
        <TabsList className="grid w-full grid-cols-2 bg-white/10 border border-white/10">
          <TabsTrigger
            value="quick"
            className="text-white/70 data-[state=active]:bg-white/15 data-[state=active]:text-white"
          >
            Nhập nhanh
          </TabsTrigger>
          <TabsTrigger
            value="detailed"
            className="text-white/70 data-[state=active]:bg-white/15 data-[state=active]:text-white"
          >
            Nhập chi tiết
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="mt-4 space-y-3">
          <AccordionItem
            title="Doanh thu"
            icon={<Banknote className="h-4 w-4 text-emerald-600" />}
            defaultOpen
          >
            <div className="pt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="tx-count">Số giao dịch / khách mua</FieldLabel>
                  <CountInput
                    id="tx-count"
                    value={state.transactionCount}
                    onChange={(transactionCount) => patch({ transactionCount })}
                    placeholder="Ví dụ: 100"
                  />
                  <FieldHint>Tổng số khách đã mua dịch vụ trong tháng.</FieldHint>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="avg-rev">Doanh thu trung bình / giao dịch</FieldLabel>
                  <MoneyInput
                    id="avg-rev"
                    value={state.avgRevenuePerTransaction}
                    onChange={(avgRevenuePerTransaction) =>
                      patch({ avgRevenuePerTransaction, avgSellingPrice: avgRevenuePerTransaction })
                    }
                    placeholder="Ví dụ: 1.500.000"
                  />
                </div>
              </div>
              <ReadOnlyMoney
                label="Tổng doanh thu (tự tính)"
                value={totalRevenue}
                hint={`${state.transactionCount.toLocaleString('vi-VN')} × ${state.avgRevenuePerTransaction.toLocaleString('vi-VN')}đ`}
              />
            </div>
          </AccordionItem>

          <AccordionItem
            title="Chi phí"
            icon={<Wallet className="h-4 w-4 text-violet-600" />}
            defaultOpen
          >
            <div className="pt-3 space-y-3">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="var-cost-tx">Chi phí biến đổi / giao dịch</FieldLabel>
                <MoneyInput
                  id="var-cost-tx"
                  value={state.variableCostPerTransaction}
                  onChange={(variableCostPerTransaction) => patch({ variableCostPerTransaction })}
                  placeholder="Ví dụ: 500.000"
                />
                <FieldHint>Mỹ phẩm, vật tư, hoa hồng kỹ thuật viên cho mỗi khách.</FieldHint>
              </div>
              <ReadOnlyMoney
                label="Tổng chi phí biến đổi (tự tính)"
                value={totalVariable}
                hint={`${state.transactionCount.toLocaleString('vi-VN')} × ${state.variableCostPerTransaction.toLocaleString('vi-VN')}đ`}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="fixed-total">Chi phí cố định (tổng)</FieldLabel>
                  <MoneyInput
                    id="fixed-total"
                    value={
                      state.fixedCostLines.length > 0
                        ? state.fixedCostLines.reduce((s, l) => s + l.amount, 0)
                        : state.totalFixedCostManual
                    }
                    onChange={(totalFixedCostManual) =>
                      patch({
                        totalFixedCostManual,
                        totalFixedCostManualEnabled: true,
                        fixedCostLines: [],
                      })
                    }
                    placeholder="Ví dụ: 80.000.000"
                    disabled={state.fixedCostLines.length > 0}
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="mkt-total">Chi phí marketing (tổng)</FieldLabel>
                  <MoneyInput
                    id="mkt-total"
                    value={
                      state.marketingLines.length > 0
                        ? state.marketingLines.reduce((s, l) => s + l.amount, 0)
                        : state.totalMarketingManual
                    }
                    onChange={(totalMarketingManual) =>
                      patch({
                        totalMarketingManual,
                        totalMarketingManualEnabled: true,
                        marketingLines: [],
                      })
                    }
                    placeholder="Ví dụ: 30.000.000"
                    disabled={state.marketingLines.length > 0}
                  />
                </div>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem
            title="Lead & chuyển đổi"
            icon={<Users className="h-4 w-4 text-blue-600" />}
          >
            <div className="pt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="lead-count">Số khách hàng tiềm năng / lead</FieldLabel>
                  <CountInput
                    id="lead-count"
                    value={state.leadCount}
                    onChange={(leadCount) => patch({ leadCount })}
                    placeholder="Ví dụ: 500"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="conv-rate">Tỷ lệ chuyển đổi lead</FieldLabel>
                  <PercentInput
                    id="conv-rate"
                    value={state.leadConversionRate}
                    onChange={(leadConversionRate) => patch({ leadConversionRate })}
                    placeholder="Ví dụ: 20"
                  />
                </div>
              </div>
              <ReadOnlyMoney
                label="Số giao dịch dự kiến từ lead"
                value={Math.round(state.leadCount * (state.leadConversionRate / 100))}
                hint="Lead × tỷ lệ chuyển đổi"
              />
            </div>
          </AccordionItem>

          <AccordionItem title="Mục tiêu" icon={<Target className="h-4 w-4 text-orange-600" />}>
            <div className="pt-3 space-y-3">
              <div className="space-y-1.5">
                <FieldLabel>Chọn mục tiêu</FieldLabel>
                <CategorySelect
                  value={state.goalType}
                  onChange={(goalType) => patch({ goalType })}
                  options={GOAL_TYPE_OPTIONS}
                  otherNote={state.goalTypeNote}
                  onOtherNoteChange={(goalTypeNote) => patch({ goalTypeNote })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="target-profit">Mục tiêu lợi nhuận mong muốn</FieldLabel>
                  <MoneyInput
                    id="target-profit"
                    value={state.targetProfit}
                    onChange={(targetProfit) => patch({ targetProfit })}
                    placeholder="Ví dụ: 100.000.000"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="target-revenue">
                    Hoặc mục tiêu doanh thu mong muốn
                  </FieldLabel>
                  <MoneyInput
                    id="target-revenue"
                    value={state.targetRevenue}
                    onChange={(targetRevenue) => patch({ targetRevenue })}
                    placeholder="Ví dụ: 300.000.000"
                  />
                </div>
              </div>
            </div>
          </AccordionItem>
        </TabsContent>

        <TabsContent value="detailed" className="mt-4 space-y-3">
          <AccordionItem
            title="Doanh thu"
            icon={<Banknote className="h-4 w-4 text-emerald-600" />}
            defaultOpen
          >
            <div className="pt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="tx-count-d">Số giao dịch / khách mua</FieldLabel>
                  <CountInput
                    id="tx-count-d"
                    value={state.transactionCount}
                    onChange={(transactionCount) => patch({ transactionCount })}
                    placeholder="Ví dụ: 100"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="avg-rev-d">Doanh thu trung bình / giao dịch</FieldLabel>
                  <MoneyInput
                    id="avg-rev-d"
                    value={state.avgRevenuePerTransaction}
                    onChange={(avgRevenuePerTransaction) =>
                      patch({ avgRevenuePerTransaction, avgSellingPrice: avgRevenuePerTransaction })
                    }
                    placeholder="Ví dụ: 1.500.000"
                  />
                </div>
              </div>
              <ReadOnlyMoney label="Tổng doanh thu (tự tính)" value={totalRevenueAuto} />
            </div>
          </AccordionItem>

          <AccordionItem
            title="Chi phí"
            icon={<Wallet className="h-4 w-4 text-violet-600" />}
            defaultOpen
          >
            <div className="pt-3 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Giá vốn / chi phí biến đổi mỗi GD</FieldLabel>
                  <MoneyInput
                    value={state.variableCostPerTransaction}
                    onChange={(variableCostPerTransaction) => patch({ variableCostPerTransaction })}
                    placeholder="Ví dụ: 500.000"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Giá bán trung bình</FieldLabel>
                  <MoneyInput
                    value={state.avgSellingPrice}
                    onChange={(avgSellingPrice) => patch({ avgSellingPrice })}
                    placeholder="Ví dụ: 1.500.000"
                  />
                </div>
              </div>

              <CostLineList
                label="Chi phí biến đổi chi tiết"
                lines={state.variableCostLines}
                options={VARIABLE_COST_OPTIONS}
                defaultCategory="COSMETICS_USED"
                addButtonLabel="Thêm dòng chi phí biến đổi"
                onChange={(variableCostLines) => patch({ variableCostLines })}
              />

              <CostLineList
                label="Chi phí cố định chi tiết"
                lines={state.fixedCostLines}
                options={FIXED_COST_OPTIONS}
                defaultCategory="RENT"
                addButtonLabel="Thêm dòng chi phí cố định"
                onChange={(fixedCostLines) =>
                  patch({ fixedCostLines, totalFixedCostManualEnabled: false })
                }
              />

              <CostLineList
                label="Chi phí marketing chi tiết"
                lines={state.marketingLines}
                options={MARKETING_COST_OPTIONS}
                defaultCategory="FACEBOOK_ADS"
                addButtonLabel="Thêm dòng marketing"
                onChange={(marketingLines) =>
                  patch({ marketingLines, totalMarketingManualEnabled: false })
                }
              />
            </div>
          </AccordionItem>

          <AccordionItem
            title="Lead & chuyển đổi"
            icon={<Users className="h-4 w-4 text-blue-600" />}
          >
            <div className="pt-3 space-y-3">
              <CategorySelect
                value={state.leadSource}
                onChange={(leadSource) => patch({ leadSource })}
                options={LEAD_SOURCE_OPTIONS}
                otherNote={state.leadSourceNote}
                onOtherNoteChange={(leadSourceNote) => patch({ leadSourceNote })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Số lead</FieldLabel>
                  <CountInput
                    value={state.leadCount}
                    onChange={(leadCount) => patch({ leadCount })}
                    placeholder="Ví dụ: 500"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Tỷ lệ chuyển đổi</FieldLabel>
                  <PercentInput
                    value={state.leadConversionRate}
                    onChange={(leadConversionRate) => patch({ leadConversionRate })}
                    placeholder="Ví dụ: 20"
                  />
                </div>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem title="Mục tiêu" icon={<Target className="h-4 w-4 text-orange-600" />}>
            <div className="pt-3 space-y-3">
              <CategorySelect
                value={state.goalType}
                onChange={(goalType) => patch({ goalType })}
                options={GOAL_TYPE_OPTIONS}
                otherNote={state.goalTypeNote}
                onOtherNoteChange={(goalTypeNote) => patch({ goalTypeNote })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Mục tiêu lợi nhuận</FieldLabel>
                  <MoneyInput
                    value={state.targetProfit}
                    onChange={(targetProfit) => patch({ targetProfit })}
                    placeholder="Ví dụ: 100.000.000"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Mục tiêu doanh thu</FieldLabel>
                  <MoneyInput
                    value={state.targetRevenue}
                    onChange={(targetRevenue) => patch({ targetRevenue })}
                    placeholder="Ví dụ: 300.000.000"
                  />
                </div>
              </div>
            </div>
          </AccordionItem>
        </TabsContent>
      </Tabs>
    </div>
  );
}
