'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategorySelect } from '@/components/business-goals/category-select';
import { MoneyInput } from '@/components/business-goals/money-input';
import { getOptionPlaceholder, type SelectOption } from '@/config/business-goals-options';
import type { CostLineItem } from '@/lib/business-goal-form';
import { createCostLine } from '@/lib/business-goal-form';
import { formatMoneyDisplay } from '@/lib/money-input';
import { cn } from '@/lib/utils';
import { BG_BOX_INNER, BG_BOX_MUTED } from '@/components/business-goals/business-goals-theme';

interface CostLineListProps {
  label: string;
  lines: CostLineItem[];
  options: SelectOption[];
  defaultCategory: string;
  addButtonLabel: string;
  onChange: (lines: CostLineItem[]) => void;
}

export function CostLineList({
  label,
  lines,
  options,
  defaultCategory,
  addButtonLabel,
  onChange,
}: CostLineListProps) {
  const total = lines.reduce((sum, l) => sum + (Number.isFinite(l.amount) ? l.amount : 0), 0);

  function updateLine(id: string, patch: Partial<CostLineItem>) {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    onChange(lines.filter((line) => line.id !== id));
  }

  function addLine() {
    onChange([...lines, createCostLine(defaultCategory)]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium text-white">{label}</Label>
        {lines.length > 0 && (
          <span className={cn('text-xs', BG_BOX_MUTED)}>Tổng: {formatMoneyDisplay(total)}</span>
        )}
      </div>

      {lines.length === 0 && (
        <p
          className={cn(
            'text-xs rounded-md border border-dashed border-white/20 p-3',
            BG_BOX_MUTED,
          )}
        >
          Chưa có dòng chi phí. Nhấn &quot;{addButtonLabel}&quot; để thêm chi tiết.
        </p>
      )}

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={line.id} className={cn('rounded-lg p-3 space-y-3', BG_BOX_INNER)}>
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-xs font-medium', BG_BOX_MUTED)}>Dòng {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={() => removeLine(line.id)}
                aria-label="Xóa dòng chi phí"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-white">Loại chi phí</Label>
                <CategorySelect
                  value={line.category}
                  onChange={(category) => updateLine(line.id, { category })}
                  options={options}
                  otherNote={line.customLabel}
                  onOtherNoteChange={(customLabel) => updateLine(line.id, { customLabel })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-white">Số tiền</Label>
                <MoneyInput
                  value={line.amount}
                  onChange={(amount) => updateLine(line.id, { amount })}
                  placeholder={getOptionPlaceholder(options, line.category)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-white">Ghi chú (tùy chọn)</Label>
                <Input
                  value={line.note ?? ''}
                  onChange={(e) => updateLine(line.id, { note: e.target.value })}
                  placeholder="VD: Chi nhánh quận 1"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addLine}
        className="w-full sm:w-auto border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
      >
        <Plus className="h-4 w-4 mr-2" />
        {addButtonLabel}
      </Button>
    </div>
  );
}
