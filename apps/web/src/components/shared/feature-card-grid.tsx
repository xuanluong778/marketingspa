import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FeatureCardGrid({
  children,
  className,
  dense,
}: {
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 gap-4',
        dense
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCardGrid({
  children,
  className,
  columns,
}: {
  children: ReactNode;
  className?: string;
  columns?: 'default' | 'wide';
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 gap-4',
        columns === 'wide'
          ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
