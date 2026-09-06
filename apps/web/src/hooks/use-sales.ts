import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type {
  SalesOrder,
  SalesOrderStatus,
  SalesProduct,
  SalesProductCategory,
  SalesStockAlerts,
  SalesStockBatch,
  SalesStockMovement,
  SalesStockMovementType,
} from '@/types/sales';

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  return sp.toString();
}

export type SalesOrderInput = {
  customerId: string;
  customerName?: string;
  phone?: string;
  address?: string;
  source?: string;
  discount?: number;
  shippingFee?: number;
  note?: string;
  items: Array<{
    productId?: string;
    productName: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    lineDiscount?: number;
  }>;
};

export function useSalesOrders(params: {
  page?: number;
  status?: string;
  search?: string;
  customerId?: string;
}) {
  return useQuery({
    queryKey: ['sales', 'orders', params],
    queryFn: () =>
      apiClient<PaginatedResult<SalesOrder>>(
        `/sales/orders?${qs({
          page: params.page ?? 1,
          pageSize: 20,
          status: params.status,
          search: params.search,
          customerId: params.customerId,
        })}`,
      ),
  });
}

export function useSalesOrder(id?: string | null) {
  return useQuery({
    queryKey: ['sales', 'orders', id],
    queryFn: () => apiClient<SalesOrder>(`/sales/orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SalesOrderInput) =>
      apiClient<SalesOrder>('/sales/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useUpdateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: SalesOrderInput & { id: string }) =>
      apiClient<SalesOrder>(`/sales/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useUpdateSalesOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; status: SalesOrderStatus }) =>
      apiClient<SalesOrder>(`/sales/orders/${body.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: body.status }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useExportSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<SalesOrder>(`/sales/orders/${id}/export`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useSalesProducts(params?: {
  page?: number;
  search?: string;
  active?: string;
  categoryId?: string;
}) {
  return useQuery({
    queryKey: ['sales', 'products', params],
    queryFn: () =>
      apiClient<PaginatedResult<SalesProduct>>(
        `/sales/products?${qs({
          page: params?.page ?? 1,
          pageSize: 50,
          search: params?.search,
          active: params?.active ?? 'true',
          categoryId: params?.categoryId,
        })}`,
      ),
  });
}

export function useSalesCategories() {
  return useQuery({
    queryKey: ['sales', 'categories'],
    queryFn: () => apiClient<SalesProductCategory[]>('/sales/categories'),
  });
}

export function useCreateSalesCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiClient<SalesProductCategory>('/sales/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales', 'categories'] }),
  });
}

export function useCreateSalesProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SalesProduct> & { name: string; stockQty?: number }) =>
      apiClient<SalesProduct>('/sales/products', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useUpdateSalesProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<SalesProduct> & { id: string }) =>
      apiClient<SalesProduct>(`/sales/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useStockBatches(params?: {
  page?: number;
  productId?: string;
  includeExpired?: string;
}) {
  return useQuery({
    queryKey: ['sales', 'stock', 'batches', params],
    queryFn: () =>
      apiClient<PaginatedResult<SalesStockBatch>>(
        `/sales/stock/batches?${qs({
          page: params?.page ?? 1,
          pageSize: 50,
          productId: params?.productId,
          includeExpired: params?.includeExpired,
        })}`,
      ),
  });
}

export function useStockMovements(params?: {
  page?: number;
  productId?: string;
  type?: SalesStockMovementType | string;
}) {
  return useQuery({
    queryKey: ['sales', 'stock', 'movements', params],
    queryFn: () =>
      apiClient<PaginatedResult<SalesStockMovement>>(
        `/sales/stock/movements?${qs({
          page: params?.page ?? 1,
          pageSize: 30,
          productId: params?.productId,
          type: params?.type,
        })}`,
      ),
  });
}

export function useStockAlerts() {
  return useQuery({
    queryKey: ['sales', 'stock', 'alerts'],
    queryFn: () => apiClient<SalesStockAlerts>('/sales/stock/alerts'),
  });
}

export function useStockInbound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient('/sales/stock/inbound', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useStockOutbound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient('/sales/stock/outbound', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useStockAdjust() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient('/sales/stock/adjust', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useProductLookup() {
  return useMutation({
    mutationFn: (q: string) =>
      apiClient<SalesProduct & { sellableQty?: number }>(
        `/sales/products/lookup?${qs({ q })}`,
      ),
  });
}

export function useStockReconcile(enabled = true) {
  return useQuery({
    queryKey: ['sales', 'stock', 'reconcile'],
    queryFn: () =>
      apiClient<{
        ok: boolean;
        counts: Record<string, number>;
        mismatches: Array<{
          productId: string;
          name: string;
          sku: string | null;
          stockQty: number;
          batchSum: number;
          delta: number;
        }>;
        negativeBatches: unknown[];
      }>('/sales/stock/reconcile'),
    enabled,
  });
}

export function useStockReconcileFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient('/sales/stock/reconcile/fix', { method: 'POST', body: '{}' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useStocktakes(params?: { page?: number; status?: string }) {
  return useQuery({
    queryKey: ['sales', 'stocktakes', params],
    queryFn: () =>
      apiClient<PaginatedResult<Record<string, unknown>>>(
        `/sales/stocktakes?${qs({
          page: params?.page ?? 1,
          pageSize: 30,
          status: params?.status,
        })}`,
      ),
  });
}

export function useStocktake(id?: string | null) {
  return useQuery({
    queryKey: ['sales', 'stocktakes', id],
    queryFn: () => apiClient<Record<string, unknown>>(`/sales/stocktakes/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateStocktake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: { note?: string; productIds?: string[] }) =>
      apiClient('/sales/stocktakes', {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useUpdateStocktakeLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      lines,
    }: {
      id: string;
      lines: Array<{ productId: string; countedQty: number; note?: string }>;
    }) =>
      apiClient(`/sales/stocktakes/${id}/lines`, {
        method: 'PATCH',
        body: JSON.stringify({ lines }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useConfirmStocktake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/sales/stocktakes/${id}/confirm`, { method: 'POST', body: '{}' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useCancelStocktake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/sales/stocktakes/${id}/cancel`, { method: 'POST', body: '{}' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useSalesReport(params: { preset?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['sales', 'reports', params],
    queryFn: () =>
      apiClient<{
        range: { preset: string; from: string; to: string };
        kpis: Record<string, number>;
        topProducts: Array<{
          productId: string;
          name: string;
          qty: number;
          revenue: number;
          cogs: number;
        }>;
        topCustomers: Array<{
          customerId: string;
          name: string;
          orders: number;
          revenue: number;
        }>;
        expiredBatches: unknown[];
        expiringBatches: unknown[];
      }>(`/sales/reports/summary?${qs(params)}`),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      orderId: string;
      amount: number;
      method?: string;
      transactionRef?: string;
      note?: string;
      idempotencyKey?: string;
    }) =>
      apiClient(`/sales/orders/${body.orderId}/payments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useRecordRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      orderId: string;
      amount: number;
      method?: string;
      note?: string;
      idempotencyKey?: string;
    }) =>
      apiClient(`/sales/orders/${body.orderId}/refunds`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useCreateSalesReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      orderId: string;
      reason?: string;
      note?: string;
      refundAmount?: number;
      items: Array<{ orderItemId: string; quantity: number; refundAmount?: number }>;
    }) =>
      apiClient('/sales/returns', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useSalesSuppliers(params?: { search?: string }) {
  return useQuery({
    queryKey: ['sales', 'suppliers', params],
    queryFn: () =>
      apiClient<PaginatedResult<{ id: string; name: string; phone?: string | null }>>(
        `/sales/suppliers?${qs({ page: 1, pageSize: 50, search: params?.search })}`,
      ),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      taxCode?: string;
      note?: string;
    }) =>
      apiClient('/sales/suppliers', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales', 'suppliers'] }),
  });
}

export function useSalesPurchaseOrders() {
  return useQuery({
    queryKey: ['sales', 'purchase-orders'],
    queryFn: () =>
      apiClient<
        PaginatedResult<{
          id: string;
          code: string;
          status: string;
          subtotal: number;
          supplier?: { name: string };
          items?: Array<{
            productId: string;
            productName: string;
            quantity: number;
            receivedQty: number;
            unitCost: number;
          }>;
        }>
      >('/sales/purchase-orders?page=1&pageSize=50'),
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      supplierId: string;
      note?: string;
      items: Array<{ productId: string; quantity: number; unitCost: number }>;
    }) =>
      apiClient('/sales/purchase-orders', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

export function useReceivePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      id: string;
      items: Array<{ productId: string; quantity: number; batchCode?: string }>;
      note?: string;
    }) =>
      apiClient(`/sales/purchase-orders/${body.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({ items: body.items, note: body.note }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}
