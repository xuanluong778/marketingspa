import { Module } from '@nestjs/common';
import { FacebookAdsModule } from './facebook-ads/facebook-ads.module';

@Module({
  imports: [FacebookAdsModule],
  exports: [FacebookAdsModule],
})
export class AdPerformanceModule {}
