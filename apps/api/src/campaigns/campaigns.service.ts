import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { MarketingCampaignStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { Queue } from 'bullmq';
import { CAMPAIGN_QUEUE } from '../queue/queue.constants';
import { EventsGateway } from '../events/events.gateway';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CAMPAIGN_QUEUE) private readonly campaignQueue: Queue,
    private readonly events: EventsGateway,
    private readonly queueEnqueue: QueueEnqueueService,
    private readonly tenant: TenantOwnershipService,
  ) {}

  findAll(organizationId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { customers: true } } },
    });
  }

  async findOne(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: { customers: { include: { customer: true } } },
    });
    if (!campaign) throw new NotFoundException('Campaign không tồn tại');
    return campaign;
  }

  async create(organizationId: string, dto: CreateCampaignDto) {
    for (const customerId of dto.contactIds) {
      await this.tenant.assertCustomer(organizationId, customerId);
    }
    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        channel: dto.channel,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        organizationId,
        customers: {
          create: dto.contactIds.map((customerId) => ({ customerId })),
        },
      },
      include: { _count: { select: { customers: true } } },
    });
  }

  async enqueueSend(organizationId: string, id: string) {
    const campaign = await this.findOne(organizationId, id);

    if (
      campaign.status !== MarketingCampaignStatus.DRAFT &&
      campaign.status !== MarketingCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign không thể gửi ở trạng thái hiện tại');
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: MarketingCampaignStatus.RUNNING },
    });

    await this.queueEnqueue.add(this.campaignQueue, 'send-campaign', {
      campaignId: id,
      organizationId,
    });

    // Broadcast realtime update
    this.events.broadcastCampaignUpdate(organizationId, {
      campaignId: id,
      status: MarketingCampaignStatus.RUNNING,
    });

    return { message: 'Campaign đã được đưa vào hàng đợi', campaignId: id };
  }
}
