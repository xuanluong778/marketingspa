import { Module } from '@nestjs/common';
import { ZaloMarketingController } from './zalo-marketing.controller';
import { ZaloMarketingPublicController } from './zalo-marketing-public.controller';
import { ZaloMarketingService } from './zalo-marketing.service';
import { ZaloOAuthService } from './zalo-oauth.service';
import { MessagingModule } from '../messaging/messaging.module';
import { MessagingCampaignModule } from '../messaging-campaign/messaging-campaign.module';

@Module({
  imports: [MessagingModule, MessagingCampaignModule],
  controllers: [ZaloMarketingController, ZaloMarketingPublicController],
  providers: [ZaloMarketingService, ZaloOAuthService],
  exports: [ZaloMarketingService],
})
export class ZaloMarketingModule {}
