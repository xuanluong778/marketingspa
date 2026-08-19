'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  ExternalLink,
  Mail,
  Pencil,
  Phone,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import {
  CustomerJourneyTimeline,
  formExtrasFromJourney,
} from '@/components/funnel/customer-journey-timeline';
import { useLead } from '@/hooks/use-crm';
import { useLeadJourney } from '@/hooks/use-customer-journey';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { funnelHref, funnelListTitle } from '@/lib/funnel-tabs';
import { pipelineLabel } from '@/types/crm';
import { cn } from '@/lib/utils';

type Props = {
  leadId: string;
  funnelId?: string | null;
  compact?: boolean;
  onBack?: () => void;
  onEdit?: () => void;
};

function money(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">{children}</CardContent>
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

export function FunnelLeadDashboard({ leadId, funnelId, compact, onBack, onEdit }: Props) {
  const router = useRouter();
  const leadQuery = useLead(leadId);
  const journeyQuery = useLeadJourney(leadId);
  const lead = leadQuery.data;
  const journey = journeyQuery.data;

  if (leadQuery.isLoading) return <LoadingState message="Đang tải lead…" />;
  if (leadQuery.isError || !lead) {
    return <ErrorState onRetry={() => void leadQuery.refetch()} />;
  }

  const form = formExtrasFromJourney(journey?.timeline ?? []);
  const firstTouch = (lead.attribution?.firstTouchJson ?? {}) as Record<string, unknown>;
  const utmSource =
    (typeof firstTouch.utmSource === 'string' && firstTouch.utmSource) ||
    lead.attribution?.utmSource ||
    lead.leadSource?.name;
  const resolvedFunnelId = funnelId || lead.funnelRecommendationId || journey?.funnelId || null;
  const bookings = lead.appointments ?? [];
  const orders = lead.orders ?? [];
  const revenue = orders
    .filter((o) => o.status === 'PAID' || o.status === 'PARTIALLY_PAID')
    .reduce((sum, o) => sum + (money(o.total) ?? 0), 0);
  const estimated = money(lead.estimatedValue);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-[hsl(var(--heading))]">{lead.name}</h2>
            <Badge variant="secondary">{pipelineLabel(lead.pipelineStatus)}</Badge>
            {lead.qualification ? <Badge variant="outline">{lead.qualification}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[lead.phone, lead.email].filter(Boolean).join(' · ') || 'Chưa có SĐT / email'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onBack ? (
            <Button type="button" size="sm" variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Quay lại danh sách
            </Button>
          ) : null}
          {!compact ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/leads?id=${lead.id}`)}
            >
              <ExternalLink className="mr-1 h-4 w-4" />
              Xem CRM
            </Button>
          ) : null}
          {onEdit ? (
            <Button type="button" size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-4 w-4" />
              Chỉnh sửa Lead
            </Button>
          ) : null}
          {lead.phone ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={`tel:${lead.phone}`}>
                <Phone className="mr-1 h-4 w-4" />
                Gọi điện
              </a>
            </Button>
          ) : null}
          {lead.email ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={`mailto:${lead.email}`}>
                <Mail className="mr-1 h-4 w-4" />
                Email
              </a>
            </Button>
          ) : null}
          {resolvedFunnelId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.replace(funnelHref({ tab: 'mine', draft: resolvedFunnelId }))}
            >
              Xem phễu
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3')}>
        <SectionCard title="Thông tin khách hàng">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Họ tên" value={lead.name} />
            <Field label="SĐT" value={lead.phone} />
            <Field label="Email" value={lead.email} />
            <Field label="Chi nhánh" value={lead.branch?.name} />
            <Field label="Khách CRM" value={lead.customer?.name} />
            {lead.tags?.length ? (
              <div className="sm:col-span-2 flex flex-wrap gap-1">
                {lead.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Thông tin form">
          {form.rows.length ? (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {form.rows.map((row) => (
                <div key={`${row.label}-${row.value}`}>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-sm font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : lead.note ? (
            <p className="whitespace-pre-wrap text-sm">{lead.note}</p>
          ) : (
            <EmptyHint text="Chưa có câu trả lời form." />
          )}
          {form.formId ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Form {form.formId}</p>
          ) : null}
        </SectionCard>

        <SectionCard title="Nguồn / UTM">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nguồn" value={lead.leadSource?.name} />
            <Field label="UTM source" value={utmSource} />
            <Field
              label="UTM medium"
              value={
                (typeof firstTouch.utmMedium === 'string' && firstTouch.utmMedium) ||
                lead.attribution?.utmMedium
              }
            />
            <Field
              label="UTM campaign"
              value={
                (typeof firstTouch.utmCampaign === 'string' && firstTouch.utmCampaign) ||
                lead.attribution?.utmCampaign
              }
            />
            <Field
              label="Landing"
              value={
                (typeof firstTouch.landingPage === 'string' && firstTouch.landingPage) ||
                lead.attribution?.landingPage
              }
            />
            <Field
              label="Phễu"
              value={
                lead.funnelRecommendation
                  ? funnelListTitle(lead.funnelRecommendation)
                  : resolvedFunnelId
              }
            />
          </div>
        </SectionCard>

        <SectionCard title="Trạng thái CRM">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Pipeline" value={pipelineLabel(lead.pipelineStatus)} />
            <Field label="Stage" value={lead.stage?.name} />
            <Field label="Điểm" value={lead.score != null ? String(lead.score) : null} />
            <Field label="Phụ trách" value={lead.assignedTo?.name} />
            <Field label="Tạo lúc" value={formatDateTime(lead.createdAt)} />
            <Field
              label="Cập nhật"
              value={lead.updatedAt ? formatDateTime(lead.updatedAt) : null}
            />
          </div>
        </SectionCard>

        <SectionCard title="Booking">
          {bookings.length === 0 ? (
            <EmptyHint text="Chưa có lịch hẹn." />
          ) : (
            <ul className="space-y-2">
              {bookings.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{a.service?.name || 'Lịch hẹn'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(a.scheduledAt)} · {a.status}
                      {a.employee?.name ? ` · ${a.employee.name}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Purchase">
          {orders.length === 0 ? (
            <EmptyHint text="Chưa có đơn hàng." />
          ) : (
            <ul className="space-y-2">
              {orders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex items-start gap-2 text-sm">
                  <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{o.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.status} · {formatDateTime(o.orderedAt)} · {formatCurrency(money(o.total) ?? 0)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Revenue" className={compact ? undefined : 'md:col-span-2 xl:col-span-1'}>
          <div className="flex items-center gap-3">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(revenue)}</p>
              <p className="text-xs text-muted-foreground">
                Đơn đã thanh toán
                {estimated != null ? ` · ước tính ${formatCurrency(estimated)}` : ''}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Hành trình khách hàng">
        {journeyQuery.isLoading ? (
          <LoadingState />
        ) : journeyQuery.isError ? (
          <ErrorState onRetry={() => void journeyQuery.refetch()} />
        ) : (
          <CustomerJourneyTimeline
            timeline={journey?.timeline ?? []}
            stepsCompleted={journey?.stepsCompleted}
            compact={compact}
          />
        )}
      </SectionCard>
    </div>
  );
}
