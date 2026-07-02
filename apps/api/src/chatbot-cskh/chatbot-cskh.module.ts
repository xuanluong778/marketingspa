import { Module } from '@nestjs/common';
import { ChatbotCskhController } from './chatbot-cskh.controller';
import { ChatbotCskhPublicController } from './chatbot-cskh-public.controller';
import { ChatbotCskhService } from './chatbot-cskh.service';
import { ChatbotCskhPublicService } from './chatbot-cskh-public.service';
import { ChatbotSuggestService } from './chatbot-suggest.service';

@Module({
  controllers: [ChatbotCskhController, ChatbotCskhPublicController],
  providers: [ChatbotCskhService, ChatbotCskhPublicService, ChatbotSuggestService],
  exports: [ChatbotCskhService],
})
export class ChatbotCskhModule {}
