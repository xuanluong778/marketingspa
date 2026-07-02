import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  AutomationLogStatus,
  AutomationTriggerType,
  LeadPipelineStatus,
  OrderStatus,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
  AppointmentQueryDto,
  CalendarQueryDto,
} from './dto/appointment.dto';
import { renderTemplate } from '../automation/template-renderer.util';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { resolveCalendarRange } from '../common/utils/date-range.util';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
  ) {}

  listServices(organizationId: string) {
    return this.prisma.service.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, price: true, durationMinutes: true },
    });
  }

  async findAll(organizationId: string, query: AppointmentQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = this.buildWhere(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledAt: 'asc' },
        include: this.defaultInclude(),
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async getCalendar(organizationId: string, query: CalendarQueryDto) {
    const { from, to } = resolveCalendarRange(query.view, query.date);
    const where: Prisma.AppointmentWhereInput = {
      organizationId,
      scheduledAt: { gte: from, lte: to },
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.employeeId && { employeeId: query.employeeId }),
    };

    return this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: this.defaultInclude(),
    });
  }

  async findOne(organizationId: string, id: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, organizationId },
      include: this.defaultInclude(),
    });
    if (!appt) throw new NotFoundException('Lịch hẹn không tồn tại');
    return appt;
  }

  async create(organizationId: string, dto: CreateAppointmentDto, userId?: string) {
    const appt = await this.prisma.appointment.create({
      data: {
        organizationId,
        branchId: dto.branchId,
        customerId: dto.customerId,
        leadId: dto.leadId,
        employeeId: dto.employeeId,
        serviceId: dto.serviceId,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes ?? 60,
        note: dto.note,
      },
      include: this.defaultInclude(),
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'APPOINTMENT_CREATED',
      entityType: 'APPOINTMENT',
      entityId: appt.id,
      metadata: { scheduledAt: appt.scheduledAt.toISOString(), customerId: appt.customerId },
    });

    this.events.broadcastAppointmentNew(organizationId, {
      appointmentId: appt.id,
      scheduledAt: appt.scheduledAt.toISOString(),
      customerName: appt.customer?.name,
    });

    return appt;
  }

  async update(organizationId: string, id: string, dto: UpdateAppointmentDto, userId?: string) {
    const existing = await this.findOne(organizationId, id);

    if (dto.employeeId !== undefined && dto.employeeId !== existing.employeeId) {
      await this.audit.log({
        organizationId,
        userId,
        action: 'APPOINTMENT_ASSIGNED',
        entityType: 'APPOINTMENT',
        entityId: id,
        metadata: {
          previousEmployeeId: existing.employeeId,
          assignedEmployeeId: dto.employeeId,
        },
      });
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...dto,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
      include: this.defaultInclude(),
    });
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateAppointmentStatusDto,
    userId?: string,
  ) {
    const existing = await this.findOne(organizationId, id);
    const previousStatus = existing.status;

    const appt = await this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
      include: this.defaultInclude(),
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'APPOINTMENT_STATUS_CHANGED',
      entityType: 'APPOINTMENT',
      entityId: id,
      metadata: { previousStatus, newStatus: dto.status },
    });

    return appt;
  }

  /** Giả lập gửi nhắc lịch — ghi AutomationLog */
  async sendReminder(organizationId: string, id: string, userId?: string) {
    const appt = await this.findOne(organizationId, id);

    let flow = await this.prisma.automationFlow.findFirst({
      where: {
        organizationId,
        isActive: true,
        triggerType: AutomationTriggerType.APPOINTMENT_REMINDER,
      },
      include: { messageTemplate: true },
    });

    if (!flow) {
      const template = await this.prisma.messageTemplate.findFirst({
        where: { organizationId, isActive: true },
      });
      if (!template) {
        throw new NotFoundException('Chưa có mẫu tin nhắn automation');
      }
      flow = await this.prisma.automationFlow.create({
        data: {
          organizationId,
          messageTemplateId: template.id,
          name: 'Nhắc lịch hẹn',
          triggerType: AutomationTriggerType.APPOINTMENT_REMINDER,
          triggerConfig: { hoursBefore: 24 },
        },
        include: { messageTemplate: true },
      });
    }

    const scheduledAt = appt.scheduledAt;
    const channel = flow.channel ?? flow.messageTemplate?.channel;
    const bodyTemplate =
      flow.messageTemplate?.body ??
      'Xin chào {{customer_name}}, spa nhắc lịch hẹn {{appointment_time}} tại {{branch_name}}.';
    const renderedContent = renderTemplate(bodyTemplate, {
      customer_name: appt.customer?.name ?? appt.lead?.name ?? 'Quý khách',
      appointment_time: scheduledAt.toLocaleString('vi-VN'),
      branch_name: appt.branch?.name ?? '',
      service_name: appt.service?.name ?? '',
    });

    const log = await this.prisma.automationLog.create({
      data: {
        organizationId,
        automationFlowId: flow.id,
        customerId: appt.customerId,
        leadId: appt.leadId,
        channel: channel ?? undefined,
        renderedContent,
        status: AutomationLogStatus.SENT,
        executedAt: new Date(),
        result: {
          simulated: true,
          type: 'APPOINTMENT_REMINDER',
          channel: channel ?? 'UNKNOWN',
          appointmentId: appt.id,
          sentByUserId: userId,
        },
      },
    });

    return { message: 'Đã ghi nhắc lịch giả lập vào AutomationLog', log };
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.appointment.delete({ where: { id } });
  }

  private buildWhere(
    organizationId: string,
    query: AppointmentQueryDto,
  ): Prisma.AppointmentWhereInput {
    return {
      organizationId,
      ...(query.status && { status: query.status }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.from || query.to
        ? {
            scheduledAt: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };
  }

  private defaultInclude() {
    return {
      customer: true,
      lead: { include: { assignedTo: true } },
      employee: true,
      service: true,
      branch: true,
    };
  }
}
