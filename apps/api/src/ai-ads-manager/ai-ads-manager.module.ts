import { Module } from '@nestjs/common';
import { AiAdsManagerController } from './ai-ads-manager.controller';
import { AiAdsManagerService } from './ai-ads-manager.service';
import { AdPerformanceModule } from '../ad-performance/ad-performance.module';
import { OpenAiModule } from '../openai/openai.module';
import { AdsMcpModule } from '../ads-mcp/ads-mcp.module';
import { AdsActionsModule } from '../ads-actions/ads-actions.module';

@Module({
  imports: [AdPerformanceModule, OpenAiModule, AdsMcpModule, AdsActionsModule],
  controllers: [AiAdsManagerController],
  providers: [AiAdsManagerService],
  exports: [AiAdsManagerService],
})
export class AiAdsManagerModule {}
