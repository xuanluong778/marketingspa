'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { LeadStatusBadge } from '@/components/crm/lead-status-badge';
import { CustomerFormDialog } from '@/components/crm/customer-form-dialog';
import {
  useCustomerHistory,
  useUpdateCustomer,
  useAddCustomerNote,
  useBranches,
  useLeadSources,
} from '@/hooks/use-crm';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { customerSourceDisplay } from '@/lib/customer-source-label';
import { useT } from '@/i18n/i18n-provider';

export default function CustomerDetailPage() {
  const t = useT();
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, isError, refetch } = useCustomerHistory(id);
  const { data: branches } = useBranches();
  const { data: leadSourcesData } = useLeadSources();
  const updateCustomer = useUpdateCustomer();
  const addNote = useAddCustomerNote();

  const [editOpen, setEditOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!data) return <EmptyState title={t('customers.notFound')} />;

  const { customer, leads, appointments, orders, consultationNotes } = data;
  const leadSources = leadSourcesData?.items ?? [];
  const branchList = Array.isArray(branches) ? branches : [];

  function submitNote() {
    if (!noteText.trim()) return;
    addNote.mutate(
      { customerId: id, content: noteText.trim() },
      { onSuccess: () => setNoteText('') },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{customer.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[customer.phone, customer.email].filter(Boolean).join(' · ') || '—'}
              {typeof data.totalSpend === 'number'
                ? ` · Doanh thu ${formatCurrency(data.totalSpend)}`
                : ''}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" />
          Sửa thông tin
        </Button>
      </div>

      {customer.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customer.tags.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <Tabs defaultValue="timeline" data-testid="customer-360-tabs">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="timeline">Hành trình 360</TabsTrigger>
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="leads">Lead ({leads.length})</TabsTrigger>
          <TabsTrigger value="appointments">Lịch hẹn ({appointments.length})</TabsTrigger>
          <TabsTrigger value="orders">Doanh thu ({orders.length})</TabsTrigger>
          <TabsTrigger value="channels" data-testid="customer-360-channels-tab">
            Kênh
          </TabsTrigger>
          <TabsTrigger value="notes">Ghi chú tư vấn</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          {(data.timeline ?? []).length === 0 ? (
            <EmptyState title={t('customers.emptyEvents')} />
          ) : (
            <ol
              data-testid="customer-360-timeline"
              className="space-y-3 border-l border-border pl-4"
            >
              {(data.timeline ?? []).map((item, idx) => (
                <li key={`${item.type}-${item.at}-${idx}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-foreground" />
                  <p className="text-xs text-muted-foreground">{formatDateTime(item.at)}</p>
                  <p className="text-sm font-medium">
                    <span className="mr-2 uppercase tracking-wide text-[11px] text-muted-foreground">
                      {item.type}
                    </span>
                    {item.title}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-4 sm:grid-cols-2 text-sm">
              <InfoRow label="Chi nhánh" value={customer.branch?.name} />
              <InfoRow
                label="Nguồn đầu tiên"
                value={customerSourceDisplay(
                  customer.firstSource ?? undefined,
                  (data as { firstSourceLabel?: string }).firstSourceLabel,
                )}
              />
              <InfoRow
                label="Nguồn gần nhất"
                value={customerSourceDisplay(
                  customer.latestSource ?? customer.source ?? undefined,
                  (data as { latestSourceLabel?: string }).latestSourceLabel ??
                    (data as { sourceLabel?: string }).sourceLabel,
                )}
              />
              <InfoRow label="Nguồn CRM (LeadSource)" value={customer.leadSource?.name} />
              <InfoRow label="Giới tính" value={customer.gender} />
              <InfoRow
                label="Ngày sinh"
                value={
                  customer.birthday
                    ? new Date(customer.birthday).toLocaleDateString('vi-VN')
                    : undefined
                }
              />
              <InfoRow label="Ngày tạo" value={formatDateTime(customer.createdAt)} />
              <div className="sm:col-span-2">
                <p className="text-muted-foreground mb-1">Ghi chú chung</p>
                <p>{customer.note || '—'}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          {leads.length === 0 ? (
            <EmptyState title={t('customers.emptyLeads')} />
          ) : (
            <div className="space-y-2">
              {leads.map((l) => (
                <Card key={l.id}>
                  <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</p>
                    </div>
                    <LeadStatusBadge status={l.pipelineStatus} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          {appointments.length === 0 ? (
            <EmptyState title={t('customers.emptyAppointments')} />
          ) : (
            <div className="space-y-2">
              {appointments.map((a) => (
                <Card key={a.id}>
                  <CardContent className="py-3 flex flex-wrap justify-between gap-2 text-sm">
                    <div>
                      <p className="font-medium">{formatDateTime(a.scheduledAt)}</p>
                      <p className="text-muted-foreground">
                        {a.service?.name ?? 'Dịch vụ'} · {a.employee?.name ?? '—'}
                      </p>
                    </div>
                    <Badge variant="outline">{a.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          {orders.length === 0 ? (
            <EmptyState title={t('customers.emptyOrders')} />
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <Card key={o.id}>
                  <CardContent className="py-3 flex flex-wrap justify-between gap-2 text-sm">
                    <div>
                      <p className="font-medium">{o.orderNumber}</p>
                      <p className="text-muted-foreground">{formatDateTime(o.orderedAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(Number(o.total))}</p>
                      <Badge variant="outline">{o.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="channels" className="mt-4 space-y-4" data-testid="customer-360-channels">
          <section>
            <h2 className="mb-2 text-sm font-medium">Email Marketing</h2>
            {(data.emailContacts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa gắn EmailContact</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(data.emailContacts ?? []).map((c) => (
                  <li key={c.id}>
                    {c.email} · {c.status}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">Zalo / Messenger / Chat</h2>
            {(data.messagingIdentities ?? []).length === 0 &&
            (data.conversations ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('customers.emptyChannelIdentity')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(data.messagingIdentities ?? []).map((i) => (
                  <li key={i.id}>
                    {i.channel}: {i.displayName || i.externalUserId}
                  </li>
                ))}
                {(data.conversations ?? []).map((c) => (
                  <li key={c.id}>
                    Hội thoại {c.channel || 'web'} · {c.status}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Thêm ghi chú tư vấn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Nội dung tư vấn..."
                rows={3}
              />
              <Button onClick={submitNote} disabled={addNote.isPending || !noteText.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                {addNote.isPending ? 'Đang lưu...' : 'Lưu ghi chú'}
              </Button>
            </CardContent>
          </Card>
          {consultationNotes.length === 0 ? (
            <EmptyState title={t('customers.emptyConsultNotes')} />
          ) : (
            <div className="space-y-2">
              {consultationNotes.map((n) => (
                <Card key={n.id}>
                  <CardContent className="py-3">
                    <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {n.authorName ?? 'Hệ thống'} · {formatDateTime(n.createdAt)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={customer}
        leadSources={leadSources}
        branches={branchList}
        onSubmit={(formData) =>
          updateCustomer.mutate({ id, ...formData }, { onSuccess: () => setEditOpen(false) })
        }
        isPending={updateCustomer.isPending}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}
