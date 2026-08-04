'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PercentInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  max?: number;
}

export function PercentInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  max = 100,
}: PercentInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        min={0}
        max={max}
        step="0.1"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'pr-8 bg-white/10 border-white/20 text-white placeholder:text-white/40',
          className,
        )}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(0);
            return;
          }
          const parsed = parseFloat(raw);
          if (Number.isNaN(parsed)) return;
          onChange(Math.min(max, Math.max(0, parsed)));
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/60">
        %
      </span>
    </div>
  );
}

interface CountInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CountInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: CountInputProps) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      disabled={disabled}
      placeholder={placeholder}
      className={cn('bg-white/10 border-white/20 text-white placeholder:text-white/40', className)}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          onChange(0);
          return;
        }
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed)) return;
        onChange(Math.max(0, parsed));
      }}
    />
  );
}
