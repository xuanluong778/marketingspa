import { Module } from '@nestjs/common';
import { AiAdsManagerController } from './ai-ads-manager.controller';
import { AiAdsManagerService } from './ai-ads-manager.service';
import { AdPerformanceModule } from '../ad-performance/ad-performance.module';
import { OpenAiModule } from '../openai/openai.module';
import { AdsMcpModule } from '../ads-mcp/ads-mcp.module';
import { AdsActionsModule } from '../ads-actions/ads-actions.module';
import { RagKbModule } from '../rag-kb/rag-kb.module';

@Module({
  imports: [AdPerformanceModule, OpenAiModule, AdsMcpModule, AdsActionsModule, RagKbModule],
  controllers: [AiAdsManagerController],
  providers: [AiAdsManagerService],
})
export class AiAdsManagerModule {}
