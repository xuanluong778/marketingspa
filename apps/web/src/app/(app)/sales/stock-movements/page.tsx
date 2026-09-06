'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import {
  useSalesProducts,
  useStockAdjust,
  useStockInbound,
  useStockMovements,
  useStockOutbound,
} from '@/hooks/use-sales';
import { SalesBarcodeScan } from '@/components/sales/sales-barcode-scan';
import { formatDateTime } from '@/lib/format';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useT } from '@/i18n/i18n-provider';

export default function SalesStockMovementsPage() {
  const t = useT();
  const [productId, setProductId] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [qty, setQty] = useState('1');
  const [expiryDate, setExpiryDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [delta, setDelta] = useState('0');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const products = useSalesProducts({ active: 'true', page: 1 });
  const movements = useStockMovements({
    page: 1,
    type: typeFilter === 'all' ? undefined : typeFilter,
  });
  const inbound = useStockInbound();
  const outbound = useStockOutbound();
  const adjust = useStockAdjust();

  const productItems = products.data?.items ?? [];
  const rows = movements.data?.items ?? [];
  const selectedProduct = useMemo(
    () => productItems.find((p) => p.id === productId) ?? null,
    [productItems, productId],
  );

  const resetFlash = () => {
    setMsg('');
    setErr('');
  };

  const onPickProduct = (id: string) => {
    setProductId(id);
    const p = productItems.find((x) => x.id === id);
    if (p && !unitCost) setUnitCost(String(p.costPrice ?? 0));
  };

  const ProductPicker = ({ id }: { id: string }) => (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor={id}>{t('sales.product')} *</Label>
      <SalesBarcodeScan
        onFound={(p) => {
          onPickProduct(p.id);
          if (p.costPrice != null && !unitCost) setUnitCost(String(p.costPrice));
        }}
      />
      {products.isLoading ? (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : null}
      {products.isError ? (
        <p className="text-xs text-amber-200">
          {t('sales.loadProductsFailed')}{' '}
          <button type="button" className="underline" onClick={() => void products.refetch()}>
            {t('common.retry')}
          </button>
        </p>
      ) : null}
      {!products.isLoading && !productItems.length ? (
        <p className="text-xs text-amber-200">
          {t('sales.needProductFirst')}{' '}
          <Link href="/sales/products" className="underline text-[#F97316]">
            {t('sales.addProduct')}
          </Link>
        </p>
      ) : null}
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={productId}
        onChange={(e) => onPickProduct(e.target.value)}
        required
      >
        <option value="">{t('sales.pickProduct')}</option>
        {productItems.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.sku ? ` (${p.sku})` : ''} · {t('sales.stock')} {p.stockQty}
          </option>
        ))}
      </select>
      {selectedProduct ? (
        <p className="text-xs text-muted-foreground">
          {selectedProduct.name} · {t('sales.stock')}: {selectedProduct.stockQty}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title={t('nav.salesStockIo')} description={t('sales.stockIoDesc')} />

      {msg ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {err}
        </p>
      ) : null}

      <Tabs defaultValue="inbound">
        <TabsList>
          <TabsTrigger value="inbound">{t('sales.inbound')}</TabsTrigger>
          <TabsTrigger value="outbound">{t('sales.outbound')}</TabsTrigger>
          <TabsTrigger value="adjust">{t('sales.adjust')}</TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="mt-4">
          <form
            className="grid max-w-2xl gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              resetFlash();
              if (!productId) {
                setErr(t('sales.pickProductRequired'));
                return;
              }
              const quantity = Math.floor(Number(qty) || 0);
              if (quantity < 1) {
                setErr(t('sales.qtyRequired'));
                return;
              }
              if (!batchCode.trim()) {
                setErr(t('sales.batchCodeRequired'));
                return;
              }
              inbound.mutate(
                {
                  productId,
                  batchCode: batchCode.trim(),
                  quantity,
                  expiryDate: expiryDate || undefined,
                  unitCost: unitCost !== '' ? Number(unitCost) : undefined,
                  reason: reason.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    setMsg(t('sales.inboundOk'));
                    setBatchCode('');
                    setQty('1');
                    setExpiryDate('');
                    void movements.refetch();
                    void products.refetch();
                  },
                  onError: (e2) => setErr(formatMutationError(e2, t('sales.stockFailed'))),
                },
              );
            }}
          >
            <ProductPicker id="inbound-product" />
            <div className="space-y-1">
              <Label htmlFor="inbound-batch">{t('sales.batchCode')} *</Label>
              <Input
                id="inbound-batch"
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
                placeholder="VD: LOT-20260825"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inbound-qty">{t('sales.qty')} *</Label>
              <Input
                id="inbound-qty"
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inbound-expiry">{t('sales.expiryDate')}</Label>
              <Input
                id="inbound-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inbound-cost">{t('sales.costPrice')}</Label>
              <Input
                id="inbound-cost"
                type="number"
                min={0}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="inbound-reason">{t('sales.reason')}</Label>
              <Input
                id="inbound-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="bg-[#F97316] text-white sm:col-span-2"
              disabled={inbound.isPending || products.isLoading}
            >
              {inbound.isPending ? t('common.saving') : t('sales.inbound')}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="outbound" className="mt-4">
          <form
            className="grid max-w-xl gap-3 rounded-xl border border-white/10 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              resetFlash();
              if (!productId) {
                setErr(t('sales.pickProductRequired'));
                return;
              }
              const quantity = Math.floor(Number(qty) || 0);
              if (quantity < 1) {
                setErr(t('sales.qtyRequired'));
                return;
              }
              outbound.mutate(
                {
                  productId,
                  quantity,
                  reason: reason.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    setMsg(t('sales.outboundOk'));
                    void movements.refetch();
                    void products.refetch();
                  },
                  onError: (e2) => setErr(formatMutationError(e2, t('sales.stockFailed'))),
                },
              );
            }}
          >
            <ProductPicker id="outbound-product" />
            <div className="space-y-1">
              <Label htmlFor="outbound-qty">{t('sales.qty')} * (FEFO)</Label>
              <Input
                id="outbound-qty"
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="outbound-reason">{t('sales.reason')}</Label>
              <Input
                id="outbound-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('sales.fefoHint')}</p>
            <Button
              type="submit"
              className="bg-[#F97316] text-white"
              disabled={outbound.isPending || products.isLoading}
            >
              {outbound.isPending ? t('common.saving') : t('sales.outbound')}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="adjust" className="mt-4">
          <form
            className="grid max-w-xl gap-3 rounded-xl border border-white/10 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              resetFlash();
              if (!productId) {
                setErr(t('sales.pickProductRequired'));
                return;
              }
              if (!reason.trim()) {
                setErr(t('sales.reasonRequired'));
                return;
              }
              const d = Math.trunc(Number(delta) || 0);
              if (d === 0) {
                setErr(t('sales.adjustDeltaRequired'));
                return;
              }
              adjust.mutate(
                {
                  productId,
                  delta: d,
                  reason: reason.trim(),
                },
                {
                  onSuccess: () => {
                    setMsg(t('sales.adjustOk'));
                    void movements.refetch();
                    void products.refetch();
                  },
                  onError: (e2) => setErr(formatMutationError(e2, t('sales.stockFailed'))),
                },
              );
            }}
          >
            <ProductPicker id="adjust-product" />
            <div className="space-y-1">
              <Label htmlFor="adjust-delta">{t('sales.adjustDelta')} *</Label>
              <Input
                id="adjust-delta"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t('sales.adjustHint')}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="adjust-reason">{t('sales.reason')} *</Label>
              <Input
                id="adjust-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="bg-[#F97316] text-white"
              disabled={adjust.isPending || products.isLoading}
            >
              {adjust.isPending ? t('common.saving') : t('sales.adjust')}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">{t('sales.movementHistory')}</h2>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="INBOUND">{t('sales.inbound')}</SelectItem>
              <SelectItem value="OUTBOUND">{t('sales.outbound')}</SelectItem>
              <SelectItem value="ADJUST">{t('sales.adjust')}</SelectItem>
              <SelectItem value="RETURN_IN">{t('sales.returnIn')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {movements.isLoading ? <LoadingState /> : null}
        {movements.isError ? <ErrorState onRetry={() => void movements.refetch()} /> : null}
        {!movements.isLoading && !rows.length ? (
          <EmptyState title={t('sales.emptyMovements')} />
        ) : null}

        {rows.length ? (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-white/5 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">{t('sales.time')}</th>
                  <th className="p-3">{t('common.status')}</th>
                  <th className="p-3">{t('sales.product')}</th>
                  <th className="p-3 text-right">{t('sales.qty')}</th>
                  <th className="p-3">{t('sales.batchCode')}</th>
                  <th className="p-3">{t('sales.reason')}</th>
                  <th className="p-3">{t('sales.actor')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="p-3">{formatDateTime(m.createdAt)}</td>
                    <td className="p-3">
                      <Badge variant="outline">{t(`sales.movementType.${m.type}`)}</Badge>
                    </td>
                    <td className="p-3 text-white">{m.product?.name}</td>
                    <td className="p-3 text-right font-mono">{m.quantity}</td>
                    <td className="p-3 text-xs">
                      {(m.lines || [])
                        .map((l) => `${l.batch?.batchCode ?? '?'}×${l.quantity}`)
                        .join(', ') || '—'}
                    </td>
                    <td className="p-3">{m.reason || '—'}</td>
                    <td className="p-3 font-mono text-xs">
                      {m.performedById ? m.performedById.slice(0, 8) : '—'}
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
