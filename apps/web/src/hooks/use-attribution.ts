import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface AttributionFilters {
  from: string;
  to: string;
  channel?: string;
  adCampaignId?: string;
  adId?: string;
  serviceId?: string;
  branchId?: string;
  employeeId?: string;
  utmSource?: string;
  customerType?: 'new' | 'returning' | 'all';
  groupByAd?: boolean;
}

export interface AttributionRow {
  key: string;
  label: string;
  adCampaignId: string | null;
  adId: string | null;
  channel: string | null;
  spend: number;
  leads: number;
  qualifiedLeads: number;
  appointments: number;
  arrived: number;
  orders: number;
  revenue: number;
  cpl: number | null;
  costPerAppointment: number | null;
  cac: number | null;
  roas: number | null;
  estimatedProfit: number;
}

export interface AttributionDashboard {
  from: string;
  to: string;
  totals: AttributionRow & { key?: string; label?: string };
  rows: AttributionRow[];
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISODate(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const defaultAttributionFilters: AttributionFilters = {
  from: daysAgoISODate(30),
  to: todayISODate(),
  customerType: 'all',
  groupByAd: false,
};

export function useAttributionDashboard(filters: AttributionFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.channel) params.set('channel', filters.channel);
  if (filters.adCampaignId) params.set('adCampaignId', filters.adCampaignId);
  if (filters.adId) params.set('adId', filters.adId);
  if (filters.serviceId) params.set('serviceId', filters.serviceId);
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.employeeId) params.set('employeeId', filters.employeeId);
  if (filters.utmSource) params.set('utmSource', filters.utmSource);
  if (filters.customerType && filters.customerType !== 'all') {
    params.set('customerType', filters.customerType);
  }
  if (filters.groupByAd) params.set('groupByAd', 'true');

  return useQuery({
    queryKey: ['attribution', 'dashboard', filters],
    queryFn: () => apiClient<AttributionDashboard>(`/attribution/dashboard?${params}`),
  });
}
