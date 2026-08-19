import { Injectable } from '@nestjs/common';
import {
  MarketingFunnelEventType,
  PaymentStatus,
  Prisma,
} from '@marketingspa/database';
import { resolveAttributionTouch, type FunnelTouchModel } from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AttributionDashboardQueryDto } from './dto/attribution.dto';

export type AttributionRowMetrics = {
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
};

@Injectable()
export class AttributionDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organizationId: string, query: AttributionDashboardQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86400000);
    const to = query.to ? new Date(query.to) : new Date();
    const touchModel: FunnelTouchModel = query.touchModel === 'first' ? 'first' : 'last';

    const attrWhere: Prisma.LeadAttributionWhereInput = {
      organizationId,
      ...(query.channel && { channel: query.channel }),
      ...(query.adCampaignId && { adCampaignId: query.adCampaignId }),
      ...(query.adId && { adId: query.adId }),
      ...(query.utmSource && { utmSource: query.utmSource }),
      lead: {
        createdAt: { gte: from, lte: to },
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.employeeId && { assignedToId: query.employeeId }),
      },
    };

    const attributions = await this.prisma.leadAttribution.findMany({
      where: attrWhere,
      include: {
        lead: {
          select: {
            id: true,
            customerId: true,
            createdAt: true,
            pipelineStatus: true,
            branchId: true,
            assignedToId: true,
          },
        },
        adCampaign: { select: { id: true, name: true, platform: true } },
        ad: { select: { id: true, name: true } },
      },
    });

    const leadIds = attributions.map((a) => a.leadId);
    const campaignIds = [
      ...new Set(attributions.map((a) => a.adCampaignId).filter(Boolean) as string[]),
    ];

    const [events, spends, payments] = await Promise.all([
      leadIds.length
        ? this.prisma.marketingFunnelEvent.findMany({
            where: {
              organizationId,
              leadId: { in: leadIds },
              occurredAt: { gte: from, lte: to },
              ...(query.serviceId && { serviceId: query.serviceId }),
              ...(query.branchId && { branchId: query.branchId }),
              ...(query.employeeId && { employeeId: query.employeeId }),
            },
          })
        : Promise.resolve([]),
      campaignIds.length
        ? this.prisma.adDailyStat.groupBy({
            by: ['adCampaignId'],
            where: {
              organizationId,
              adCampaignId: { in: campaignIds },
              date: { gte: from, lte: to },
            },
            _sum: { spend: true },
          })
        : Promise.resolve([]),
      leadIds.length
        ? this.prisma.payment.findMany({
            where: {
              organizationId,
              paidAt: { gte: from, lte: to },
              // REFUNDED payments are excluded — status flip removes revenue (no double-subtract)
              status: PaymentStatus.COMPLETED,
              order: {
                OR: [
                  { leadId: { in: leadIds } },
                  { customer: { leads: { some: { id: { in: leadIds } } } } },
                ],
              },
            },
            include: {
              order: { select: { leadId: true, customerId: true, items: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const spendByCampaign = new Map(
      spends.map((s) => [s.adCampaignId, Number(s._sum.spend ?? 0)]),
    );

    // customer new/returning filter
    const customerFirstOrder = new Map<string, Date>();
    if (query.customerType && query.customerType !== 'all') {
      const customerIds = [
        ...new Set(attributions.map((a) => a.lead.customerId).filter(Boolean) as string[]),
      ];
      if (customerIds.length) {
        const firstOrders = await this.prisma.order.groupBy({
          by: ['customerId'],
          where: { organizationId, customerId: { in: customerIds } },
          _min: { orderedAt: true },
        });
        for (const row of firstOrders) {
          if (row._min.orderedAt) customerFirstOrder.set(row.customerId, row._min.orderedAt);
        }
      }
    }

    type Bucket = AttributionRowMetrics & {
      leadIdSet: Set<string>;
      orderIdSet: Set<string>;
    };
    const buckets = new Map<string, Bucket>();

    const ensureBucket = (key: string, label: string, adCampaignId: string | null, adId: string | null, channel: string | null) => {
      let b = buckets.get(key);
      if (!b) {
        b = {
          key,
          label,
          adCampaignId,
          adId,
          channel,
          spend: adCampaignId ? spendByCampaign.get(adCampaignId) ?? 0 : 0,
          leads: 0,
          qualifiedLeads: 0,
          appointments: 0,
          arrived: 0,
          orders: 0,
          revenue: 0,
          cpl: null,
          costPerAppointment: null,
          cac: null,
          roas: null,
          estimatedProfit: 0,
          leadIdSet: new Set(),
          orderIdSet: new Set(),
        };
        buckets.set(key, b);
      }
      return b;
    };

    for (const attr of attributions) {
      if (query.customerType === 'new' || query.customerType === 'returning') {
        const cid = attr.lead.customerId;
        if (!cid) {
          if (query.customerType === 'returning') continue;
        } else {
          const first = customerFirstOrder.get(cid);
          const isNew = !first || first >= from;
          if (query.customerType === 'new' && !isNew) continue;
          if (query.customerType === 'returning' && isNew) continue;
        }
      }

      const touch = resolveAttributionTouch(attr, touchModel);
      if (query.utmSource && touch.utmSource !== query.utmSource) continue;

      const groupByAd = query.groupByAd === true;
      const effectiveCampaignId = touch.adCampaignId ?? attr.adCampaignId;
      const effectiveAdId = touch.adId ?? attr.adId;
      const effectiveChannel = touch.channel ?? (attr.channel ? String(attr.channel) : null);

      const key = groupByAd
        ? `ad:${effectiveAdId ?? 'none'}:${effectiveCampaignId ?? 'none'}`
        : `campaign:${effectiveCampaignId ?? effectiveChannel ?? touch.utmCampaign ?? 'unknown'}`;
      const label = groupByAd
        ? attr.ad?.name ?? touch.externalAdId ?? attr.externalAdId ?? 'Ad (không xác định)'
        : attr.adCampaign?.name ?? touch.utmCampaign ?? attr.utmCampaign ?? String(effectiveChannel ?? 'Không xác định');

      const b = ensureBucket(key, label, effectiveCampaignId, effectiveAdId, effectiveChannel);
      if (!b.leadIdSet.has(attr.leadId)) {
        b.leadIdSet.add(attr.leadId);
        b.leads += 1;
      }
    }

    const leadToBucket = new Map<string, Bucket>();
    for (const attr of attributions) {
      const touch = resolveAttributionTouch(attr, touchModel);
      if (query.utmSource && touch.utmSource !== query.utmSource) continue;

      const groupByAd = query.groupByAd === true;
      const effectiveCampaignId = touch.adCampaignId ?? attr.adCampaignId;
      const effectiveAdId = touch.adId ?? attr.adId;
      const effectiveChannel = touch.channel ?? (attr.channel ? String(attr.channel) : null);
      const key = groupByAd
        ? `ad:${effectiveAdId ?? 'none'}:${effectiveCampaignId ?? 'none'}`
        : `campaign:${effectiveCampaignId ?? effectiveChannel ?? touch.utmCampaign ?? 'unknown'}`;
      const b = buckets.get(key);
      if (b) leadToBucket.set(attr.leadId, b);
    }

    for (const ev of events) {
      if (!ev.leadId) continue;
      const b = leadToBucket.get(ev.leadId);
      if (!b) continue;
      switch (ev.eventType) {
        case MarketingFunnelEventType.LEAD_QUALIFIED:
          b.qualifiedLeads += 1;
          break;
        case MarketingFunnelEventType.APPOINTMENT_BOOKED:
        case MarketingFunnelEventType.APPOINTMENT_CONFIRMED:
          b.appointments += 1;
          break;
        case MarketingFunnelEventType.CUSTOMER_ARRIVED:
          b.arrived += 1;
          break;
        default:
          break;
      }
    }

    // Unique appointments by counting distinct appointment booked events better
    for (const b of buckets.values()) {
      const booked = events.filter(
        (e) =>
          e.leadId &&
          b.leadIdSet.has(e.leadId) &&
          e.eventType === MarketingFunnelEventType.APPOINTMENT_BOOKED,
      );
      const uniqAppt = new Set(booked.map((e) => e.appointmentId).filter(Boolean));
      b.appointments = uniqAppt.size || booked.length;

      const arrived = events.filter(
        (e) =>
          e.leadId &&
          b.leadIdSet.has(e.leadId) &&
          e.eventType === MarketingFunnelEventType.CUSTOMER_ARRIVED,
      );
      b.arrived = new Set(arrived.map((e) => e.appointmentId ?? e.id)).size;

      const qualified = events.filter(
        (e) =>
          e.leadId &&
          b.leadIdSet.has(e.leadId) &&
          e.eventType === MarketingFunnelEventType.LEAD_QUALIFIED,
      );
      b.qualifiedLeads = new Set(qualified.map((e) => e.leadId)).size;
      // orders counted from COMPLETED payments below (refund drops order + CAC)
    }

    for (const p of payments) {
      const leadId = p.order.leadId;
      let b: Bucket | undefined;
      if (leadId) b = leadToBucket.get(leadId);
      if (!b && p.order.customerId) {
        for (const attr of attributions) {
          if (attr.lead.customerId === p.order.customerId) {
            b = leadToBucket.get(attr.leadId);
            if (b) break;
          }
        }
      }
      if (!b) continue;
      if (query.serviceId) {
        const hasService = p.order.items.some((i) => i.serviceId === query.serviceId);
        if (!hasService) continue;
      }
      const amt = Number(p.amount);
      if (p.status === PaymentStatus.COMPLETED) {
        b.revenue += amt;
        b.orderIdSet.add(p.orderId);
      }
    }

    for (const b of buckets.values()) {
      b.orders = b.orderIdSet.size;
    }

    const rows: AttributionRowMetrics[] = [...buckets.values()].map((b) => {
      const { leadIdSet: _s, orderIdSet: _o, ...rest } = b;
      rest.cpl = rest.leads > 0 ? rest.spend / rest.leads : null;
      rest.costPerAppointment = rest.appointments > 0 ? rest.spend / rest.appointments : null;
      rest.cac = rest.orders > 0 ? rest.spend / rest.orders : null;
      rest.roas = rest.spend > 0 ? rest.revenue / rest.spend : null;
      rest.estimatedProfit = rest.revenue - rest.spend;
      return rest;
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.spend += r.spend;
        acc.leads += r.leads;
        acc.qualifiedLeads += r.qualifiedLeads;
        acc.appointments += r.appointments;
        acc.arrived += r.arrived;
        acc.orders += r.orders;
        acc.revenue += r.revenue;
        return acc;
      },
      {
        spend: 0,
        leads: 0,
        qualifiedLeads: 0,
        appointments: 0,
        arrived: 0,
        orders: 0,
        revenue: 0,
      },
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      touchModel,
      totals: {
        ...totals,
        cpl: totals.leads > 0 ? totals.spend / totals.leads : null,
        costPerAppointment:
          totals.appointments > 0 ? totals.spend / totals.appointments : null,
        cac: totals.orders > 0 ? totals.spend / totals.orders : null,
        roas: totals.spend > 0 ? totals.revenue / totals.spend : null,
        estimatedProfit: totals.revenue - totals.spend,
      },
      rows,
    };
  }
}
