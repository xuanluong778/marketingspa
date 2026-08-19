import { Module } from '@nestjs/common';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingPublicController } from './email-marketing-public.controller';
import { EmailMarketingService } from './email-marketing.service';
import { EmailMarketingQueueService } from './email-marketing-queue.service';

@Module({
  controllers: [EmailMarketingController, EmailMarketingPublicController],
  providers: [EmailMarketingService, EmailMarketingQueueService],
  exports: [EmailMarketingService],
})
export class EmailMarketingModule {}
