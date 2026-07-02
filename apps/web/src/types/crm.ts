export type LeadPipelineStatus = 'NEW' | 'CONTACTED' | 'BOOKED' | 'VISITED' | 'PURCHASED' | 'LOST';

export const PIPELINE_COLUMNS: {
  status: LeadPipelineStatus;
  label: string;
  color: string;
}[] = [
  { status: 'NEW', label: 'Mới', color: 'bg-blue-500' },
  { status: 'CONTACTED', label: 'Đã tư vấn', color: 'bg-cyan-500' },
  { status: 'BOOKED', label: 'Đặt lịch', color: 'bg-amber-500' },
  { status: 'VISITED', label: 'Đã đến', color: 'bg-purple-500' },
  { status: 'PURCHASED', label: 'Đã mua', color: 'bg-green-500' },
  { status: 'LOST', label: 'Mất khách', color: 'bg-gray-400' },
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
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
  leadSource?: LeadSource | null;
  branch?: Branch | null;
}

export interface LeadDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  pipelineStatus: LeadPipelineStatus;
  note?: string | null;
  estimatedValue?: number | null;
  lostReason?: string | null;
  createdAt: string;
  updatedAt?: string;
  leadSource?: LeadSource | null;
  assignedTo?: EmployeeRef | null;
  customer?: { id: string; name: string } | null;
  branch?: Branch | null;
  appointments?: AppointmentRef[];
}

export interface AppointmentRef {
  id: string;
  scheduledAt: string;
  status: string;
  durationMinutes?: number;
  employee?: EmployeeRef | null;
  service?: { id: string; name: string } | null;
  branch?: Branch | null;
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
}

export interface CreateAppointmentInput {
  branchId: string;
  customerId?: string;
  leadId?: string;
  employeeId?: string;
  scheduledAt: string;
  durationMinutes?: number;
  note?: string;
}
