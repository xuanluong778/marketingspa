'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Input } from '@/components/ui/input';

export type AutoPostScheduleDatetimeInputHandle = {
  focusAndOpenPicker: () => void;
};

const inputClassName =
  'h-9 w-[190px] cursor-pointer border-white/25 bg-white/10 py-0 text-sm [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert';

type Props = {
  id: string;
  min: string;
  value: string;
  onChange: (value: string) => void;
};

/** datetime-local for Auto Post schedule bar — opens native picker on click. */
export const AutoPostScheduleDatetimeInput = forwardRef<
  AutoPostScheduleDatetimeInputHandle,
  Props
>(function AutoPostScheduleDatetimeInput({ id, min, value, onChange }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      /* showPicker optional — native indicator still works */
    }
  }, []);

  useImperativeHandle(ref, () => ({
    focusAndOpenPicker: () => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      openPicker();
    },
  }));

  return (
    <Input
      ref={inputRef}
      id={id}
      type="datetime-local"
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={openPicker}
      style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', height: 36 }}
      className={inputClassName}
    />
  );
});
