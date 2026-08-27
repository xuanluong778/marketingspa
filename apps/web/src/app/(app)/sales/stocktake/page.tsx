'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { SalesBarcodeScan } from '@/components/sales/sales-barcode-scan';
import {
  useCancelStocktake,
  useConfirmStocktake,
  useCreateStocktake,
  useStockReconcile,
  useStockReconcileFix,
  useStocktake,
  useStocktakes,
  useUpdateStocktakeLines,
} from '@/hooks/use-sales';
import { formatDateTime } from '@/lib/format';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useT } from '@/i18n/i18n-provider';

type Line = {
  id: string;
  productId: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  note?: string | null;
  product?: { id: string; name: string; sku?: string | null; barcode?: string | null };
};

export default function SalesStocktakePage() {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});

  const list = useStocktakes({ page: 1 });
  const detail = useStocktake(selectedId);
  const create = useCreateStocktake();
  const updateLines = useUpdateStocktakeLines();
  const confirm = useConfirmStocktake();
  const cancel = useCancelStocktake();
  const reconcile = useStockReconcile(true);
  const reconcileFix = useStockReconcileFix();

  const items = (list.data?.items ?? []) as Array<{
    id: string;
    code: string;
    status: string;
    createdAt: string;
    _count?: { lines: number };
  }>;
  const st = detail.data as
    | {
        id: string;
        code: string;
        status: string;
        lines: Line[];
      }
    | undefined;

  const lines = st?.lines ?? [];
  const isDraft = st?.status === 'DRAFT';

  const varianceTotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(draftCounts[l.productId] ?? l.countedQty) - l.systemQty), 0),
    [lines, draftCounts],
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title={t('nav.salesStocktake')} description={t('sales.stocktakeDesc')}>
        <Button
          type="button"
          className="bg-[#F97316] text-white"
          disabled={create.isPending}
          onClick={() => {
            setMsg('');
            setErr('');
            create.mutate(
              {},
              {
                onSuccess: (row: { id: string }) => {
                  setMsg(t('sales.stocktakeCreated'));
                  setSelectedId(row.id);
                  void list.refetch();
                },
                onError: (e) => setErr(formatMutationError(e, t('sales.stockFailed'))),
              },
            );
          }}
        >
          {t('sales.newStocktake')}
        </Button>
      </PageHeader>

      {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-sm text-amber-200">{err}</p> : null}

      <div className="rounded-xl border border-white/10 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">{t('sales.reconcileTitle')}</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={reconcileFix.isPending || reconcile.data?.ok}
            onClick={() => {
              reconcileFix.mutate(undefined, {
                onSuccess: () => {
                  setMsg(t('sales.reconcileFixed'));
                  void reconcile.refetch();
                },
                onError: (e) => setErr(formatMutationError(e, t('sales.stockFailed'))),
              });
            }}
          >
            {t('sales.reconcileFix')}
          </Button>
        </div>
        {reconcile.isLoading ? <LoadingState /> : null}
        {reconcile.data ? (
          <p className="text-sm text-muted-foreground">
            {reconcile.data.ok
              ? t('sales.reconcileOk')
              : t('sales.reconcileMismatch', {
                  count: String(reconcile.data.counts.mismatches ?? 0),
                })}
          </p>
        ) : null}
        {reconcile.data?.mismatches?.length ? (
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
            {reconcile.data.mismatches.slice(0, 20).map((m) => (
              <li key={m.productId}>
                {m.name}: stock={m.stockQty} batchSum={m.batchSum} (Δ{m.delta})
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">{t('sales.stocktakeList')}</h2>
          {list.isLoading ? <LoadingState /> : null}
          {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : null}
          {!list.isLoading && !items.length ? (
            <EmptyState title={t('sales.emptyStocktakes')} />
          ) : null}
          {items.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                selectedId === row.id ? 'border-[#F97316] bg-white/10' : 'border-white/10'
              }`}
              onClick={() => {
                setSelectedId(row.id);
                setDraftCounts({});
              }}
            >
              <span className="font-mono text-white">{row.code}</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline">{row.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {!selectedId ? (
            <EmptyState title={t('sales.pickStocktake')} />
          ) : detail.isLoading ? (
            <LoadingState />
          ) : detail.isError ? (
            <ErrorState onRetry={() => void detail.refetch()} />
          ) : st ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-white">{st.code}</h2>
                <Badge>{st.status}</Badge>
              </div>
              {isDraft ? (
                <SalesBarcodeScan
                  onFound={(p) => {
                    const line = lines.find((l) => l.productId === p.id);
                    if (!line) {
                      setErr(t('sales.scanNotInStocktake'));
                      return;
                    }
                    const cur = Number(draftCounts[p.id] ?? line.countedQty);
                    setDraftCounts((prev) => ({ ...prev, [p.id]: String(cur + 1) }));
                    setMsg(`${p.name}: ${cur + 1}`);
                  }}
                />
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-white/5 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">{t('sales.product')}</th>
                      <th className="p-2 text-right">{t('sales.systemQty')}</th>
                      <th className="p-2 text-right">{t('sales.countedQty')}</th>
                      <th className="p-2 text-right">{t('sales.variance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const counted = draftCounts[l.productId] ?? String(l.countedQty);
                      const variance = Number(counted) - l.systemQty;
                      return (
                        <tr key={l.id} className="border-t border-white/5">
                          <td className="p-2 text-white">
                            {l.product?.name}
                            <div className="text-xs text-muted-foreground">
                              {l.product?.sku || l.product?.barcode || ''}
                            </div>
                          </td>
                          <td className="p-2 text-right font-mono">{l.systemQty}</td>
                          <td className="p-2 text-right">
                            {isDraft ? (
                              <Input
                                className="ml-auto h-8 w-20 text-right"
                                type="number"
                                min={0}
                                value={counted}
                                onChange={(e) =>
                                  setDraftCounts((prev) => ({
                                    ...prev,
                                    [l.productId]: e.target.value,
                                  }))
                                }
                              />
                            ) : (
                              <span className="font-mono">{l.countedQty}</span>
                            )}
                          </td>
                          <td
                            className={`p-2 text-right font-mono ${
                              variance === 0
                                ? ''
                                : variance > 0
                                  ? 'text-emerald-300'
                                  : 'text-amber-200'
                            }`}
                          >
                            {variance > 0 ? `+${variance}` : variance}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('sales.varianceTotal')}: {varianceTotal}
              </p>
              {isDraft ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={updateLines.isPending}
                    onClick={() => {
                      updateLines.mutate(
                        {
                          id: st.id,
                          lines: lines.map((l) => ({
                            productId: l.productId,
                            countedQty: Number(draftCounts[l.productId] ?? l.countedQty) || 0,
                          })),
                        },
                        {
                          onSuccess: () => {
                            setMsg(t('sales.stocktakeSaved'));
                            void detail.refetch();
                          },
                          onError: (e) =>
                            setErr(formatMutationError(e, t('sales.stockFailed'))),
                        },
                      );
                    }}
                  >
                    {t('common.save')}
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#F97316] text-white"
                    disabled={confirm.isPending}
                    onClick={() => {
                      updateLines.mutate(
                        {
                          id: st.id,
                          lines: lines.map((l) => ({
                            productId: l.productId,
                            countedQty: Number(draftCounts[l.productId] ?? l.countedQty) || 0,
                          })),
                        },
                        {
                          onSuccess: () => {
                            confirm.mutate(st.id, {
                              onSuccess: () => {
                                setMsg(t('sales.stocktakeConfirmed'));
                                void detail.refetch();
                                void list.refetch();
                                void reconcile.refetch();
                              },
                              onError: (e) =>
                                setErr(formatMutationError(e, t('sales.stockFailed'))),
                            });
                          },
                          onError: (e) =>
                            setErr(formatMutationError(e, t('sales.stockFailed'))),
                        },
                      );
                    }}
                  >
                    {t('sales.confirmStocktake')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={cancel.isPending}
                    onClick={() =>
                      cancel.mutate(st.id, {
                        onSuccess: () => {
                          setMsg(t('sales.stocktakeCancelled'));
                          void list.refetch();
                          setSelectedId(null);
                        },
                        onError: (e) =>
                          setErr(formatMutationError(e, t('sales.stockFailed'))),
                      })
                    }
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
