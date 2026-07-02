import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Lead, Customer, Appointment, FinanceDashboard } from '@/types/api';

export interface Employee {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  user?: { role?: { name: string } } | null;
}

export interface AdCampaign {
  id: string;
  name: string;
  status?: string;
  platform?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel?: string;
  body?: string;
}

export interface MarketingReport {
  from: string;
  to: string;
  campaigns: Array<{
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
  }>;
}

export function useLeads(params?: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => apiClient<PaginatedResult<Lead>>(`/leads?${qs}`),
  });
}

export function useCustomers(params?: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => apiClient<PaginatedResult<Customer>>(`/customers?${qs}`),
  });
}

export function useAppointmentsCalendar(view: 'day' | 'week' | 'month', date?: string) {
  const qs = new URLSearchParams({ view, ...(date && { date }) }).toString();
  return useQuery({
    queryKey: ['appointments', 'calendar', view, date],
    queryFn: () => apiClient<Appointment[]>(`/appointments/calendar?${qs}`),
  });
}

export function useFinanceDashboard(period: 'day' | 'week' | 'month') {
  return useQuery({
    queryKey: ['finance', 'dashboard', period],
    queryFn: () => apiClient<FinanceDashboard>(`/finance/dashboard?period=${period}`),
  });
}

export function useAutomationTemplates() {
  return useQuery({
    queryKey: ['automation', 'templates'],
    queryFn: () => apiClient<PaginatedResult<MessageTemplate>>('/automation/templates'),
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: () => apiClient<PaginatedResult<Employee>>('/employees'),
  });
}

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: () => apiClient<{ id: string; name: string; slug: string }>('/organizations/current'),
  });
}

export function useAdCampaigns() {
  return useQuery({
    queryKey: ['marketing', 'ad-campaigns'],
    queryFn: () => apiClient<PaginatedResult<AdCampaign>>('/marketing/ad-campaigns'),
  });
}

export function useMarketingReports() {
  return useQuery({
    queryKey: ['marketing', 'reports'],
    queryFn: () => apiClient<MarketingReport>('/marketing/reports'),
  });
}
