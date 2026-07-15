export type AppointmentStatus =
  'SCHEDULED' | 'CONFIRMED' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED' | 'COMPLETED';

export const APPOINTMENT_STATUSES: {
  value: AppointmentStatus;
  label: string;
  color: string;
}[] = [
  { value: 'SCHEDULED', label: 'Đã đặt lịch', color: 'bg-blue-500' },
  { value: 'CONFIRMED', label: 'Đã xác nhận', color: 'bg-cyan-500' },
  { value: 'ARRIVED', label: 'Đã đến', color: 'bg-purple-500' },
  { value: 'NO_SHOW', label: 'Không đến', color: 'bg-orange-500' },
  { value: 'CANCELLED', label: 'Đã hủy', color: 'bg-gray-400' },
  { value: 'COMPLETED', label: 'Hoàn thành', color: 'bg-green-500' },
];

export function appointmentStatusLabel(status: string): string {
  return APPOINTMENT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export interface AppointmentDetail {
  id: string;
  scheduledAt: string;
  status: AppointmentStatus;
  durationMinutes: number;
  note?: string | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
  lead?: {
    id: string;
    name: string;
    phone?: string | null;
    assignedTo?: { id: string; name: string } | null;
  } | null;
  employee?: { id: string; name: string } | null;
  service?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
}

export interface SpaService {
  id: string;
  name: string;
  price: number | string;
  durationMinutes: number;
}

export interface CreateAppointmentInput {
  branchId: string;
  customerId?: string;
  leadId?: string;
  employeeId?: string;
  serviceId?: string;
  scheduledAt: string;
  durationMinutes?: number;
  note?: string;
}

export type CalendarView = 'day' | 'week' | 'month';

export type AppointmentPageView = CalendarView | 'list';

export const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'Chủ spa (Owner)' },
  { value: 'MANAGER', label: 'Quản lý' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'SALE', label: 'Tư vấn bán hàng' },
  { value: 'TECHNICIAN', label: 'Kỹ thuật viên' },
  { value: 'HR', label: 'Nhân sự' },
] as const;

export const EMPLOYEE_POSITION_OPTIONS = [
  'Quản lý spa',
  'Phó quản lý',
  'Lễ tân',
  'Tư vấn viên',
  'Kỹ thuật viên',
  'Chuyên viên chăm sóc da',
  'Chuyên viên massage',
  'Bác sĩ da liễu',
  'Marketing',
  'Kế toán',
  'Admin',
] as const;

export interface EmployeeDetail {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  isActive?: boolean;
  branch?: { id: string; name: string } | null;
  user?: { role?: { code: string; name: string } } | null;
}

export interface EmployeePerformance {
  employeeId: string;
  from: string;
  to: string;
  leadsReceived: number;
  leadsContacted: number;
  appointmentsCreated: number;
  customersArrived: number;
  customersPurchased: number;
  revenue: number;
  closeRate: number | null;
}
