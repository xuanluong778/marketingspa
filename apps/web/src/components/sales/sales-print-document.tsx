'use client';

import { useEffect, useState } from 'react';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';
import type { SalesOrder, SalesPrintFormat } from '@/types/sales';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function SalesPrintDocument({
  order,
  kind,
  autoPrint,
}: {
  order: SalesOrder;
  kind: 'order' | 'export';
  autoPrint?: boolean;
}) {
  const t = useT();
  const [format, setFormat] = useState<SalesPrintFormat>('a4');

  useEffect(() => {
    document.body.dataset.printFormat = format;
    return () => {
      delete document.body.dataset.printFormat;
    };
  }, [format]);

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [autoPrint, format]);

  const title =
    kind === 'export' ? t('sales.printExportTitle') : t('sales.printOrderTitle');

  return (
    <div className="sales-print-root mx-auto max-w-3xl space-y-4 bg-white p-6 text-black print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('sales.printFormat')}</span>
          <Select value={format} onValueChange={(v) => setFormat(v as SalesPrintFormat)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">A4</SelectItem>
              <SelectItem value="a5">A5</SelectItem>
              <SelectItem value="mm80">80mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => window.print()} className="bg-[#F97316] text-white">
          {t('sales.printNow')}
        </Button>
      </div>

      <div className={`sales-print-sheet sales-print-${format}`}>
        <header className="mb-4 border-b border-black/20 pb-3">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm">
            {t('sales.orderCode')}: <strong>{order.code}</strong>
          </p>
          <p className="text-sm">
            {t('common.status')}: {t(`sales.status.${order.status}`)} ·{' '}
            {formatDateTime(order.createdAt)}
          </p>
        </header>

        <section className="mb-4 grid gap-1 text-sm">
          <p>
            <strong>{t('sales.customer')}:</strong> {order.customerName}
          </p>
          {order.phone ? (
            <p>
              <strong>{t('sales.phone')}:</strong> {order.phone}
            </p>
          ) : null}
          {order.address ? (
            <p>
              <strong>{t('sales.address')}:</strong> {order.address}
            </p>
          ) : null}
          {order.source ? (
            <p>
              <strong>{t('sales.source')}:</strong> {order.source}
            </p>
          ) : null}
        </section>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/30 text-left">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">{t('sales.product')}</th>
              <th className="py-1 pr-2 text-right">{t('sales.qty')}</th>
              <th className="py-1 pr-2 text-right">{t('sales.price')}</th>
              <th className="py-1 text-right">{t('sales.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, idx) => (
              <tr key={it.id || idx} className="border-b border-black/10">
                <td className="py-1 pr-2">{idx + 1}</td>
                <td className="py-1 pr-2">
                  {it.productName}
                  {it.sku ? ` (${it.sku})` : ''}
                </td>
                <td className="py-1 pr-2 text-right">{it.quantity}</td>
                <td className="py-1 pr-2 text-right">{formatCurrency(it.unitPrice)}</td>
                <td className="py-1 text-right">{formatCurrency(it.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span>{t('sales.subtotal')}</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('sales.discount')}</span>
            <span>-{formatCurrency(order.discount)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('sales.shippingFee')}</span>
            <span>{formatCurrency(order.shippingFee)}</span>
          </div>
          <div className="flex justify-between border-t border-black/30 pt-1 text-base font-bold">
            <span>{t('sales.total')}</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </section>

        {order.note ? (
          <p className="mt-4 text-sm">
            <strong>{t('sales.note')}:</strong> {order.note}
          </p>
        ) : null}

        {kind === 'export' ? (
          <p className="mt-6 text-xs text-black/70">{t('sales.exportSlipFooter')}</p>
        ) : null}

        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-sm">
          <div>
            <p className="mb-12">{t('sales.signerCustomer')}</p>
            <p>........................</p>
          </div>
          <div>
            <p className="mb-12">{t('sales.signerStaff')}</p>
            <p>........................</p>
          </div>
        </div>
      </div>
    </div>
  );
}
