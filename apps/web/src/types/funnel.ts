export interface FunnelStep {
  status: string;
  label: string;
  count: number;
}

export interface FunnelStats {
  from: string;
  to: string;
  totalLeads: number;
  steps: FunnelStep[];
  conversions: {
    leadToBooking: number | null;
    bookingToVisit: number | null;
    visitToPurchase: number | null;
    leadToPurchase: number | null;
  };
  counts: {
    booked: number;
    visited: number;
    purchased: number;
  };
}

export interface FunnelFilters {
  from: string;
  to: string;
  leadSourceId: string;
  assignedToId: string;
  branchId: string;
  adCampaignId: string;
}

export const CONVERSION_LABELS = [
  { key: 'leadToBooking' as const, label: 'Lead → Đặt lịch' },
  { key: 'bookingToVisit' as const, label: 'Đặt lịch → Đến spa' },
  { key: 'visitToPurchase' as const, label: 'Đến spa → Mua dịch vụ' },
  { key: 'leadToPurchase' as const, label: 'Lead → Khách mua' },
];
