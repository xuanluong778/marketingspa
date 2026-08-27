export type LeadPipelineStatus =
  'NEW' | 'CONTACTED' | 'QUALIFIED' | 'BOOKED' | 'CONFIRMED' | 'VISITED' | 'PURCHASED' | 'LOST';

export const PIPELINE_COLUMNS: {
  status: LeadPipelineStatus;
  label: string;
  color: string;
}[] = [
  { status: 'NEW', label: 'Lead mới', color: 'bg-blue-500' },
  { status: 'CONTACTED', label: 'Đã liên hệ', color: 'bg-cyan-500' },
  { status: 'QUALIFIED', label: 'Đủ điều kiện', color: 'bg-violet-500' },
  { status: 'BOOKED', label: 'Đã đặt lịch', color: 'bg-amber-500' },
  { status: 'CONFIRMED', label: 'Đã xác nhận', color: 'bg-orange-500' },
  { status: 'VISITED', label: 'Đã đến', color: 'bg-purple-500' },
  { status: 'PURCHASED', label: 'Đã mua', color: 'bg-green-500' },
  { status: 'LOST', label: 'Mất lead', color: 'bg-gray-400' },
];

export function pipelineLabel(status: string): string {
  return PIPELINE_COLUMNS.find((c) => c.status === status)?.label ?? status;
}

export interface Branch {
  id: string;
  name: string;
  code?: string;
}

export interface LeadSource {
  id: string;
  name: string;
  code?: string;
}

export interface EmployeeRef {
  id: string;
  name: string;
}

export interface CustomerDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender?: string;
  birthday?: string | null;
  note?: string | null;
  tags: string[];
  source?: string | null;
  firstSource?: string | null;
  latestSource?: string | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
  leadSource?: LeadSource | null;
  branch?: Branch | null;
  assignedEmployee?: EmployeeRef | null;
}

export interface LeadDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  pipelineStatus: LeadPipelineStatus;
  pipelineId?: string | null;
  stageId?: string | null;
  note?: string | null;
  estimatedValue?: number | null;
  lostReason?: string | null;
  score?: number;
  qualification?: 'MQL' | 'SQL' | null;
  tags?: string[];
  slaRespondBy?: string | null;
  reminderAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  leadSource?: LeadSource | null;
  assignedTo?: EmployeeRef | null;
  customer?: { id: string; name: string } | null;
  branch?: Branch | null;
  stage?: {
    id: string;
    name: string;
    code?: string | null;
    category?: string;
    isWon?: boolean;
    isLost?: boolean;
    color?: string | null;
  } | null;
  /** @deprecated */
  funnelStage?: LeadDetail['stage'];
  /** Funnel draft/runtime that captured this lead */
  funnelRecommendationId?: string | null;
  organizationId?: string;
  attribution?: LeadAttribution | null;
  funnelRecommendation?: { id: string; prompt: string; selectedSlug?: string | null } | null;
  appointments?: AppointmentRef[];
  orders?: OrderRef[];
}

export interface LeadAttribution {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  firstTouchJson?: Record<string, unknown> | null;
  lastTouchJson?: Record<string, unknown> | null;
}

export interface AppointmentRef {
  id: string;
  scheduledAt: string;
  status: string;
  durationMinutes?: number;
  employee?: EmployeeRef | null;
  service?: { id: string; name: string } | null;
  branch?: Branch | null;
  room?: { id: string; name: string } | null;
  bed?: { id: string; name: string } | null;
  depositAmount?: number | string;
  depositStatus?: string;
}

export interface OrderRef {
  id: string;
  orderNumber: string;
  status: string;
  total: number | string;
  orderedAt: string;
  items?: { name: string; quantity: number; totalPrice: number | string }[];
}

export interface ConsultationNote {
  id: string;
  content: string;
  createdAt: string;
  authorName?: string | null;
}

export interface CustomerHistory {
  customer: CustomerDetail;
  leads: LeadDetail[];
  appointments: AppointmentRef[];
  orders: OrderRef[];
  consultationNotes: ConsultationNote[];
  totalSpend?: number;
  conversations?: Array<{
    id: string;
    channel?: string | null;
    status?: string;
    updatedAt: string;
  }>;
  emailContacts?: Array<{
    id: string;
    email: string;
    status: string;
  }>;
  messagingIdentities?: Array<{
    id: string;
    channel: string;
    externalUserId: string;
    displayName?: string | null;
  }>;
  isTestData?: boolean;
  firstSourceLabel?: string;
  latestSourceLabel?: string;
  sourceLabel?: string;
  timeline?: Array<{
    type: string;
    at: string;
    title: string;
    meta?: Record<string, unknown>;
  }>;
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  gender?: string;
  birthday?: string;
  note?: string;
  tags?: string[];
  leadSourceId?: string;
  branchId?: string;
}

export interface CreateLeadInput {
  name: string;
  phone?: string;
  email?: string;
  branchId?: string;
  leadSourceId?: string;
  assignedToId?: string;
  note?: string;
  estimatedValue?: number;
  tags?: string[];
  autoAssign?: boolean;
  attribution?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    fbclid?: string;
    gclid?: string;
    landingPage?: string;
    referrer?: string;
  };
}

export interface CreateAppointmentInput {
  branchId: string;
  customerId?: string;
  leadId?: string;
  employeeId?: string;
  serviceId?: string;
  roomId?: string;
  bedId?: string;
  adCampaignId?: string;
  scheduledAt: string;
  durationMinutes?: number;
  note?: string;
  depositAmount?: number;
}
