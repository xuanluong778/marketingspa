'use client';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { useStockAlerts, useStockBatches } from '@/hooks/use-sales';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';

function AlertBlock({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <Badge variant={count > 0 ? 'destructive' : 'secondary'}>{count}</Badge>
      </div>
      {children}
    </div>
  );
}

export default function SalesInventoryPage() {
  const t = useT();
  const alerts = useStockAlerts();
  const batches = useStockBatches({ page: 1, includeExpired: 'true' });

  const a = alerts.data;
  const batchItems = batches.data?.items ?? [];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title={t('nav.salesInventory')} description={t('sales.inventoryDesc')} />

      {alerts.isLoading ? <LoadingState /> : null}
      {alerts.isError ? <ErrorState onRetry={() => void alerts.refetch()} /> : null}

      {a ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <AlertBlock title={t('sales.alertOut')} count={a.counts.outOfStock}>
            {!a.outOfStock.length ? (
              <p className="text-xs text-muted-foreground">{t('common.emptyData')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {a.outOfStock.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="font-mono text-xs">{p.sku || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </AlertBlock>

          <AlertBlock title={t('sales.alertLow')} count={a.counts.lowStock}>
            {!a.lowStock.length ? (
              <p className="text-xs text-muted-foreground">{t('common.emptyData')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {a.lowStock.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>
                      {p.name} · sellable {p.sellableQty ?? p.stockQty}/{p.minStockQty}
                      {(p.expiredQty ?? 0) > 0 ? ` · expired ${p.expiredQty}` : ''}
                    </span>
                    <span className="font-mono text-xs">{p.sku || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </AlertBlock>

          <AlertBlock title={t('sales.alertExpired')} count={a.counts.expired}>
            {!a.expired.length ? (
              <p className="text-xs text-muted-foreground">{t('common.emptyData')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {a.expired.map((b) => (
                  <li key={b.batchId}>
                    {b.productName} · {b.batchCode} · HSD {b.expiryDate?.slice(0, 10)} · còn{' '}
                    {b.remainingQuantity}
                  </li>
                ))}
              </ul>
            )}
          </AlertBlock>

          <AlertBlock title={t('sales.alertExp7')} count={a.counts.expiring7}>
            {!a.expiring7.length ? (
              <p className="text-xs text-muted-foreground">{t('common.emptyData')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {a.expiring7.map((b) => (
                  <li key={b.batchId}>
                    {b.productName} · {b.batchCode} · {b.daysToExpiry}d · SL {b.remainingQuantity}
                  </li>
                ))}
              </ul>
            )}
          </AlertBlock>

          <AlertBlock title={t('sales.alertExp30')} count={a.counts.expiring30}>
            {!a.expiring30.length ? (
              <p className="text-xs text-muted-foreground">{t('common.emptyData')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {a.expiring30.slice(0, 20).map((b) => (
                  <li key={b.batchId}>
                    {b.productName} · {b.batchCode} · {b.daysToExpiry}d
                  </li>
                ))}
              </ul>
            )}
          </AlertBlock>

          <AlertBlock title={t('sales.alertExp60')} count={a.counts.expiring60}>
            {!a.expiring60.length ? (
              <p className="text-xs text-muted-foreground">{t('common.emptyData')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {a.expiring60.slice(0, 20).map((b) => (
                  <li key={b.batchId}>
                    {b.productName} · {b.batchCode} · {b.daysToExpiry}d
                  </li>
                ))}
              </ul>
            )}
          </AlertBlock>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-white">{t('sales.batchesTitle')}</h2>
        {batches.isLoading ? <LoadingState /> : null}
        {!batches.isLoading && !batchItems.length ? (
          <EmptyState title={t('sales.emptyBatches')} />
        ) : null}
        {batchItems.length ? (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-white/5 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">{t('sales.product')}</th>
                  <th className="p-3">{t('sales.batchCode')}</th>
                  <th className="p-3 text-right">{t('sales.qty')}</th>
                  <th className="p-3 text-right">{t('sales.remaining')}</th>
                  <th className="p-3">{t('sales.importedAt')}</th>
                  <th className="p-3">{t('sales.expiryDate')}</th>
                </tr>
              </thead>
              <tbody>
                {batchItems.map((b) => (
                  <tr key={b.id} className="border-t border-white/5">
                    <td className="p-3 text-white">{b.product?.name}</td>
                    <td className="p-3 font-mono">{b.batchCode}</td>
                    <td className="p-3 text-right">{b.quantity}</td>
                    <td className="p-3 text-right">
                      {b.remainingQuantity}
                      {b.isExpired ? (
                        <Badge variant="destructive" className="ml-2">
                          {t('sales.alertExpired')}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="p-3">{formatDateTime(b.importedAt)}</td>
                    <td className="p-3">
                      {b.expiryDate ? b.expiryDate.slice(0, 10) : '—'}
                      {b.daysToExpiry != null && b.daysToExpiry >= 0 ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({b.daysToExpiry}d)
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
