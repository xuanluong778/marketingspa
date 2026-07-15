'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AdvancedFieldSuggestion, AdvancedSuggestField } from '@/types/content-marketing';

export interface AiSuggestTextareaFieldProps {
  label: ReactNode;
  field: AdvancedSuggestField;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  productService: string;
  onSuggest: () => Promise<AdvancedFieldSuggestion>;
  isSuggesting?: boolean;
}

export function AiSuggestTextareaField({
  label,
  field,
  value,
  onChange,
  rows = 2,
  required,
  placeholder,
  disabled,
  productService,
  onSuggest,
  isSuggesting = false,
}: AiSuggestTextareaFieldProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);

  const handleSuggest = async () => {
    if (!productService.trim()) return;
    setMsg('');
    try {
      const result = await onSuggest();
      setOptions(result.options);
      setOpen(true);
      setMsg(result.source === 'ai' ? 'Gợi ý từ AI — chọn 1 option bên dưới' : 'Gợi ý mẫu — chọn 1 option bên dưới');
      setTimeout(() => setMsg(''), 4000);
    } catch {
      setMsg('Không tải được gợi ý — thử lại');
    }
  };

  const pickOption = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          {label}
          {required ? ' *' : null}
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={disabled || !productService.trim() || isSuggesting}
          onClick={() => void handleSuggest()}
        >
          {isSuggesting ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          Gợi ý AI
        </Button>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
      />

      {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}

      {open && options.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
          <p className="text-xs font-medium text-primary">Chọn một gợi ý:</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {options.map((opt, i) => (
              <button
                key={`${field}-${i}`}
                type="button"
                className={cn(
                  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm',
                  'hover:border-primary/40 hover:bg-primary/5 transition-colors',
                  value === opt && 'border-primary ring-1 ring-primary/30',
                )}
                onClick={() => pickOption(opt)}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-2">
                  {i + 1}
                </span>
                {opt}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setOpen(false)}
          >
            Đóng
          </button>
        </div>
      )}
    </div>
  );
}
