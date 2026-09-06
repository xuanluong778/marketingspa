import { Module } from '@nestjs/common';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingPublicController } from './email-marketing-public.controller';
import { EmailMarketingService } from './email-marketing.service';
import { EmailMarketingQueueService } from './email-marketing-queue.service';
import { EmailRouterService } from '../email/email-router.service';
import { BrevoWebhookService } from './brevo-webhook.service';
import { BrevoWebhookController } from '../webhooks/brevo-webhook.controller';

@Module({
  controllers: [
    EmailMarketingController,
    EmailMarketingPublicController,
    BrevoWebhookController,
  ],
  providers: [
    EmailMarketingService,
    EmailMarketingQueueService,
    EmailRouterService,
    BrevoWebhookService,
  ],
  exports: [EmailMarketingService, EmailRouterService, BrevoWebhookService],
})
export class EmailMarketingModule {}
