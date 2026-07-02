export interface FinanceDashboard {
  from: string;
  to: string;
  revenue: number;
  adSpend: number;
  salarySpend: number;
  materialSpend: number;
  operatingSpend: number;
  otherSpend: number;
  expense: number;
  profit: number;
  paymentCount: number;
  expenseCount: number;
  margin: string;
}

export interface CampaignReport {
  campaignId: string;
  campaignName: string;
  platform?: string;
  totalSpend: number;
  totalLeads: number;
  bookedLeads: number;
  purchasedLeads: number;
  revenue: number;
  profit: number;
  cpl: number | null;
  costPerBooking: number | null;
  costPerPurchase: number | null;
}

export interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number | string;
  expenseDate: string;
  note?: string | null;
  branch?: { name: string } | null;
  adCampaign?: { name: string } | null;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  total: number | string;
  orderedAt: string;
  customer?: {
    name: string;
    leads?: { assignedTo?: { name: string } | null }[];
  } | null;
  items?: { name: string; quantity: number }[];
  payments?: { amount: number | string; method: string; status: string }[];
}

export type ExpenseCategoryValue =
  'ADVERTISING' | 'SALARY' | 'SUPPLIES' | 'RENT' | 'UTILITIES' | 'MAINTENANCE' | 'OTHER';

export const EXPENSE_CATEGORIES: { value: ExpenseCategoryValue; label: string }[] = [
  { value: 'ADVERTISING', label: 'Quảng cáo' },
  { value: 'SALARY', label: 'Nhân sự' },
  { value: 'SUPPLIES', label: 'Vật tư' },
  { value: 'RENT', label: 'Thuê mặt bằng' },
  { value: 'UTILITIES', label: 'Điện nước' },
  { value: 'MAINTENANCE', label: 'Bảo trì' },
  { value: 'OTHER', label: 'Phần mềm & khác' },
];

export function expenseCategoryLabel(cat: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
