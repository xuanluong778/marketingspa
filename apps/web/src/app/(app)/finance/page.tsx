'use client';

import { useState } from 'react';
import { Wallet, Megaphone, Users, Wrench, TrendingUp, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { ExpenseFormDialog } from '@/components/finance/expense-form-dialog';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import {
  useFinanceDashboard,
  useFinanceExpenses,
  useFinanceOrders,
  useCampaignReports,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  defaultFinanceFilters,
  type FinanceDateFilters,
} from '@/hooks/use-finance';
import { useBranches } from '@/hooks/use-crm';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { expenseCategoryLabel, type ExpenseRow } from '@/types/finance';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function FinancePage() {
  const [filters, setFilters] = useState<FinanceDateFilters>(defaultFinanceFilters);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  const { data: dashboard, isLoading, isError, refetch } = useFinanceDashboard(filters);
  const { data: expenses } = useFinanceExpenses(filters);
  const { data: orders } = useFinanceOrders(filters);
  const { data: reports } = useCampaignReports({
    from: filters.from,
    to: filters.to,
  });
  const { data: branches } = useBranches();

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const branchList = Array.isArray(branches) ? branches : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Doanh thu & Lãi lỗ" description="Tổng quan tài chính spa" />

      <div className="flex flex-col gap-3 p-4 rounded-lg border bg-card sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            className="w-full sm:w-[160px]"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            className="w-full sm:w-[160px]"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chi nhánh</Label>
          <Select
            value={filters.branchId || 'all'}
            onValueChange={(v) => setFilters((f) => ({ ...f, branchId: v === 'all' ? '' : v }))}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {branchList.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState onRetry={refetch} />}
      {dashboard && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            title="Doanh thu"
            value={formatCurrency(dashboard.revenue)}
            icon={Wallet}
            highlight
          />
          <SummaryCard
            title="Chi phí ads"
            value={formatCurrency(dashboard.adSpend)}
            icon={Megaphone}
          />
          <SummaryCard
            title="Chi phí nhân sự"
            value={formatCurrency(dashboard.salarySpend)}
            icon={Users}
          />
          <SummaryCard
            title="Chi phí vận hành"
            value={formatCurrency(dashboard.operatingSpend + dashboard.materialSpend)}
            icon={Wrench}
            subtitle={`Vật tư: ${formatCurrency(dashboard.materialSpend)}`}
          />
          <SummaryCard
            title="Lãi ước tính"
            value={formatCurrency(dashboard.profit)}
            icon={TrendingUp}
            subtitle={`Biên LN: ${dashboard.margin}%`}
            highlight={dashboard.profit >= 0}
          />
        </div>
      )}

      <Tabs defaultValue="expenses">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="expenses">Chi phí</TabsTrigger>
          <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
          <TabsTrigger value="campaigns">Báo cáo chiến dịch</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => {
                setEditingExpense(null);
                setExpenseOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Thêm chi phí
            </Button>
          </div>
          <DataTable
            data={expenses?.items}
            isLoading={false}
            isError={false}
            emptyTitle="Chưa có chi phí trong kỳ"
            getRowKey={(r) => r.id}
            columns={[
              {
                key: 'date',
                header: 'Ngày',
                cell: (r) => new Date(r.expenseDate).toLocaleDateString('vi-VN'),
              },
              {
                key: 'cat',
                header: 'Loại',
                cell: (r) => expenseCategoryLabel(r.category),
              },
              { key: 'desc', header: 'Mô tả', cell: (r) => r.description },
              {
                key: 'amount',
                header: 'Số tiền',
                cell: (r) => formatCurrency(Number(r.amount)),
              },
              {
                key: 'actions',
                header: '',
                cell: (r) => (
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingExpense(r);
                        setExpenseOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteExpenseId(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="revenue" className="mt-4">
          {!orders?.items?.length ? (
            <EmptyState title="Chưa có đơn hàng trong kỳ" />
          ) : (
            <DataTable
              data={orders.items}
              isLoading={false}
              isError={false}
              emptyTitle="Chưa có đơn hàng"
              getRowKey={(r) => r.id}
              columns={[
                { key: 'order', header: 'Mã đơn', cell: (r) => r.orderNumber },
                {
                  key: 'customer',
                  header: 'Khách hàng',
                  cell: (r) => r.customer?.name ?? '—',
                },
                {
                  key: 'services',
                  header: 'Dịch vụ',
                  cell: (r) => r.items?.map((i) => `${i.name} x${i.quantity}`).join(', ') ?? '—',
                },
                {
                  key: 'employee',
                  header: 'NV phụ trách',
                  cell: (r) => r.customer?.leads?.[0]?.assignedTo?.name ?? '—',
                },
                {
                  key: 'total',
                  header: 'Tổng tiền',
                  cell: (r) => formatCurrency(Number(r.total)),
                },
                {
                  key: 'payment',
                  header: 'Thanh toán',
                  cell: (r) => {
                    const paid = r.payments?.filter((p) => p.status === 'COMPLETED') ?? [];
                    if (!paid.length) return <Badge variant="outline">Chưa TT</Badge>;
                    return formatCurrency(paid.reduce((s, p) => s + Number(p.amount), 0));
                  },
                },
                {
                  key: 'date',
                  header: 'Ngày',
                  cell: (r) => formatDateTime(r.orderedAt),
                },
              ]}
            />
          )}
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          {!reports?.campaigns?.length ? (
            <EmptyState title="Chưa có dữ liệu chiến dịch" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {[
                      'Chiến dịch',
                      'Chi tiêu',
                      'Lead',
                      'Đặt lịch',
                      'Mua',
                      'Doanh thu',
                      'Lãi',
                      'CPL',
                      'CP đặt lịch',
                      'CP mua',
                    ].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.campaigns.map((c) => (
                    <tr key={c.campaignId} className="border-b">
                      <td className="px-3 py-2 font-medium">{c.campaignName}</td>
                      <td className="px-3 py-2">{formatCurrency(c.totalSpend)}</td>
                      <td className="px-3 py-2">{c.totalLeads}</td>
                      <td className="px-3 py-2">{c.bookedLeads}</td>
                      <td className="px-3 py-2">{c.purchasedLeads}</td>
                      <td className="px-3 py-2">{formatCurrency(c.revenue)}</td>
                      <td
                        className={`px-3 py-2 font-medium ${c.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {formatCurrency(c.profit)}
                      </td>
                      <td className="px-3 py-2">{c.cpl != null ? formatCurrency(c.cpl) : '—'}</td>
                      <td className="px-3 py-2">
                        {c.costPerBooking != null ? formatCurrency(c.costPerBooking) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {c.costPerPurchase != null ? formatCurrency(c.costPerPurchase) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ExpenseFormDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        initial={editingExpense ?? undefined}
        isPending={createExpense.isPending || updateExpense.isPending}
        onSubmit={(formData) => {
          if (editingExpense) {
            updateExpense.mutate(
              { id: editingExpense.id, ...formData },
              { onSuccess: () => setExpenseOpen(false) },
            );
          } else {
            createExpense.mutate(formData, { onSuccess: () => setExpenseOpen(false) });
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteExpenseId}
        onOpenChange={(o) => !o && setDeleteExpenseId(null)}
        title="Xóa chi phí?"
        destructive
        isPending={deleteExpense.isPending}
        onConfirm={() =>
          deleteExpenseId &&
          deleteExpense.mutate(deleteExpenseId, { onSuccess: () => setDeleteExpenseId(null) })
        }
      />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  subtitle,
  highlight,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary/30' : undefined}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
