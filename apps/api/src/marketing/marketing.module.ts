import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [CampaignsModule],
  controllers: [MarketingController],
  providers: [MarketingService],
})
export class MarketingModule {}
