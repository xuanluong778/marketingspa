import { Injectable, Logger } from '@nestjs/common';
import {
  AppointmentStatus,
  LeadPipelineStatus,
  MarketingFunnelEventType,
  PaymentStatus,
} from '@marketingspa/database';
import { AttributionService } from './attribution.service';
import { OfflineConversionService } from './offline-conversion.service';
import type { AttributionInputDto } from './dto/attribution.dto';

@Injectable()
export class AttributionHooksService {
  private readonly logger = new Logger(AttributionHooksService.name);

  constructor(
    private readonly attribution: AttributionService,
    private readonly offline: OfflineConversionService,
  ) {}

  async onLeadCreated(
    organizationId: string,
    lead: { id: string; customerId?: string | null; phone?: string | null; email?: string | null },
    attribution?: AttributionInputDto,
  ) {
    if (attribution) {
      try {
        await this.attribution.upsertLeadAttribution(organizationId, lead.id, attribution);
      } catch (err) {
        this.logger.warn(`attribution upsert failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    const { event, created } = await this.attribution.recordFunnelEvent({
      organizationId,
      eventType: MarketingFunnelEventType.LEAD_CREATED,
      idempotencyKey: `LEAD_CREATED:${lead.id}`,
      leadId: lead.id,
      customerId: lead.customerId,
    });

    if (created) {
      const jobs = await this.attribution.enqueueOfflineConversions({
        organizationId,
        funnelEventId: event.id,
        leadId: lead.id,
        eventType: MarketingFunnelEventType.LEAD_CREATED,
        payload: {
          event_name: 'Lead',
          lead_id: lead.id,
          phone: lead.phone,
          email: lead.email,
          gclid: attribution?.gclid,
          fbclid: attribution?.fbclid,
        },
      });
      await this.offline.enqueuePendingJobs(
        organizationId,
        jobs.map((j) => j.id),
      );
    }
  }

  async onLeadQualified(organizationId: string, leadId: string) {
    await this.attribution.recordFunnelEvent({
      organizationId,
      eventType: MarketingFunnelEventType.LEAD_QUALIFIED,
      idempotencyKey: `LEAD_QUALIFIED:${leadId}`,
      leadId,
    });
  }

  async onAppointmentChange(
    organizationId: string,
    appt: {
      id: string;
      leadId?: string | null;
      customerId?: string | null;
      branchId?: string | null;
      employeeId?: string | null;
      serviceId?: string | null;
      status: AppointmentStatus;
    },
    previousStatus?: AppointmentStatus,
  ) {
    const map: Partial<Record<AppointmentStatus, MarketingFunnelEventType>> = {
      [AppointmentStatus.SCHEDULED]: MarketingFunnelEventType.APPOINTMENT_BOOKED,
      [AppointmentStatus.CONFIRMED]: MarketingFunnelEventType.APPOINTMENT_CONFIRMED,
      [AppointmentStatus.ARRIVED]: MarketingFunnelEventType.CUSTOMER_ARRIVED,
      [AppointmentStatus.COMPLETED]: MarketingFunnelEventType.CUSTOMER_ARRIVED,
      [AppointmentStatus.CANCELLED]: MarketingFunnelEventType.APPOINTMENT_CANCELLED,
    };

    const eventType = map[appt.status];
    if (!eventType) return;
    if (previousStatus === appt.status) return;

    // One booked event per appointment (idempotent) — multiple appointments ≠ multiple leads
    const { event, created } = await this.attribution.recordFunnelEvent({
      organizationId,
      eventType,
      idempotencyKey: `${eventType}:${appt.id}`,
      leadId: appt.leadId,
      customerId: appt.customerId,
      appointmentId: appt.id,
      branchId: appt.branchId,
      employeeId: appt.employeeId,
      serviceId: appt.serviceId,
    });

    if (
      created &&
      (eventType === MarketingFunnelEventType.APPOINTMENT_BOOKED ||
        eventType === MarketingFunnelEventType.CUSTOMER_ARRIVED)
    ) {
      const jobs = await this.attribution.enqueueOfflineConversions({
        organizationId,
        funnelEventId: event.id,
        leadId: appt.leadId,
        eventType,
        payload: {
          event_name: eventType,
          appointment_id: appt.id,
          lead_id: appt.leadId,
        },
      });
      await this.offline.enqueuePendingJobs(
        organizationId,
        jobs.map((j) => j.id),
      );
    }
  }

  async onPayment(
    organizationId: string,
    payment: {
      id: string;
      orderId: string;
      amount: number;
      status: PaymentStatus;
      leadId?: string | null;
      customerId?: string | null;
      branchId?: string | null;
      serviceIds?: string[];
      isReturningCustomer?: boolean;
    },
  ) {
    if (payment.status === PaymentStatus.COMPLETED) {
      const purchased = await this.attribution.recordFunnelEvent({
        organizationId,
        eventType: MarketingFunnelEventType.SERVICE_PURCHASED,
        idempotencyKey: `SERVICE_PURCHASED:${payment.orderId}`,
        leadId: payment.leadId,
        customerId: payment.customerId,
        orderId: payment.orderId,
        paymentId: payment.id,
        branchId: payment.branchId,
        serviceId: payment.serviceIds?.[0],
        amount: payment.amount,
      });

      const paid = await this.attribution.recordFunnelEvent({
        organizationId,
        eventType: MarketingFunnelEventType.PAYMENT_COMPLETED,
        idempotencyKey: `PAYMENT_COMPLETED:${payment.id}`,
        leadId: payment.leadId,
        customerId: payment.customerId,
        orderId: payment.orderId,
        paymentId: payment.id,
        branchId: payment.branchId,
        amount: payment.amount,
      });

      if (payment.isReturningCustomer) {
        await this.attribution.recordFunnelEvent({
          organizationId,
          eventType: MarketingFunnelEventType.CUSTOMER_RETURNED,
          idempotencyKey: `CUSTOMER_RETURNED:${payment.orderId}`,
          leadId: payment.leadId,
          customerId: payment.customerId,
          orderId: payment.orderId,
          amount: payment.amount,
        });
      }

      if (paid.created) {
        const jobs = await this.attribution.enqueueOfflineConversions({
          organizationId,
          funnelEventId: paid.event.id,
          leadId: payment.leadId,
          eventType: MarketingFunnelEventType.PAYMENT_COMPLETED,
          payload: {
            event_name: 'Purchase',
            value: payment.amount,
            currency: 'VND',
            order_id: payment.orderId,
            payment_id: payment.id,
            lead_id: payment.leadId,
          },
        });
        await this.offline.enqueuePendingJobs(
          organizationId,
          jobs.map((j) => j.id),
        );
      }

      return purchased;
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      await this.attribution.recordFunnelEvent({
        organizationId,
        eventType: MarketingFunnelEventType.PAYMENT_REFUNDED,
        idempotencyKey: `PAYMENT_REFUNDED:${payment.id}`,
        leadId: payment.leadId,
        customerId: payment.customerId,
        orderId: payment.orderId,
        paymentId: payment.id,
        amount: payment.amount,
      });
    }
  }

  isQualifiedStatus(status: LeadPipelineStatus): boolean {
    const qualified: LeadPipelineStatus[] = [
      LeadPipelineStatus.CONTACTED,
      LeadPipelineStatus.QUALIFIED,
      LeadPipelineStatus.BOOKED,
      LeadPipelineStatus.CONFIRMED,
      LeadPipelineStatus.VISITED,
      LeadPipelineStatus.PURCHASED,
    ];
    return qualified.includes(status);
  }
}
