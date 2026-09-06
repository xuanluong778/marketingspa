'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import {
  useCreateSalesCategory,
  useCreateSalesProduct,
  useSalesCategories,
  useSalesProducts,
  useUpdateSalesProduct,
} from '@/hooks/use-sales';
import { formatCurrency } from '@/lib/format';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useT } from '@/i18n/i18n-provider';
import type { SalesProduct } from '@/types/sales';

export default function SalesProductsPage() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesProduct | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState('0');
  const [costPrice, setCostPrice] = useState('0');
  const [stockQty, setStockQty] = useState('0');
  const [minStockQty, setMinStockQty] = useState('0');
  const [unit, setUnit] = useState('cái');

  const list = useSalesProducts({ search: search.trim() || undefined, active: 'true' });
  const categories = useSalesCategories();
  const create = useCreateSalesProduct();
  const update = useUpdateSalesProduct();
  const createCat = useCreateSalesCategory();
  const items = list.data?.items ?? [];
  const cats = categories.data ?? [];

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSku('');
    setBarcode('');
    setCategoryId('');
    setPrice('0');
    setCostPrice('0');
    setStockQty('0');
    setMinStockQty('0');
    setUnit('cái');
    setOpen(true);
  };

  const openEdit = (p: SalesProduct) => {
    setEditing(p);
    setName(p.name);
    setSku(p.sku || '');
    setBarcode(p.barcode || '');
    setCategoryId(p.categoryId || '');
    setPrice(String(p.price));
    setCostPrice(String(p.costPrice));
    setStockQty(String(p.stockQty));
    setMinStockQty(String(p.minStockQty ?? 0));
    setUnit(p.unit || 'cái');
    setOpen(true);
  };

  return (
    <div className="space-y-4 pb-8">
      <PageHeader title={t('sales.productsTitle')} description={t('sales.productsDesc')}>
        <Button type="button" onClick={openCreate} className="bg-[#F97316] text-white">
          <Plus className="mr-1 h-4 w-4" />
          {t('sales.addProduct')}
        </Button>
      </PageHeader>

      <Input
        placeholder={t('sales.searchProduct')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : null}
      {!list.isLoading && !items.length ? <EmptyState title={t('sales.emptyProducts')} /> : null}

      {items.length ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/5 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">SKU</th>
                <th className="p-3">{t('sales.barcode')}</th>
                <th className="p-3">{t('sales.product')}</th>
                <th className="p-3">{t('sales.category')}</th>
                <th className="p-3">{t('sales.unit')}</th>
                <th className="p-3 text-right">{t('sales.costPrice')}</th>
                <th className="p-3 text-right">{t('sales.price')}</th>
                <th className="p-3 text-right">{t('sales.stockPhysical')}</th>
                <th className="p-3 text-right">{t('sales.stockSellable')}</th>
                <th className="p-3 text-right">{t('sales.stockExpired')}</th>
                <th className="p-3 text-right">{t('sales.minStock')}</th>
                <th className="p-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="p-3 font-mono">{p.sku || '—'}</td>
                  <td className="p-3 font-mono text-xs">{p.barcode || '—'}</td>
                  <td className="p-3 text-white">{p.name}</td>
                  <td className="p-3">{p.category?.name || '—'}</td>
                  <td className="p-3">{p.unit || '—'}</td>
                  <td className="p-3 text-right">{formatCurrency(p.costPrice)}</td>
                  <td className="p-3 text-right">{formatCurrency(p.price)}</td>
                  <td className="p-3 text-right">{p.physicalQty ?? p.stockQty}</td>
                  <td className="p-3 text-right">
                    {p.sellableQty ?? p.stockQty}
                    {p.isOutOfStock ? (
                      <Badge variant="destructive" className="ml-2">
                        {t('sales.alertOut')}
                      </Badge>
                    ) : p.isLowStock ? (
                      <Badge variant="secondary" className="ml-2">
                        {t('sales.alertLow')}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="p-3 text-right text-amber-200">{p.expiredQty ?? 0}</td>
                  <td className="p-3 text-right">{p.minStockQty}</td>
                  <td className="p-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(p)}>
                      {t('common.edit')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('sales.editProduct') : t('sales.addProduct')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const body = {
                name: name.trim(),
                sku: sku.trim() || undefined,
                barcode: barcode.trim() || undefined,
                categoryId: categoryId || undefined,
                price: Number(price) || 0,
                costPrice: Number(costPrice) || 0,
                minStockQty: Number(minStockQty) || 0,
                unit: unit.trim() || 'cái',
                ...(!editing ? { stockQty: Number(stockQty) || 0 } : {}),
              };
              const onError = (err: unknown) =>
                alert(formatMutationError(err, t('sales.saveFailed')));
              if (editing) {
                update.mutate(
                  { id: editing.id, ...body },
                  { onSuccess: () => setOpen(false), onError },
                );
              } else {
                create.mutate(body, { onSuccess: () => setOpen(false), onError });
              }
            }}
          >
            <div className="space-y-1">
              <Label>{t('sales.productName')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>SKU</Label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('sales.barcode')}</Label>
                <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('sales.category')}</Label>
              <Select
                value={categoryId || '__none'}
                onValueChange={(v) => setCategoryId(v === '__none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('sales.category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder={t('sales.newCategory')}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newCategory.trim() || createCat.isPending}
                  onClick={() =>
                    createCat.mutate(newCategory.trim(), {
                      onSuccess: (c) => {
                        setCategoryId(c.id);
                        setNewCategory('');
                      },
                    })
                  }
                >
                  {t('common.add')}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>{t('sales.costPrice')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('sales.price')}</Label>
                <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              {!editing ? (
                <div className="space-y-1">
                  <Label>{t('sales.openingStock')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>{t('sales.stock')}</Label>
                  <Input value={stockQty} readOnly disabled />
                </div>
              )}
              <div className="space-y-1">
                <Label>{t('sales.minStock')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={minStockQty}
                  onChange={(e) => setMinStockQty(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('sales.unit')}</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
