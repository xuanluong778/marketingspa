import { Module } from '@nestjs/common';
import { FacebookAdsController } from './facebook-ads.controller';
import { FacebookAdsService } from './facebook-ads.service';
import { MetaGraphApiService } from './meta-graph-api.service';
import { AdConnectionFacade } from '../ad-connection.facade';

@Module({
  controllers: [FacebookAdsController],
  providers: [FacebookAdsService, MetaGraphApiService, AdConnectionFacade],
  exports: [FacebookAdsService, MetaGraphApiService, AdConnectionFacade],
})
export class FacebookAdsModule {}
