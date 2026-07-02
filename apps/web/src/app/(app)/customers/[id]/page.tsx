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

export default function CustomerDetailPage() {
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
  if (!data) return <EmptyState title="Không tìm thấy khách hàng" />;

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

      <Tabs defaultValue="info">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="leads">Lead ({leads.length})</TabsTrigger>
          <TabsTrigger value="appointments">Lịch hẹn ({appointments.length})</TabsTrigger>
          <TabsTrigger value="orders">Mua hàng ({orders.length})</TabsTrigger>
          <TabsTrigger value="notes">Ghi chú tư vấn</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-4 sm:grid-cols-2 text-sm">
              <InfoRow label="Chi nhánh" value={customer.branch?.name} />
              <InfoRow label="Nguồn khách" value={customer.leadSource?.name} />
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
            <EmptyState title="Chưa có lead" />
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
            <EmptyState title="Chưa có lịch hẹn" />
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
            <EmptyState title="Chưa có đơn hàng" />
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
            <EmptyState title="Chưa có ghi chú tư vấn" />
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
