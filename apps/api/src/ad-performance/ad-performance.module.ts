import { Module } from '@nestjs/common';
import { FacebookAdsModule } from './facebook-ads/facebook-ads.module';
import { GoogleAdsModule } from './google-ads/google-ads.module';

/** Ad-performance: AdConnection, Meta/Google sync, normalized metrics */
@Module({
  imports: [FacebookAdsModule, GoogleAdsModule],
  exports: [FacebookAdsModule, GoogleAdsModule],
})
export class AdPerformanceModule {}
