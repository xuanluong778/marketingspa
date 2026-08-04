'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SuggestComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export function SuggestCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
}: SuggestComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div className="relative">
        <Input
          value={query}
          placeholder={placeholder}
          list={listId}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onChange(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
          tabIndex={-1}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {filtered.map((item) => (
            <li key={item}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(item);
                  onChange(item);
                  setOpen(false);
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ServicesFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

export function ServicesSuggestField({ value, onChange, options }: ServicesFieldProps) {
  const [picker, setPicker] = useState('');
  const lines = value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  function addService(item: string) {
    const trimmed = item.trim();
    if (!trimmed || lines.includes(trimmed)) return;
    onChange([...lines, trimmed].join('\n'));
    setPicker('');
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <SuggestCombobox
            value={picker}
            onChange={setPicker}
            options={options.filter((o) => !lines.includes(o))}
            placeholder="Chọn dịch vụ gợi ý..."
          />
        </div>
        <Button type="button" variant="outline" onClick={() => addService(picker)}>
          Thêm
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {options.slice(0, 8).map((opt) => (
          <button
            key={opt}
            type="button"
            className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
            onClick={() => addService(opt)}
          >
            + {opt}
          </button>
        ))}
      </div>
      <textarea
        className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        placeholder="Mỗi dòng một dịch vụ, hoặc chọn từ gợi ý phía trên"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
