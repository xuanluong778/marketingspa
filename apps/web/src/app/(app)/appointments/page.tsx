'use client';

import { useState } from 'react';
import { formatISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { AppointmentCard } from '@/components/appointments/appointment-card';
import { AppointmentFormDialog } from '@/components/appointments/appointment-form-dialog';
import {
  useAppointmentsCalendar,
  useAppointmentsList,
  useSpaServices,
  useCreateAppointment,
  useUpdateAppointment,
  useUpdateAppointmentStatus,
  useSendAppointmentReminder,
} from '@/hooks/use-appointments';
import { useBranches } from '@/hooks/use-crm';
import { useEmployees, useCustomers } from '@/hooks/use-queries';
import type {
  AppointmentDetail,
  AppointmentPageView,
  AppointmentStatus,
} from '@/types/appointments';

function getDateRange(view: AppointmentPageView, anchor: Date) {
  if (view === 'day') {
    const d = formatISO(anchor, { representation: 'date' });
    return { date: d, from: d, to: d };
  }
  if (view === 'week') {
    const from = formatISO(startOfWeek(anchor, { weekStartsOn: 1 }), { representation: 'date' });
    const to = formatISO(endOfWeek(anchor, { weekStartsOn: 1 }), { representation: 'date' });
    return { date: formatISO(anchor, { representation: 'date' }), from, to };
  }
  if (view === 'month') {
    const from = formatISO(startOfMonth(anchor), { representation: 'date' });
    const to = formatISO(endOfMonth(anchor), { representation: 'date' });
    return { date: formatISO(anchor, { representation: 'date' }), from, to };
  }
  const from = formatISO(startOfMonth(anchor), { representation: 'date' });
  const to = formatISO(endOfMonth(anchor), { representation: 'date' });
  return { from, to };
}

export default function AppointmentsPage() {
  const [view, setView] = useState<AppointmentPageView>('day');
  const [anchor, setAnchor] = useState(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentDetail | null>(null);
  const [remindId, setRemindId] = useState<string | null>(null);

  const range = getDateRange(view, anchor);
  const calendarView = view === 'list' ? 'month' : view;

  const calendar = useAppointmentsCalendar(calendarView as 'day' | 'week' | 'month', range.date);
  const list = useAppointmentsList({
    from: range.from + 'T00:00:00.000Z',
    to: range.to + 'T23:59:59.999Z',
    pageSize: '100',
  });

  const { data: services } = useSpaServices();
  const { data: branches } = useBranches();
  const { data: employeesData } = useEmployees();
  const { data: customersData } = useCustomers({ pageSize: '100' });

  const createAppt = useCreateAppointment();
  const updateAppt = useUpdateAppointment();
  const updateStatus = useUpdateAppointmentStatus();
  const sendReminder = useSendAppointmentReminder();

  const isCalendarView = view !== 'list';
  const { data, isLoading, isError, refetch } = isCalendarView ? calendar : list;
  const appointments: AppointmentDetail[] = isCalendarView
    ? ((data as AppointmentDetail[] | undefined) ?? [])
    : ((data as { items: AppointmentDetail[] } | undefined)?.items ?? []);

  const branchList = Array.isArray(branches) ? branches : [];
  const employees = employeesData?.items ?? [];
  const customers = customersData?.items ?? [];

  function shiftAnchor(days: number) {
    const d = new Date(anchor);
    if (view === 'month' || view === 'list') d.setMonth(d.getMonth() + days);
    else if (view === 'week') d.setDate(d.getDate() + days * 7);
    else d.setDate(d.getDate() + days);
    setAnchor(d);
  }

  const periodLabel =
    view === 'day'
      ? anchor.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })
      : view === 'week'
        ? `Tuần ${range.from} — ${range.to}`
        : anchor.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <PageHeader title="Lịch hẹn" description="Quản lý lịch hẹn spa">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Tạo lịch hẹn
        </Button>
      </PageHeader>

      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v as AppointmentPageView);
          setAnchor(new Date());
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <TabsList>
            <TabsTrigger value="day">Hôm nay</TabsTrigger>
            <TabsTrigger value="week">Tuần</TabsTrigger>
            <TabsTrigger value="month">Tháng</TabsTrigger>
            <TabsTrigger value="list">Danh sách</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shiftAnchor(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">{periodLabel}</span>
            <Button variant="outline" size="icon" onClick={() => shiftAnchor(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
              Hôm nay
            </Button>
          </div>
        </div>

        {['day', 'week', 'month', 'list'].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-0">
            {isLoading && <LoadingState />}
            {isError && <ErrorState onRetry={refetch} />}
            {!isLoading && !isError && appointments.length === 0 && (
              <EmptyState title="Không có lịch hẹn trong kỳ này" />
            )}
            {!isLoading && !isError && appointments.length > 0 && (
              <div className="space-y-3">
                {appointments.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    onEdit={(appt) => {
                      setEditing(appt);
                      setFormOpen(true);
                    }}
                    onStatusChange={(id, status: AppointmentStatus) =>
                      updateStatus.mutate({ id, status })
                    }
                    onRemind={(id) => {
                      setRemindId(id);
                      sendReminder.mutate(id, { onSettled: () => setRemindId(null) });
                    }}
                    isReminding={remindId === a.id && sendReminder.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <AppointmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing ?? undefined}
        branches={branchList}
        employees={employees}
        services={services ?? []}
        customers={customers}
        isPending={createAppt.isPending || updateAppt.isPending}
        onSubmit={(formData) => {
          if (editing) {
            updateAppt.mutate(
              { id: editing.id, ...formData },
              { onSuccess: () => setFormOpen(false) },
            );
          } else {
            createAppt.mutate(formData, { onSuccess: () => setFormOpen(false) });
          }
        }}
      />
    </div>
  );
}
