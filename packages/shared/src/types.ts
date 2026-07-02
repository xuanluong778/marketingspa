import type { CampaignStatus, UserRole } from './constants';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

export interface CampaignDto {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: string;
  scheduledAt: string | null;
  organizationId: string;
}

export interface ContactDto {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  organizationId: string;
}

/** WebSocket / realtime event payloads */
export interface WsCampaignUpdate {
  campaignId: string;
  status: CampaignStatus;
  sentCount?: number;
}

export interface WsLeadNewPayload {
  leadId: string;
  name: string;
  pipelineStatus: string;
}

export interface WsAppointmentNewPayload {
  appointmentId: string;
  scheduledAt: string;
  customerName?: string;
}

export interface WsLeadStalePayload {
  count: number;
  leads: { id: string; name: string; createdAt: string }[];
}

export interface WsLeadStatusChangedPayload {
  leadId: string;
  name: string;
  previousStatus: string;
  pipelineStatus: string;
}

export interface WsAppointmentReminderPayload {
  appointmentId: string;
  customerName?: string;
  scheduledAt: string;
  hoursBefore: number;
}

export interface WsDailyReportPayload {
  reportId: string;
  title: string;
  date: string;
}

export interface RealtimeEnvelope {
  organizationId: string;
  event: string;
  payload: unknown;
}
