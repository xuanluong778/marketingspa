import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AdPlatform,
  MarketingFunnelEventType,
  OfflineConversionProvider,
  OfflineConversionStatus,
  PaymentStatus,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import type { AttributionInputDto } from './dto/attribution.dto';

export type TouchSnapshot = {
  channel?: AdPlatform | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  adCampaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  externalCampaignId?: string | null;
  externalAdSetId?: string | null;
  externalAdId?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  capturedAt: string;
};

function normalizePhone(phone?: string | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits;
}

function normalizeEmail(email?: string | null): string | null {
  if (!email?.trim()) return null;
  return email.trim().toLowerCase();
}

function touchFromInput(input: AttributionInputDto): TouchSnapshot {
  return {
    channel: input.channel ?? null,
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    utmContent: input.utmContent ?? null,
    utmTerm: input.utmTerm ?? null,
    fbclid: input.fbclid ?? null,
    gclid: input.gclid ?? null,
    adCampaignId: input.adCampaignId ?? null,
    adSetId: input.adSetId ?? null,
    adId: input.adId ?? null,
    externalCampaignId: input.externalCampaignId ?? null,
    externalAdSetId: input.externalAdSetId ?? null,
    externalAdId: input.externalAdId ?? null,
    landingPage: input.landingPage ?? null,
    referrer: input.referrer ?? null,
    capturedAt: new Date().toISOString(),
  };
}

function inferChannel(input: AttributionInputDto): AdPlatform | null {
  if (input.channel) return input.channel;
  if (input.fbclid || input.utmSource?.toLowerCase().includes('facebook') || input.utmSource?.toLowerCase() === 'fb') {
    return AdPlatform.META;
  }
  if (input.gclid || input.utmSource?.toLowerCase().includes('google')) {
    return AdPlatform.GOOGLE;
  }
  if (input.utmSource?.toLowerCase().includes('chatbot')) return AdPlatform.OTHER;
  if (input.utmSource) return AdPlatform.MANUAL;
  return null;
}

@Injectable()
export class AttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantOwnershipService,
  ) {}

  /**
   * Dedupe: ưu tiên platformExternalLeadId; rồi phone/email trong org.
   * Không gộp nếu tên rõ ràng khác và không có click-id/platform id chung.
   */
  async findDuplicateLead(
    organizationId: string,
    opts: {
      phone?: string | null;
      email?: string | null;
      name?: string;
      platformExternalLeadId?: string | null;
      platform?: AdPlatform | null;
    },
  ) {
    if (opts.platformExternalLeadId) {
      const byExt = await this.prisma.lead.findFirst({
        where: {
          organizationId,
          platformExternalLeadId: opts.platformExternalLeadId,
        },
      });
      if (byExt) return byExt;
    }

    const phone = normalizePhone(opts.phone);
    const email = normalizeEmail(opts.email);
    if (!phone && !email) return null;

    const candidates = await this.prisma.lead.findMany({
      where: {
        organizationId,
        OR: [
          ...(phone ? [{ phone: { contains: phone.slice(-9) } }] : []),
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { attribution: true },
    });

    for (const c of candidates) {
      const cPhone = normalizePhone(c.phone);
      const cEmail = normalizeEmail(c.email);
      const phoneMatch = phone && cPhone && (cPhone === phone || cPhone.endsWith(phone) || phone.endsWith(cPhone));
      const emailMatch = email && cEmail && cEmail === email;
      if (!phoneMatch && !emailMatch) continue;

      // Avoid merging clearly different people sharing a company email without click ids
      if (
        emailMatch &&
        !phoneMatch &&
        opts.name &&
        c.name &&
        opts.name.trim().toLowerCase() !== c.name.trim().toLowerCase() &&
        !opts.platformExternalLeadId
      ) {
        continue;
      }
      return c;
    }
    return null;
  }

  async upsertLeadAttribution(
    organizationId: string,
    leadId: string,
    input: AttributionInputDto,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { attribution: true },
    });
    if (!lead) throw new NotFoundException('Lead không tồn tại');

    await Promise.all([
      this.tenant.assertAdCampaign(organizationId, input.adCampaignId),
      this.tenant.assertAdSet(organizationId, input.adSetId),
      this.tenant.assertAdCreative(organizationId, input.adId),
    ]);

    const channel = inferChannel(input);
    const touch = touchFromInput({ ...input, channel: channel ?? undefined });
    const firstTouch = (lead.attribution?.firstTouchJson as TouchSnapshot | null) ?? touch;
    const lastTouch = touch;

    const data: Prisma.LeadAttributionUncheckedCreateInput = {
      organizationId,
      leadId,
      channel,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      utmContent: input.utmContent,
      utmTerm: input.utmTerm,
      fbclid: input.fbclid,
      gclid: input.gclid,
      adCampaignId: input.adCampaignId,
      adSetId: input.adSetId,
      adId: input.adId,
      externalCampaignId: input.externalCampaignId,
      externalAdSetId: input.externalAdSetId,
      externalAdId: input.externalAdId,
      landingPage: input.landingPage,
      referrer: input.referrer,
      firstTouchJson: firstTouch as unknown as Prisma.InputJsonValue,
      lastTouchJson: lastTouch as unknown as Prisma.InputJsonValue,
      rawPayload: input as unknown as Prisma.InputJsonValue,
    };

    if (lead.attribution) {
      return this.prisma.leadAttribution.update({
        where: { leadId },
        data: {
          ...data,
          firstTouchJson: lead.attribution.firstTouchJson ?? data.firstTouchJson,
        },
      });
    }

    const created = await this.prisma.leadAttribution.create({ data });

    const hasClick =
      input.fbclid || input.gclid || input.adCampaignId || input.utmSource;
    if (hasClick) {
      void this.recordFunnelEvent({
        organizationId,
        leadId,
        funnelId: lead.funnelRecommendationId,
        eventType: MarketingFunnelEventType.AD_CLICK,
        idempotencyKey: `AD_CLICK:${leadId}`,
        adCampaignId: input.adCampaignId,
        metadata: {
          utmSource: input.utmSource,
          utmCampaign: input.utmCampaign,
          fbclid: input.fbclid,
          gclid: input.gclid,
          landingPage: input.landingPage,
        },
        occurredAt: touch.capturedAt ? new Date(touch.capturedAt) : undefined,
      });
    }

    return created;
  }

  async recordFunnelEvent(params: {
    organizationId: string;
    eventType: MarketingFunnelEventType;
    idempotencyKey: string;
    funnelId?: string | null;
    leadId?: string | null;
    customerId?: string | null;
    appointmentId?: string | null;
    orderId?: string | null;
    paymentId?: string | null;
    branchId?: string | null;
    employeeId?: string | null;
    serviceId?: string | null;
    adCampaignId?: string | null;
    amount?: number | null;
    metadata?: Prisma.InputJsonValue;
    occurredAt?: Date;
  }) {
    const existing = await this.prisma.marketingFunnelEvent.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: params.organizationId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (params.metadata != null) {
        const event = await this.prisma.marketingFunnelEvent.update({
          where: { id: existing.id },
          data: { metadata: params.metadata },
        });
        return { event, created: false };
      }
      return { event: existing, created: false };
    }

    let adCampaignId = params.adCampaignId ?? null;
    let funnelId = params.funnelId ?? null;
    if (params.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { organizationId: params.organizationId, id: params.leadId },
        select: { funnelRecommendationId: true },
      });
      if (!funnelId) funnelId = lead?.funnelRecommendationId ?? null;
      if (!adCampaignId) {
        const attr = await this.prisma.leadAttribution.findFirst({
          where: { organizationId: params.organizationId, leadId: params.leadId },
          select: { adCampaignId: true },
        });
        adCampaignId = attr?.adCampaignId ?? null;
      }
    }

    const event = await this.prisma.marketingFunnelEvent.create({
      data: {
        organizationId: params.organizationId,
        funnelId: funnelId ?? undefined,
        eventType: params.eventType,
        idempotencyKey: params.idempotencyKey,
        leadId: params.leadId ?? undefined,
        customerId: params.customerId ?? undefined,
        appointmentId: params.appointmentId ?? undefined,
        orderId: params.orderId ?? undefined,
        paymentId: params.paymentId ?? undefined,
        branchId: params.branchId ?? undefined,
        employeeId: params.employeeId ?? undefined,
        serviceId: params.serviceId ?? undefined,
        adCampaignId: adCampaignId ?? undefined,
        amount: params.amount != null ? new Prisma.Decimal(params.amount) : undefined,
        metadata: params.metadata,
        occurredAt: params.occurredAt ?? new Date(),
      },
    });

    return { event, created: true };
  }

  async enqueueOfflineConversions(params: {
    organizationId: string;
    funnelEventId: string;
    leadId?: string | null;
    eventType: MarketingFunnelEventType;
    payload: Record<string, unknown>;
  }) {
    const jobs = [];
    for (const provider of [
      OfflineConversionProvider.META_CAPI,
      OfflineConversionProvider.GOOGLE_ENHANCED,
    ] as const) {
      const idempotencyKey = `${provider}:${params.funnelEventId}`;
      const existing = await this.prisma.offlineConversionJob.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: params.organizationId,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        jobs.push(existing);
        continue;
      }
      const job = await this.prisma.offlineConversionJob.create({
        data: {
          organizationId: params.organizationId,
          provider,
          status: OfflineConversionStatus.PENDING,
          eventType: params.eventType,
          funnelEventId: params.funnelEventId,
          leadId: params.leadId ?? undefined,
          idempotencyKey,
          payload: params.payload as Prisma.InputJsonValue,
          nextRetryAt: new Date(),
        },
      });
      jobs.push(job);
    }
    return jobs;
  }

  /** Net revenue for lead: sum of COMPLETED payments (REFUNDED status flips off revenue) */
  async computeLeadRevenue(organizationId: string, leadId: string): Promise<number> {
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId,
        status: PaymentStatus.COMPLETED,
        OR: [
          { order: { leadId } },
          {
            order: {
              customer: { leads: { some: { id: leadId, organizationId } } },
            },
          },
        ],
      },
      select: { amount: true, status: true },
    });

    return payments.reduce((sum, p) => sum + Number(p.amount), 0);
  }
}
