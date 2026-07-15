import { Module } from '@nestjs/common';
import { AiAdsManagerController } from './ai-ads-manager.controller';
import { AiAdsManagerService } from './ai-ads-manager.service';
import { AdPerformanceModule } from '../ad-performance/ad-performance.module';
import { OpenAiModule } from '../openai/openai.module';

@Module({
  imports: [AdPerformanceModule, OpenAiModule],
  controllers: [AiAdsManagerController],
  providers: [AiAdsManagerService],
})
export class AiAdsManagerModule {}
