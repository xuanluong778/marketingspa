'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-input';
import { cn } from '@/lib/utils';

interface MoneyInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onFocus?: () => void;
}

export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  onFocus,
}: MoneyInputProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(() => formatMoneyInput(safeValue));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDisplay(formatMoneyInput(safeValue));
    }
  }, [safeValue, focused]);

  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'pr-8 bg-white/10 border-white/20 text-white placeholder:text-white/40',
          disabled && 'opacity-60',
          className,
        )}
        value={display}
        onFocus={() => {
          setFocused(true);
          setDisplay(safeValue > 0 ? formatMoneyInput(safeValue) : '');
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = parseMoneyInput(display);
          onChange(parsed);
          setDisplay(formatMoneyInput(parsed));
        }}
        onChange={(e) => {
          const parsed = parseMoneyInput(e.target.value);
          setDisplay(formatMoneyInput(parsed));
          if (focused) onChange(parsed);
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/60">
        đ
      </span>
    </div>
  );
}
