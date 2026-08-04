'use client';

import type { ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import type { TeleprompterTheme } from '@/lib/teleprompter-storage';

type TeleprompterScriptEditorProps = {
  value: string;
  onChange: (value: string) => void;
  fontSize: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
  theme: TeleprompterTheme;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function TeleprompterScriptEditor({
  value,
  onChange,
  fontSize,
  lineHeight,
  textAlign,
  theme,
  disabled = false,
  placeholder = 'Dán hoặc viết kịch bản của bạn ở đây…',
  className,
}: TeleprompterScriptEditorProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value);

  return (
    <textarea
      aria-label="Kịch bản teleprompter"
      value={value}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck
      className={cn(
        'min-h-[420px] w-full resize-y rounded-xl border p-5 outline-none transition focus:ring-2 focus:ring-[#0A3D30]/40 disabled:cursor-not-allowed disabled:opacity-60',
        theme === 'dark'
          ? 'border-slate-700 bg-slate-950 text-slate-50 placeholder:text-slate-500'
          : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400',
        className,
      )}
      style={{
        fontSize: `${Math.max(16, Math.min(fontSize, 48))}px`,
        lineHeight,
        textAlign,
      }}
    />
  );
}
