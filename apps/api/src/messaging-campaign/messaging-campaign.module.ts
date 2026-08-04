import { Module } from '@nestjs/common';
import { MessagingCampaignController } from './messaging-campaign.controller';
import { MessagingCampaignService } from './messaging-campaign.service';
import { MessagingCampaignSegmentService } from './messaging-campaign-segment.service';
import { MessagingCampaignQueueService } from './messaging-campaign-queue.service';
import { MessagingModule } from '../messaging/messaging.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [MessagingModule, AuditModule],
  controllers: [MessagingCampaignController],
  providers: [
    MessagingCampaignService,
    MessagingCampaignSegmentService,
    MessagingCampaignQueueService,
  ],
  exports: [
    MessagingCampaignService,
    MessagingCampaignSegmentService,
    MessagingCampaignQueueService,
  ],
})
export class MessagingCampaignModule {}
