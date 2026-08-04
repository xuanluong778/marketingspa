'use client';

import { Bell, MoreHorizontal, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  APPOINTMENT_STATUSES,
  appointmentStatusLabel,
  type AppointmentDetail,
  type AppointmentStatus,
} from '@/types/appointments';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface AppointmentCardProps {
  appointment: AppointmentDetail;
  onEdit: (a: AppointmentDetail) => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onRemind: (id: string) => void;
  isReminding?: boolean;
}

export function AppointmentCard({
  appointment: a,
  onEdit,
  onStatusChange,
  onRemind,
  isReminding,
}: AppointmentCardProps) {
  const customerName = a.customer?.name ?? a.lead?.name ?? 'Khách';
  const phone = a.customer?.phone ?? a.lead?.phone;
  const consultant = a.employee?.name ?? a.lead?.assignedTo?.name;

  const statusMeta = APPOINTMENT_STATUSES.find((s) => s.value === a.status);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{customerName}</h3>
              <Badge
                variant="outline"
                className={cn('border-0 text-white text-xs', statusMeta?.color ?? 'bg-gray-500')}
              >
                {appointmentStatusLabel(a.status)}
              </Badge>
            </div>
            {phone && <p className="text-sm text-muted-foreground">{phone}</p>}
            <p className="text-sm">
              <span className="text-muted-foreground">Dịch vụ:</span> {a.service?.name ?? '—'}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">NV tư vấn:</span> {consultant ?? '—'}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Chi nhánh:</span> {a.branch?.name ?? '—'}
            </p>
            <p className="text-sm font-medium">{formatDateTime(a.scheduledAt)}</p>
            {a.note && <p className="text-sm text-muted-foreground italic mt-1">{a.note}</p>}
          </div>

          <div className="flex flex-wrap gap-1 shrink-0">
            {APPOINTMENT_STATUSES.filter((s) => s.value !== a.status)
              .slice(0, 3)
              .map((s) => (
                <Button
                  key={s.value}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => onStatusChange(a.id, s.value)}
                >
                  {s.label}
                </Button>
              ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(a)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Sửa lịch hẹn
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRemind(a.id)} disabled={isReminding}>
                  <Bell className="h-4 w-4 mr-2" />
                  Gửi nhắc lịch (giả lập)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {APPOINTMENT_STATUSES.map((s) => (
                  <DropdownMenuItem key={s.value} onClick={() => onStatusChange(a.id, s.value)}>
                    Đổi → {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
