'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import {
  useCreatePurchaseOrder,
  useCreateSupplier,
  useReceivePurchaseOrder,
  useSalesProducts,
  useSalesPurchaseOrders,
  useSalesSuppliers,
} from '@/hooks/use-sales';
import { formatCurrency } from '@/lib/format';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useT } from '@/i18n/i18n-provider';

export default function SalesPurchasesPage() {
  const t = useT();
  const suppliers = useSalesSuppliers();
  const pos = useSalesPurchaseOrders();
  const products = useSalesProducts({ active: 'true' });
  const createSupplier = useCreateSupplier();
  const createPo = useCreatePurchaseOrder();
  const receive = useReceivePurchaseOrder();

  const [supplierOpen, setSupplierOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('10');
  const [cost, setCost] = useState('0');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const supplierItems = suppliers.data?.items ?? [];
  const poItems = pos.data?.items ?? [];
  const productItems = products.data?.items ?? [];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title={t('nav.salesPurchases')} description={t('sales.purchasesDesc')}>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setSupplierOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('sales.addSupplier')}
          </Button>
          <Button
            type="button"
            className="bg-[#F97316] text-white"
            onClick={() => setPoOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('sales.addPo')}
          </Button>
        </div>
      </PageHeader>

      {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-sm text-amber-200">{err}</p> : null}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">{t('sales.suppliers')}</h2>
        {suppliers.isLoading ? <LoadingState /> : null}
        {!supplierItems.length && !suppliers.isLoading ? (
          <EmptyState title={t('sales.emptySuppliers')} />
        ) : (
          <ul className="space-y-1 text-sm">
            {supplierItems.map((s) => (
              <li key={s.id} className="flex justify-between">
                <span>{s.name}</span>
                <span className="text-muted-foreground">{s.phone || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">{t('sales.purchaseOrders')}</h2>
        {pos.isLoading ? <LoadingState /> : null}
        {pos.isError ? <ErrorState onRetry={() => void pos.refetch()} /> : null}
        {!poItems.length && !pos.isLoading ? <EmptyState title={t('sales.emptyPos')} /> : null}
        <ul className="space-y-3">
          {poItems.map((po) => (
            <li
              key={po.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2"
            >
              <div>
                <p className="font-mono text-white">{po.code}</p>
                <p className="text-xs text-muted-foreground">
                  {po.supplier?.name} · {po.status} · {formatCurrency(po.subtotal)}
                </p>
              </div>
              {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={receive.isPending}
                  onClick={() => {
                    const lines = (po.items ?? [])
                      .map((it) => ({
                        productId: it.productId,
                        quantity: Math.max(0, it.quantity - it.receivedQty),
                      }))
                      .filter((it) => it.quantity > 0);
                    if (!lines.length) return;
                    receive.mutate(
                      { id: po.id, items: lines },
                      {
                        onSuccess: () => setMsg(t('sales.poReceived')),
                        onError: (e) => setErr(formatMutationError(e)),
                      },
                    );
                  }}
                >
                  {t('sales.receiveGoods')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sales.addSupplier')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('sales.supplierName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
            <Label>{t('sales.phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                createSupplier.mutate(
                  { name, phone: phone || undefined },
                  {
                    onSuccess: () => {
                      setSupplierOpen(false);
                      setName('');
                      setPhone('');
                      setMsg(t('sales.supplierCreated'));
                    },
                    onError: (e) => setErr(formatMutationError(e)),
                  },
                );
              }}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={poOpen} onOpenChange={setPoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sales.addPo')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('sales.supplier')}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">{t('sales.pickSupplier')}</option>
              {supplierItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Label>{t('sales.product')}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">{t('sales.pickProduct')}</option>
              {productItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Label>{t('sales.quantity')}</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" />
            <Label>{t('sales.costPrice')}</Label>
            <Input value={cost} onChange={(e) => setCost(e.target.value)} type="number" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={!supplierId || !productId || createPo.isPending}
              onClick={() => {
                createPo.mutate(
                  {
                    supplierId,
                    items: [
                      {
                        productId,
                        quantity: Number(qty) || 1,
                        unitCost: Number(cost) || 0,
                      },
                    ],
                  },
                  {
                    onSuccess: () => {
                      setPoOpen(false);
                      setMsg(t('sales.poCreated'));
                    },
                    onError: (e) => setErr(formatMutationError(e)),
                  },
                );
              }}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
