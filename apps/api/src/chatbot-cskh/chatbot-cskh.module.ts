import { Module } from '@nestjs/common';
import { ChatbotCskhController } from './chatbot-cskh.controller';
import { ChatbotCskhPublicController } from './chatbot-cskh-public.controller';
import { ChatbotFacebookWebhookController } from './chatbot-facebook-webhook.controller';
import { ChatbotCskhService } from './chatbot-cskh.service';
import { ChatbotCskhPublicService } from './chatbot-cskh-public.service';
import { ChatbotSuggestService } from './chatbot-suggest.service';
import { ChatbotFacebookWebhookService } from './chatbot-facebook-webhook.service';
import { EventsModule } from '../events/events.module';
import { AttributionModule } from '../attribution/attribution.module';
import { LeadsModule } from '../leads/leads.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [EventsModule, AttributionModule, LeadsModule, MessagingModule],
  controllers: [
    ChatbotCskhController,
    ChatbotCskhPublicController,
    ChatbotFacebookWebhookController,
  ],
  providers: [
    ChatbotCskhService,
    ChatbotCskhPublicService,
    ChatbotSuggestService,
    ChatbotFacebookWebhookService,
  ],
  exports: [ChatbotCskhService, ChatbotFacebookWebhookService],
})
export class ChatbotCskhModule {}
