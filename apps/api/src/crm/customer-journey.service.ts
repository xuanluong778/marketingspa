import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketingFunnelEventType } from '@marketingspa/database';
import {
  activityActionToJourneyKind,
  funnelEventTypeToJourneyKind,
  journeyStepLabel,
  mergeCustomerJourneyTimeline,
  type JourneyTimelineItem,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AttributionService } from '../attribution/attribution.service';
import type { TouchSnapshot } from '../attribution/attribution.service';

@Injectable()
export class CustomerJourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attribution: AttributionService,
  ) {}

  async recordJourneyStep(params: {
    organizationId: string;
    leadId: string;
    eventType: MarketingFunnelEventType;
    idempotencyKey: string;
    funnelId?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
    amount?: number | null;
    appointmentId?: string | null;
    orderId?: string | null;
    paymentId?: string | null;
  }) {
    return this.attribution.recordFunnelEvent({
      organizationId: params.organizationId,
      leadId: params.leadId,
      funnelId: params.funnelId,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata as never,
      occurredAt: params.occurredAt,
      amount: params.amount,
      appointmentId: params.appointmentId,
      orderId: params.orderId,
      paymentId: params.paymentId,
    });
  }

  async getLeadJourney(organizationId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        note: true,
        funnelRecommendationId: true,
        createdAt: true,
        pipelineStatus: true,
        qualification: true,
        attribution: true,
        funnelRecommendation: { select: { id: true, prompt: true, selectedSlug: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead không tồn tại');

    const funnelId = lead.funnelRecommendationId;

    const [funnelEvents, activities, conversations] = await Promise.all([
      this.prisma.marketingFunnelEvent.findMany({
        where: { organizationId, leadId },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.leadActivity.findMany({
        where: { organizationId, leadId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.chatbotConversation.findMany({
        where: {
          organizationId,
          OR: [
            { linkedLeadId: leadId },
            ...(lead.phone ? [{ visitorPhone: { contains: lead.phone.slice(-9) } }] : []),
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          channel: true,
          status: true,
          linkedLeadId: true,
          bot: { select: { botName: true } },
        },
      }),
    ]);

    const items: JourneyTimelineItem[] = [];

    for (const ev of funnelEvents) {
      const kind = funnelEventTypeToJourneyKind(ev.eventType);
      if (!kind) continue;
      items.push({
        id: ev.id,
        kind,
        label: journeyStepLabel(kind),
        title: this.titleForKind(kind, ev.metadata as Record<string, unknown> | null),
        occurredAt: ev.occurredAt.toISOString(),
        organizationId: ev.organizationId,
        funnelId: ev.funnelId ?? funnelId,
        leadId: ev.leadId,
        source: 'funnel_event',
        dedupeKey: `${kind}:funnel_event:${ev.idempotencyKey}`,
        metadata: {
          eventType: ev.eventType,
          amount: ev.amount != null ? Number(ev.amount) : undefined,
          ...(ev.metadata as object),
        },
      });
    }

    if (lead.attribution) {
      const first = lead.attribution.firstTouchJson as TouchSnapshot | null;
      const touchAt = first?.capturedAt
        ? new Date(first.capturedAt)
        : lead.attribution.createdAt;
      const hasClick =
        first?.fbclid ||
        first?.gclid ||
        lead.attribution.fbclid ||
        lead.attribution.gclid ||
        lead.attribution.adCampaignId;

      if (hasClick) {
        items.push({
          id: `attr-${lead.id}`,
          kind: 'AD_CLICK',
          label: journeyStepLabel('AD_CLICK'),
          title: 'Click quảng cáo',
          occurredAt: touchAt.toISOString(),
          organizationId,
          funnelId,
          leadId: lead.id,
          source: 'attribution',
          dedupeKey: `AD_CLICK:attribution:${lead.id}`,
          metadata: {
            utmSource: first?.utmSource ?? lead.attribution.utmSource,
            utmCampaign: first?.utmCampaign ?? lead.attribution.utmCampaign,
            fbclid: first?.fbclid ?? lead.attribution.fbclid,
            gclid: first?.gclid ?? lead.attribution.gclid,
            adCampaignId: first?.adCampaignId ?? lead.attribution.adCampaignId,
            landingPage: first?.landingPage ?? lead.attribution.landingPage,
            referrer: first?.referrer ?? lead.attribution.referrer,
          },
        });
      }
    }

    for (const act of activities) {
      const kind = activityActionToJourneyKind(act.action, act.metadata);
      if (!kind) continue;
      items.push({
        id: act.id,
        kind,
        label: journeyStepLabel(kind),
        title: this.titleForActivity(act.action, act.fromValue, act.toValue, act.metadata),
        occurredAt: act.createdAt.toISOString(),
        organizationId: act.organizationId,
        funnelId,
        leadId: act.leadId,
        source: 'activity',
        dedupeKey: `${kind}:activity:${act.action}:${act.id}`,
        metadata: {
          action: act.action,
          fromValue: act.fromValue,
          toValue: act.toValue,
          ...(act.metadata as object),
        },
      });
    }

    for (const conv of conversations) {
      items.push({
        id: conv.id,
        kind: 'CHATBOT',
        label: journeyStepLabel('CHATBOT'),
        title: `Chatbot ${conv.bot?.botName ?? conv.channel}`,
        occurredAt: conv.createdAt.toISOString(),
        organizationId,
        funnelId,
        leadId: lead.id,
        source: 'chatbot',
        dedupeKey: `CHATBOT:chatbot:${conv.id}`,
        metadata: { channel: conv.channel, status: conv.status },
      });
    }

    if (!items.some((i) => i.kind === 'LEAD')) {
      items.push({
        id: `lead-${lead.id}`,
        kind: 'LEAD',
        label: journeyStepLabel('LEAD'),
        title: `Lead: ${lead.name}`,
        occurredAt: lead.createdAt.toISOString(),
        organizationId,
        funnelId,
        leadId: lead.id,
        source: 'activity',
        dedupeKey: `LEAD:lead:${lead.id}`,
        metadata: { pipelineStatus: lead.pipelineStatus },
      });
    }

    const timeline = mergeCustomerJourneyTimeline(items);

    return {
      leadId: lead.id,
      leadName: lead.name,
      phone: lead.phone,
      email: lead.email,
      note: lead.note,
      organizationId,
      funnelId,
      funnel: lead.funnelRecommendation,
      timeline,
      stepsCompleted: [...new Set(timeline.map((t) => t.kind))],
    };
  }

  async getFunnelJourney(
    organizationId: string,
    funnelId: string,
    query?: { leadId?: string; limit?: number },
  ) {
    const rec = await this.prisma.funnelRecommendation.findFirst({
      where: { id: funnelId, organizationId },
      select: { id: true, prompt: true, selectedSlug: true },
    });
    if (!rec) throw new NotFoundException('Funnel không tồn tại');

    if (query?.leadId) {
      const journey = await this.getLeadJourney(organizationId, query.leadId);
      const belongs =
        journey.funnelId === funnelId ||
        journey.timeline.some((t) => t.funnelId === funnelId);
      if (!belongs) {
        throw new NotFoundException('Lead không thuộc funnel này');
      }
      return journey;
    }

    const eventLeadRows = await this.prisma.marketingFunnelEvent.findMany({
      where: { organizationId, funnelId, leadId: { not: null } },
      select: { leadId: true },
    });
    const eventLeadIds = [
      ...new Set(eventLeadRows.map((r) => r.leadId).filter((id): id is string => !!id)),
    ];

    const leads = await this.prisma.lead.findMany({
      where: {
        organizationId,
        OR: [
          { funnelRecommendationId: funnelId },
          ...(eventLeadIds.length ? [{ id: { in: eventLeadIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: query?.limit ?? 20,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        note: true,
        createdAt: true,
        pipelineStatus: true,
      },
    });

    const summaries = await Promise.all(
      leads.map(async (l) => {
        const j = await this.getLeadJourney(organizationId, l.id);
        return {
          leadId: l.id,
          leadName: l.name,
          phone: l.phone,
          email: l.email,
          note: l.note,
          pipelineStatus: l.pipelineStatus,
          createdAt: l.createdAt.toISOString(),
          stepsCompleted: j.stepsCompleted,
          lastStep: j.timeline[j.timeline.length - 1] ?? null,
        };
      }),
    );

    return { funnel: rec, leads: summaries };
  }

  private titleForKind(kind: string, metadata: Record<string, unknown> | null): string {
    switch (kind) {
      case 'AD_CLICK':
        return 'Click quảng cáo';
      case 'FORM_SUBMIT':
        return 'Gửi form';
      case 'CHATBOT':
        return 'Tương tác chatbot';
      case 'LEAD':
        return 'Lead được tạo';
      case 'STAGE_CHANGE':
        return metadata?.toStatus
          ? `Chuyển stage → ${metadata.toStatus}`
          : 'Đổi giai đoạn';
      case 'SALE':
        return metadata?.crossed ? `Đạt ${metadata.crossed}` : 'Qualified / Sale';
      case 'BOOKING':
        return 'Đặt lịch';
      case 'VISIT':
        return 'Khách đến spa';
      case 'PURCHASE':
        return metadata?.amount ? `Mua hàng (${metadata.amount})` : 'Mua dịch vụ';
      default:
        return journeyStepLabel(kind as never);
    }
  }

  private titleForActivity(
    action: string,
    fromValue: string | null,
    toValue: string | null,
    metadata: unknown,
  ): string {
    const meta = metadata as { crossed?: string } | null;
    if (action === 'FORM_SUBMITTED') return 'Gửi form funnel';
    if (action === 'STATUS_CHANGED') return `${fromValue ?? '?'} → ${toValue ?? '?'}`;
    if (action === 'SCORE_CHANGED' && meta?.crossed) return `Đạt ngưỡng ${meta.crossed}`;
    if (action === 'CHATBOT_REPLY') return 'Phản hồi chatbot';
    return action;
  }
}
