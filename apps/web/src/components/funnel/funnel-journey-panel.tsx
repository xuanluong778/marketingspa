'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { FunnelLeadDashboard } from '@/components/funnel/funnel-lead-dashboard';
import { LeadFormDialog } from '@/components/crm/lead-form-dialog';
import { useFunnelJourney } from '@/hooks/use-customer-journey';
import {
  useBranches,
  useLead,
  useLeadSources,
  useUpdateLead,
} from '@/hooks/use-crm';
import { useEmployees } from '@/hooks/use-queries';
import { funnelHref, funnelListTitle } from '@/lib/funnel-tabs';
import { pipelineLabel } from '@/types/crm';
import type { FunnelJourneySummary } from '@/types/customer-journey';
import { useT } from '@/i18n/i18n-provider';

type Props = {
  recommendations?: Array<{
    id: string;
    prompt: string;
    selectedSlug?: string | null;
    name?: string | null;
  }>;
  initialFunnelId?: string | null;
  initialLeadId?: string | null;
};

export function FunnelJourneyPanel({
  recommendations = [],
  initialFunnelId,
  initialLeadId,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [funnelId, setFunnelId] = useState(initialFunnelId || recommendations[0]?.id || '');
  const [leadSearch, setLeadSearch] = useState(initialLeadId || '');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId || null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (initialFunnelId) setFunnelId(initialFunnelId);
    else if (!funnelId && recommendations[0]?.id) setFunnelId(recommendations[0].id);
  }, [initialFunnelId, recommendations, funnelId]);

  useEffect(() => {
    setSelectedLeadId(initialLeadId || null);
    if (initialLeadId) setLeadSearch(initialLeadId);
  }, [initialLeadId]);

  const funnelQuery = useFunnelJourney(funnelId || null);
  const leadDetail = useLead(selectedLeadId || '');
  const updateLead = useUpdateLead();
  const { data: leadSourcesData } = useLeadSources();
  const { data: branches } = useBranches();
  const { data: employeesData } = useEmployees();

  const summary =
    funnelQuery.data && !('timeline' in funnelQuery.data)
      ? (funnelQuery.data as FunnelJourneySummary)
      : null;

  function selectLead(id: string | null) {
    setSelectedLeadId(id);
    setLeadSearch(id || '');
    router.replace(funnelHref({ tab: 'customers', funnel: funnelId || null, lead: id }), {
      scroll: false,
    });
  }

  function changeFunnel(next: string) {
    const id = next === 'none' ? '' : next;
    setFunnelId(id);
    setSelectedLeadId(null);
    setLeadSearch('');
    router.replace(funnelHref({ tab: 'customers', funnel: id || null }), { scroll: false });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Lead lấy từ CRM theo tổ chức. Cập nhật ở phễu, CRM hay booking sẽ hiện cùng một dữ liệu.
      </p>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] space-y-1">
          <Label className="text-xs">Funnel</Label>
          <Select value={funnelId || 'none'} onValueChange={changeFunnel}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn funnel" />
            </SelectTrigger>
            <SelectContent>
              {recommendations.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {funnelListTitle(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label className="text-xs">Lead ID</Label>
          <div className="flex gap-2">
            <Input
              placeholder="UUID lead…"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => selectLead(leadSearch.trim() || null)}
            >
              Xem
            </Button>
          </div>
        </div>
      </div>

      {selectedLeadId ? (
        <FunnelLeadDashboard
          leadId={selectedLeadId}
          funnelId={funnelId || null}
          onBack={() => selectLead(null)}
          onEdit={() => setEditOpen(true)}
        />
      ) : funnelQuery.isLoading ? (
        <LoadingState />
      ) : funnelQuery.isError ? (
        <ErrorState onRetry={funnelQuery.refetch} />
      ) : summary ? (
        <div className="space-y-3">
          {summary.leads.length === 0 ? (
            <EmptyState
              title={t('funnel.noLeadsInFunnel')}
              description="Submit form hoặc chatbot để tạo journey"
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {summary.leads.map((l) => (
                <Card
                  key={l.leadId}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => selectLead(l.leadId)}
                >
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">{l.leadName}</p>
                      {(l.phone || l.email) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {[l.phone, l.email].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <div className="mt-2">
                        <Badge variant="secondary">{pipelineLabel(l.pipelineStatus)}</Badge>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{l.stepsCompleted.length} bước</p>
                      <p>{l.lastStep?.label ?? '—'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title="Chọn funnel"
          description="Chọn funnel hoặc nhập Lead ID để xem chi tiết"
        />
      )}

      <LeadFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={leadDetail.data ?? undefined}
        leadSources={leadSourcesData?.items ?? []}
        branches={Array.isArray(branches) ? branches : []}
        employees={employeesData?.items ?? []}
        onSubmit={(formData) => {
          if (!selectedLeadId) return;
          updateLead.mutate(
            { id: selectedLeadId, ...formData },
            { onSuccess: () => setEditOpen(false) },
          );
        }}
        isPending={updateLead.isPending}
      />
    </div>
  );
}
