'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SelectOption } from '@/config/business-goals-options';
import { cn } from '@/lib/utils';
import { BG_BOX_MUTED } from '@/components/business-goals/business-goals-theme';

const triggerClass =
  'bg-white/10 border-white/20 text-white [&>span]:text-white data-[placeholder]:text-white/40';

interface CategorySelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  otherNote?: string;
  onOtherNoteChange?: (note: string) => void;
  otherNotePlaceholder?: string;
}

export function CategorySelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Chọn loại',
  otherNote,
  onOtherNoteChange,
  otherNotePlaceholder = 'Nhập tên loại khác...',
}: CategorySelectProps) {
  const isOther = value === 'OTHER';

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={triggerClass}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isOther && onOtherNoteChange && (
        <div className="space-y-1">
          <Label className={cn('text-xs', BG_BOX_MUTED)}>Ghi chú loại khác</Label>
          <Input
            value={otherNote ?? ''}
            onChange={(e) => onOtherNoteChange(e.target.value)}
            placeholder={otherNotePlaceholder}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
        </div>
      )}
    </div>
  );
}
