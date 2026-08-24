import { Module } from '@nestjs/common';
import { MarketingAutopilotController } from './marketing-autopilot.controller';
import { MarketingAutopilotService } from './marketing-autopilot.service';
import { MarketingAutopilotContentDraftService } from './marketing-autopilot-content-draft.service';
import { MarketingAutopilotDraftAdapter } from './marketing-autopilot-draft.adapter';
import { MarketingAutopilotPlannerService } from './marketing-autopilot-planner.service';
import { MarketingAutopilotAutofillService } from './marketing-autopilot-autofill.service';
import { MarketingContextEngineService } from './context/marketing-context-engine.service';
import { MarketingContextCacheService } from './context/marketing-context-cache.service';
import { MarketingContextDatasourcesService } from './context/marketing-context-datasources.service';
import { MarketingAutopilotOutcomeLearningService } from './outcome/marketing-autopilot-outcome-learning.service';
import { MarketingAutopilotOutcomeLoopService } from './outcome/marketing-autopilot-outcome-loop.service';
import { MarketingMissionOrchestratorService } from './orchestrator/marketing-mission-orchestrator.service';
import { MarketingAutopilotExecutorService } from './orchestrator/marketing-autopilot-executor.service';
import { MarketingAutopilotExecutionEngineService } from './orchestrator/marketing-autopilot-execution-engine.service';
import { ContentMarketingModule } from '../content-marketing/content-marketing.module';
import { AutomationModule } from '../automation/automation.module';
import { MessagingCampaignModule } from '../messaging-campaign/messaging-campaign.module';
import { AutoPostModule } from '../auto-post/auto-post.module';
import { ChatbotCskhModule } from '../chatbot-cskh/chatbot-cskh.module';
import { AiAdsManagerModule } from '../ai-ads-manager/ai-ads-manager.module';
import {
  EmailMarketingService,
  FunnelBuilderService,
  FunnelGeneratorService,
  FunnelLifecycleService,
  LeadScoringService,
} from './compat/domain-stubs';

@Module({
  imports: [
    ContentMarketingModule,
    AutomationModule,
    MessagingCampaignModule,
    AutoPostModule,
    ChatbotCskhModule,
    AiAdsManagerModule,
  ],
  controllers: [MarketingAutopilotController],
  providers: [
    MarketingAutopilotService,
    MarketingAutopilotDraftAdapter,
    MarketingAutopilotContentDraftService,
    MarketingAutopilotPlannerService,
    MarketingAutopilotAutofillService,
    MarketingContextEngineService,
    MarketingContextCacheService,
    MarketingContextDatasourcesService,
    MarketingAutopilotOutcomeLearningService,
    MarketingAutopilotOutcomeLoopService,
    MarketingAutopilotExecutorService,
    MarketingAutopilotExecutionEngineService,
    MarketingMissionOrchestratorService,
    FunnelBuilderService,
    FunnelGeneratorService,
    FunnelLifecycleService,
    EmailMarketingService,
    LeadScoringService,
  ],
  exports: [
    MarketingAutopilotOutcomeLearningService,
    MarketingAutopilotOutcomeLoopService,
    MarketingMissionOrchestratorService,
    MarketingAutopilotExecutionEngineService,
  ],
})
export class MarketingAutopilotModule {}
