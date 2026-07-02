'use client';

import { PIPELINE_COLUMNS, pipelineLabel, type LeadPipelineStatus } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function LeadStatusBadge({ status, className }: { status: string; className?: string }) {
  const col = PIPELINE_COLUMNS.find((c) => c.status === status);
  return (
    <Badge
      variant="outline"
      className={cn('font-normal border-0 text-white', col?.color ?? 'bg-gray-500', className)}
    >
      {pipelineLabel(status)}
    </Badge>
  );
}

export function LeadStatusSelect({
  value,
  onChange,
  exclude,
}: {
  value: LeadPipelineStatus;
  onChange: (status: LeadPipelineStatus) => void;
  exclude?: LeadPipelineStatus[];
}) {
  const options = PIPELINE_COLUMNS.filter((c) => !exclude?.includes(c.status));
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((col) => (
        <button
          key={col.status}
          type="button"
          onClick={() => onChange(col.status)}
          className={cn(
            'px-2 py-1 rounded text-xs text-white transition-opacity',
            col.color,
            value === col.status
              ? 'ring-2 ring-offset-1 ring-primary'
              : 'opacity-70 hover:opacity-100',
          )}
        >
          {col.label}
        </button>
      ))}
    </div>
  );
}
