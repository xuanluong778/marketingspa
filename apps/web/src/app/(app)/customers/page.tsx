'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { PaginationBar } from '@/components/crm/pagination-bar';
import { CrmFilterBar, type CrmFilters } from '@/components/crm/crm-filters';
import { CustomerFormDialog } from '@/components/crm/customer-form-dialog';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useCustomers } from '@/hooks/use-queries';
import {
  useBranches,
  useCustomerSources,
  useLeadSources,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from '@/hooks/use-crm';
import type { CustomerDetail } from '@/types/crm';
import type { Customer } from '@/types/api';
import { StatusBadge } from '@/components/shared/data-table';
import { customerSourceDisplay } from '@/lib/customer-source-label';
import { useT } from '@/i18n/i18n-provider';

export default function CustomersPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<CrmFilters>({
    search: '',
    tag: '',
    leadSourceId: '',
    branchId: '',
    source: '',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({
      page: String(page),
      pageSize: '20',
      ...(filters.search && { search: filters.search }),
      ...(filters.tag && { tag: filters.tag }),
      ...(filters.source && { source: filters.source }),
      ...(filters.branchId && { branchId: filters.branchId }),
    }),
    [page, filters],
  );

  const { data, isLoading, isError, refetch } = useCustomers(queryParams);
  const { data: branches } = useBranches();
  const { data: customerSources } = useCustomerSources();
  const { data: leadSourcesData } = useLeadSources();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const branchList = Array.isArray(branches) ? branches : [];
  const leadSources = leadSourcesData?.items ?? [];

  const handleFilterChange = useCallback((f: CrmFilters) => {
    setFilters(f);
    setPage(1);
  }, []);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setFormOpen(true);
  }

  function handleSubmit(formData: Parameters<typeof createCustomer.mutate>[0]) {
    if (editing) {
      updateCustomer.mutate(
        { id: editing.id, ...formData },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createCustomer.mutate(formData, { onSuccess: () => setFormOpen(false) });
    }
  }

  return (
    <div>
      <PageHeader title={t('customers.title')} description={t('customers.description')}>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('customers.addCustomer')}
        </Button>
      </PageHeader>

      <CrmFilterBar
        filters={filters}
        onChange={handleFilterChange}
        customerSources={customerSources ?? []}
        branches={branchList}
      />

      <DataTable
        data={data?.items}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        emptyTitle={t('customers.empty')}
        emptyDescription={
          filters.source || filters.search || filters.tag || filters.branchId
            ? t('customers.emptyFiltered')
            : t('customers.emptyOrg')
        }
        getRowKey={(r) => r.id}
        data-testid="customer-list-table"
        columns={[
          {
            key: 'name',
            header: t('customers.columns.name'),
            cell: (r) => (
              <Link
                href={`/customers/${r.id}`}
                className="font-medium hover:underline text-primary"
              >
                {r.name}
              </Link>
            ),
          },
          { key: 'phone', header: t('crm.phoneShort'), cell: (r) => r.phone ?? '—' },
          { key: 'email', header: t('common.email'), cell: (r) => r.email ?? '—' },
          { key: 'branch', header: t('crm.branch'), cell: (r) => r.branch?.name ?? '—' },
          {
            key: 'source',
            header: t('crm.source'),
            cell: (r) =>
              customerSourceDisplay(r.latestSource ?? r.firstSource ?? r.source, r.leadSource?.name),
          },
          {
            key: 'tags',
            header: t('crm.tags'),
            cell: (r) =>
              r.tags.length ? (
                <div className="flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <StatusBadge key={t} status={t} />
                  ))}
                </div>
              ) : (
                '—'
              ),
          },
          {
            key: 'actions',
            header: '',
            className: 'w-[100px]',
            cell: (r) => (
              <div className="flex gap-1 justify-end">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeleteId(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      {data && (
        <PaginationBar
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={setPage}
        />
      )}

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing as CustomerDetail | undefined}
        leadSources={leadSources}
        branches={branchList}
        onSubmit={handleSubmit}
        isPending={createCustomer.isPending || updateCustomer.isPending}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={t('crm.deleteCustomerTitle')}
        description={t('crm.deleteCustomerDesc')}
        confirmLabel={t('common.delete')}
        destructive
        isPending={deleteCustomer.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteCustomer.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
          }
        }}
      />
    </div>
  );
}
