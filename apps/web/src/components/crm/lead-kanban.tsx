'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Phone, GripVertical, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { PIPELINE_COLUMNS, type LeadPipelineStatus } from '@/types/crm';
import type { Lead } from '@/types/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface LeadKanbanProps {
  leadsByStatus: Record<LeadPipelineStatus, Lead[]>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onStatusChange: (leadId: string, status: LeadPipelineStatus) => void;
  onAssign: (lead: Lead) => void;
  onCreateAppointment: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
}

export function LeadKanban({
  leadsByStatus,
  isLoading,
  isError,
  onRetry,
  onStatusChange,
  onAssign,
  onCreateAppointment,
  onEdit,
}: LeadKanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<LeadPipelineStatus | null>(null);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={onRetry} />;

  function handleDragStart(e: React.DragEvent, leadId: string) {
    setDraggingId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, status: LeadPipelineStatus) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) onStatusChange(leadId, status);
    setDraggingId(null);
    setDropTarget(null);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[480px]">
      {PIPELINE_COLUMNS.map((col) => {
        const items = leadsByStatus[col.status] ?? [];
        return (
          <div
            key={col.status}
            className={cn(
              'flex-shrink-0 w-[280px] sm:w-[300px]',
              dropTarget === col.status && 'ring-2 ring-primary rounded-lg',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(col.status);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            <Card className="h-full">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', col.color)} />
                    {col.label}
                  </span>
                  <span className="text-muted-foreground font-normal">{items.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3 pt-0">
                <ScrollArea className="h-[420px] pr-2">
                  <div className="space-y-2">
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">Trống</p>
                    )}
                    {items.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                        className={cn(
                          'rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing',
                          draggingId === lead.id && 'opacity-50',
                        )}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-start gap-1 min-w-0 flex-1">
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 hidden sm:block" />
                            <div className="min-w-0">
                              <Link
                                href={`/leads?id=${lead.id}`}
                                className="font-medium text-sm hover:underline truncate block"
                              >
                                {lead.name}
                              </Link>
                              {lead.phone && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" />
                                  {lead.phone}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDateTime(lead.createdAt)}
                              </p>
                              {lead.assignedTo && (
                                <p className="text-xs mt-1">→ {lead.assignedTo.name}</p>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEdit(lead)}>Sửa</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onAssign(lead)}>
                                Gán nhân viên
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onCreateAppointment(lead)}>
                                Tạo lịch hẹn
                              </DropdownMenuItem>
                              {PIPELINE_COLUMNS.filter((c) => c.status !== lead.pipelineStatus).map(
                                (c) => (
                                  <DropdownMenuItem
                                    key={c.status}
                                    onClick={() => onStatusChange(lead.id, c.status)}
                                  >
                                    → {c.label}
                                  </DropdownMenuItem>
                                ),
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {lead.leadSource && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {lead.leadSource.name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
