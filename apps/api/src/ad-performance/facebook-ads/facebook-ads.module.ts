import { Module } from '@nestjs/common';
import { FacebookAdsController } from './facebook-ads.controller';
import { FacebookAdsService } from './facebook-ads.service';
import { MetaGraphApiService } from './meta-graph-api.service';

@Module({
  controllers: [FacebookAdsController],
  providers: [FacebookAdsService, MetaGraphApiService],
  exports: [FacebookAdsService, MetaGraphApiService],
})
export class FacebookAdsModule {}
