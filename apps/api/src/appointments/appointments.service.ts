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
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import { AttributionHooksService } from '../attribution/attribution-hooks.service';
import { AppointmentConflictService } from '../crm/appointment-conflict.service';
import { AutomationEngineService } from '../crm/automation-engine.service';
import { PipelineService } from '../crm/pipeline.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
  RescheduleAppointmentDto,
  AppointmentQueryDto,
  CalendarQueryDto,
} from './dto/appointment.dto';
import { renderTemplate } from '../automation/template-renderer.util';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { resolveCalendarRange } from '../common/utils/date-range.util';
import { EventsGateway } from '../events/events.gateway';
import { assertAppointmentTransition } from '../common/utils/status-transitions.util';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
    private readonly tenant: TenantOwnershipService,
    private readonly attributionHooks: AttributionHooksService,
    private readonly conflicts: AppointmentConflictService,
    private readonly automation: AutomationEngineService,
    private readonly pipeline: PipelineService,
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
      ...(query.serviceId && { serviceId: query.serviceId }),
      ...(query.status && { status: query.status }),
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
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      customerId: dto.customerId,
      leadId: dto.leadId,
      employeeId: dto.employeeId,
      serviceId: dto.serviceId,
      adCampaignId: dto.adCampaignId,
    });
    await Promise.all([
      this.tenant.assertSpaRoom(organizationId, dto.roomId),
      this.tenant.assertSpaBed(organizationId, dto.bedId),
      this.tenant.assertSpaEquipment(organizationId, dto.equipmentId),
    ]);

    let customerId = dto.customerId;
    if (!customerId && dto.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: dto.leadId, organizationId },
      });
      if (lead?.customerId) {
        customerId = lead.customerId;
      } else if (lead) {
        const phone = lead.phone?.trim() || null;
        const email = lead.email?.trim() || null;
        let customer =
          (phone
            ? await this.prisma.customer.findFirst({
                where: { organizationId, phone, isActive: true },
              })
            : null) ??
          (email
            ? await this.prisma.customer.findFirst({
                where: {
                  organizationId,
                  email: { equals: email, mode: 'insensitive' },
                  isActive: true,
                },
              })
            : null);
        if (!customer) {
          customer = await this.prisma.customer.create({
            data: {
              organizationId,
              branchId: dto.branchId ?? lead.branchId,
              name: lead.name,
              phone: phone ?? undefined,
              email: email ?? undefined,
              leadSourceId: lead.leadSourceId,
              source: 'appointment_from_lead',
            },
          });
        }
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { customerId: customer.id },
        });
        customerId = customer.id;
      }
    }

    const durationMinutes = dto.durationMinutes ?? 60;
    await this.conflicts.assertNoConflict(organizationId, {
      scheduledAt: new Date(dto.scheduledAt),
      durationMinutes,
      employeeId: dto.employeeId,
      roomId: dto.roomId,
      bedId: dto.bedId,
      equipmentId: dto.equipmentId,
    });

    const appt = await this.prisma.appointment.create({
      data: {
        organizationId,
        branchId: dto.branchId,
        customerId,
        leadId: dto.leadId,
        employeeId: dto.employeeId,
        serviceId: dto.serviceId,
        roomId: dto.roomId,
        bedId: dto.bedId,
        equipmentId: dto.equipmentId,
        adCampaignId: dto.adCampaignId,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes,
        note: dto.note,
        depositAmount: dto.depositAmount ?? 0,
        depositStatus: dto.depositStatus,
      },
      include: this.defaultInclude(),
    });

    if (dto.leadId) {
      const stage = await this.pipeline.resolveStageForStatus(
        organizationId,
        LeadPipelineStatus.BOOKED,
      );
      await this.prisma.lead.update({
        where: { id: dto.leadId },
        data: {
          pipelineStatus: LeadPipelineStatus.BOOKED,
          funnelStageId: stage?.id,
        },
      });
    }

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

    await this.attributionHooks.onAppointmentChange(organizationId, {
      id: appt.id,
      leadId: appt.leadId,
      customerId: appt.customerId,
      branchId: appt.branchId,
      employeeId: appt.employeeId,
      serviceId: appt.serviceId,
      status: appt.status,
    });

    void this.automation.dispatch(organizationId, AutomationTriggerType.APPOINTMENT_CREATED, {
      leadId: appt.leadId,
      customerId: appt.customerId,
      appointmentId: appt.id,
      dedupeKey: `APPOINTMENT_CREATED:${appt.id}`,
    });

    return appt;
  }

  async update(organizationId: string, id: string, dto: UpdateAppointmentDto, userId?: string) {
    const existing = await this.findOne(organizationId, id);

    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId ?? existing.branchId,
      customerId: dto.customerId ?? existing.customerId,
      leadId: dto.leadId ?? existing.leadId,
      employeeId: dto.employeeId ?? existing.employeeId,
      serviceId: dto.serviceId ?? existing.serviceId,
    });

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : existing.scheduledAt;
    const durationMinutes = dto.durationMinutes ?? existing.durationMinutes;
    await this.conflicts.assertNoConflict(organizationId, {
      scheduledAt,
      durationMinutes,
      employeeId: dto.employeeId ?? existing.employeeId,
      roomId: dto.roomId ?? existing.roomId,
      bedId: dto.bedId ?? existing.bedId,
      equipmentId: dto.equipmentId ?? existing.equipmentId,
      excludeAppointmentId: id,
    });

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
        depositAmount: dto.depositAmount,
      },
      include: this.defaultInclude(),
    });
  }

  async reschedule(
    organizationId: string,
    id: string,
    dto: RescheduleAppointmentDto,
    userId?: string,
  ) {
    const existing = await this.findOne(organizationId, id);
    const durationMinutes = dto.durationMinutes ?? existing.durationMinutes;
    await this.conflicts.assertNoConflict(organizationId, {
      scheduledAt: new Date(dto.scheduledAt),
      durationMinutes,
      employeeId: dto.employeeId ?? existing.employeeId,
      roomId: dto.roomId ?? existing.roomId,
      bedId: dto.bedId ?? existing.bedId,
      equipmentId: existing.equipmentId,
      excludeAppointmentId: id,
    });

    const appt = await this.prisma.appointment.update({
      where: { id },
      data: {
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes,
        employeeId: dto.employeeId ?? existing.employeeId,
        roomId: dto.roomId ?? existing.roomId,
        bedId: dto.bedId ?? existing.bedId,
        note: dto.note ?? existing.note,
        status: AppointmentStatus.SCHEDULED,
        rescheduledFromId: existing.rescheduledFromId ?? id,
      },
      include: this.defaultInclude(),
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'APPOINTMENT_RESCHEDULED',
      entityType: 'APPOINTMENT',
      entityId: id,
      metadata: {
        from: existing.scheduledAt.toISOString(),
        to: appt.scheduledAt.toISOString(),
      },
    });

    return appt;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateAppointmentStatusDto,
    userId?: string,
  ) {
    const existing = await this.findOne(organizationId, id);
    const previousStatus = existing.status;

    assertAppointmentTransition(previousStatus, dto.status);

    const appt = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: dto.status,
        cancelledReason: dto.cancelledReason,
        noShowReason: dto.noShowReason,
        checkedInAt:
          dto.status === AppointmentStatus.ARRIVED ? new Date() : existing.checkedInAt,
        checkedOutAt:
          dto.status === AppointmentStatus.COMPLETED ? new Date() : existing.checkedOutAt,
      },
      include: this.defaultInclude(),
    });

    if (existing.leadId) {
      const leadStatusMap: Partial<Record<AppointmentStatus, LeadPipelineStatus>> = {
        [AppointmentStatus.CONFIRMED]: LeadPipelineStatus.CONFIRMED,
        [AppointmentStatus.ARRIVED]: LeadPipelineStatus.VISITED,
        [AppointmentStatus.COMPLETED]: LeadPipelineStatus.VISITED,
        [AppointmentStatus.CANCELLED]: LeadPipelineStatus.CONTACTED,
        [AppointmentStatus.NO_SHOW]: LeadPipelineStatus.CONTACTED,
      };
      const next = leadStatusMap[dto.status];
      if (next) {
        const stage = await this.pipeline.resolveStageForStatus(organizationId, next);
        await this.prisma.lead.update({
          where: { id: existing.leadId },
          data: { pipelineStatus: next, funnelStageId: stage?.id },
        });
      }
    }

    await this.audit.log({
      organizationId,
      userId,
      action: 'APPOINTMENT_STATUS_CHANGED',
      entityType: 'APPOINTMENT',
      entityId: id,
      metadata: { previousStatus, newStatus: dto.status },
    });

    await this.attributionHooks.onAppointmentChange(
      organizationId,
      {
        id: appt.id,
        leadId: appt.leadId,
        customerId: appt.customerId,
        branchId: appt.branchId,
        employeeId: appt.employeeId,
        serviceId: appt.serviceId,
        status: appt.status,
      },
      previousStatus,
    );

    if (dto.status === AppointmentStatus.CANCELLED) {
      void this.automation.dispatch(organizationId, AutomationTriggerType.APPOINTMENT_CANCELLED, {
        leadId: appt.leadId,
        customerId: appt.customerId,
        appointmentId: appt.id,
        dedupeKey: `APPOINTMENT_CANCELLED:${appt.id}`,
      });
    }
    if (dto.status === AppointmentStatus.NO_SHOW) {
      void this.automation.dispatch(organizationId, AutomationTriggerType.NO_SHOW, {
        leadId: appt.leadId,
        customerId: appt.customerId,
        appointmentId: appt.id,
        dedupeKey: `NO_SHOW:${appt.id}`,
      });
    }

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
      ...(query.serviceId && { serviceId: query.serviceId }),
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
      room: true,
      bed: true,
      equipment: true,
      adCampaign: { select: { id: true, name: true } },
    };
  }
}
