'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { mazCardSurfaceClass } from '@/lib/card-design-system';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  badge?: ReactNode;
  tone?: 'default' | 'warn' | 'danger';
  className?: string;
}

const TONE_BORDER: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'border-white/[0.12]',
  warn: 'border-amber-400/35 bg-amber-500/[0.08]',
  danger: 'border-red-400/35 bg-red-500/[0.08]',
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  badge,
  tone = 'default',
  className,
}: StatCardProps) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-white/60">{label}</p>
        <div className="flex items-center gap-2">
          {badge}
          {Icon ? <Icon className="h-4 w-4 text-white/45" aria-hidden /> : null}
        </div>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">{hint}</p> : null}
    </>
  );

  const shellClass = cn(
    mazCardSurfaceClass('p-5 transition-all duration-300'),
    TONE_BORDER[tone],
    href && 'hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.2)]',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(shellClass, 'block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50')}>
        {inner}
      </Link>
    );
  }

  return <div className={shellClass}>{inner}</div>;
}

export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(mazCardSurfaceClass('h-[96px] animate-pulse'), 'border-white/10 bg-white/[0.04]')}
        />
      ))}
    </div>
  );
}
