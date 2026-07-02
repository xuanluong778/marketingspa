import { cn } from '@/lib/utils';
import { BG_BOX_MUTED } from '@/components/business-goals/business-goals-theme';

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className={cn('text-xs leading-relaxed', BG_BOX_MUTED)}>{children}</p>;
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium leading-none text-white">
      {children}
    </label>
  );
}
