'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type FunnelInlineEditableProps = {
  value: string;
  canEdit?: boolean;
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
  onCommit: (next: string) => void;
  placeholder?: string;
};

export function FunnelInlineEditable({
  value,
  canEdit = false,
  multiline = false,
  className,
  inputClassName,
  onCommit,
  placeholder,
}: FunnelInlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function cancel() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDraft(value);
    setEditing(false);
  }

  function save() {
    const next = draft.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next !== value.trim()) onCommit(next);
    setEditing(false);
  }

  function scheduleSave(next: string) {
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (next.trim() !== value.trim()) onCommit(next.trim());
    }, 1200);
  }

  if (!canEdit) {
    return <span className={className}>{value}</span>;
  }

  if (editing) {
    const control = multiline ? (
      <Textarea
        autoFocus
        value={draft}
        rows={3}
        placeholder={placeholder}
        className={cn('min-h-[72px] text-sm', inputClassName)}
        onChange={(e) => scheduleSave(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
        }}
      />
    ) : (
      <Input
        autoFocus
        value={draft}
        placeholder={placeholder}
        className={cn('text-sm', inputClassName)}
        onChange={(e) => scheduleSave(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
      />
    );

    return (
      <div className="space-y-2">
        {control}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={save}>
            Lưu
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancel}>
            Hủy
          </Button>
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn(
        'group relative inline-flex max-w-full items-start gap-1 rounded-md',
        canEdit && 'cursor-pointer pr-1 hover:bg-white/5',
        className,
      )}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="min-w-0 break-words">{value || placeholder || '—'}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-white/70 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <Pencil className="h-3 w-3" aria-hidden />
        Sửa
      </span>
    </span>
  );
}

export function FunnelInlineColorPicker({
  label,
  value,
  canEdit,
  onCommit,
}: {
  label: string;
  value?: string;
  canEdit?: boolean;
  onCommit: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value || '#F97316';

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/70">
        <span
          className="inline-block h-4 w-4 rounded border border-white/20"
          style={{ backgroundColor: current }}
        />
        {label}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border border-white/15 px-2 py-1 hover:bg-white/5"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="inline-block h-4 w-4 rounded border border-white/20"
          style={{ backgroundColor: current }}
        />
        <Pencil className="h-3 w-3 opacity-70" />
        {label}
      </button>
      {open ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={current}
            className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            onChange={(e) => onCommit(e.target.value)}
          />
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Xong
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function FunnelSavedToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
      role="status"
    >
      Đã lưu
    </div>
  );
}
