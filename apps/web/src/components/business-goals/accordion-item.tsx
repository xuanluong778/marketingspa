'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BG_BOX,
  BG_BOX_FIELDS,
  BG_BOX_HOVER,
  BG_BOX_MUTED,
} from '@/components/business-goals/business-goals-theme';

interface AccordionItemProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AccordionItem({ title, icon, defaultOpen = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-lg overflow-hidden', BG_BOX)}>
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-white transition-colors',
          BG_BOX_HOVER,
        )}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium text-sm">
          {icon}
          {title}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform',
            BG_BOX_MUTED,
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className={cn('px-4 pb-4 pt-3 border-t border-white/10', BG_BOX_FIELDS)}>
          {children}
        </div>
      )}
    </div>
  );
}
