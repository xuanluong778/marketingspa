export type SalesOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'READY'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'PARTIALLY_RETURNED';

export type SalesPaymentStatus =
  | 'UNPAID'
  | 'PARTIAL'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export const SALES_ORDER_STATUSES: SalesOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'READY',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'RETURNED',
  'PARTIALLY_RETURNED',
];

export const SALES_ORDER_SOURCES = [
  'FACEBOOK',
  'ZALO',
  'WEBSITE',
  'PHONE',
  'WALK_IN',
  'AFFILIATE',
  'OTHER',
] as const;

export type SalesPrintFormat = 'a4' | 'a5' | 'mm80';

export type SalesStockMovementType = 'INBOUND' | 'OUTBOUND' | 'ADJUST' | 'RETURN_IN';

export interface SalesOrderItem {
  id?: string;
  productId?: string | null;
  productName: string;
  sku?: string | null;
  quantity: number;
  returnedQty?: number;
  unitPrice: number;
  lineDiscount: number;
  totalPrice: number;
}

export interface SalesPayment {
  id: string;
  kind: 'PAYMENT' | 'REFUND';
  amount: number;
  method?: string | null;
  transactionRef?: string | null;
  paidAt: string;
  note?: string | null;
}

export interface SalesOrder {
  id: string;
  code: string;
  status: SalesOrderStatus;
  paymentStatus?: SalesPaymentStatus;
  customerId: string;
  customerName: string;
  phone?: string | null;
  address?: string | null;
  source?: string | null;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  amountPaid?: number;
  amountDue?: number;
  paymentMethod?: string | null;
  paidAt?: string | null;
  transactionRef?: string | null;
  note?: string | null;
  exportedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string; phone?: string | null; email?: string | null };
  items: SalesOrderItem[];
  payments?: SalesPayment[];
}

export interface SalesProductCategory {
  id: string;
  name: string;
}

export interface SalesProduct {
  id: string;
  sku?: string | null;
  barcode?: string | null;
  name: string;
  unit?: string | null;
  price: number;
  costPrice: number;
  stockQty: number;
  physicalQty?: number;
  sellableQty?: number;
  expiredQty?: number;
  minStockQty: number;
  isActive: boolean;
  note?: string | null;
  categoryId?: string | null;
  category?: SalesProductCategory | null;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
}

export interface SalesStockBatch {
  id: string;
  productId: string;
  batchCode: string;
  quantity: number;
  remainingQuantity: number;
  importedAt: string;
  expiryDate?: string | null;
  unitCost: number;
  isExpired?: boolean;
  daysToExpiry?: number | null;
  product?: { id: string; name: string; sku?: string | null; barcode?: string | null; unit?: string | null };
}

export interface SalesStockMovement {
  id: string;
  type: SalesStockMovementType;
  productId: string;
  quantity: number;
  reason?: string | null;
  note?: string | null;
  performedById?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku?: string | null };
  lines?: Array<{
    id: string;
    quantity: number;
    batch?: { id: string; batchCode: string; expiryDate?: string | null };
  }>;
}

export interface SalesStockAlerts {
  outOfStock: Array<{ id: string; name: string; sku?: string | null; stockQty: number; minStockQty: number }>;
  lowStock: Array<{ id: string; name: string; sku?: string | null; stockQty: number; minStockQty: number }>;
  expired: Array<{
    batchId: string;
    batchCode: string;
    productId: string;
    productName: string;
    remainingQuantity: number;
    expiryDate: string;
    daysToExpiry: number | null;
  }>;
  expiring7: SalesStockAlerts['expired'];
  expiring30: SalesStockAlerts['expired'];
  expiring60: SalesStockAlerts['expired'];
  counts: {
    outOfStock: number;
    lowStock: number;
    expired: number;
    expiring7: number;
    expiring30: number;
    expiring60: number;
  };
}

export const NEXT_STATUS: Partial<Record<SalesOrderStatus, SalesOrderStatus>> = {
  DRAFT: 'CONFIRMED',
  CONFIRMED: 'READY',
  // READY → SHIPPED chỉ qua nút Xuất hàng (trừ kho FEFO)
  SHIPPED: 'COMPLETED',
};
