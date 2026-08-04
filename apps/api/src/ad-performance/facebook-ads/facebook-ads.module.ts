import { Module } from '@nestjs/common';
import { FacebookAdsController } from './facebook-ads.controller';
import { FacebookAdsService } from './facebook-ads.service';
import { MetaGraphApiService } from './meta-graph-api.service';
import { AdConnectionFacade } from '../ad-connection.facade';
import { AdsSyncQueueService } from '../ads-sync-queue.service';

@Module({
  controllers: [FacebookAdsController],
  providers: [
    FacebookAdsService,
    MetaGraphApiService,
    AdConnectionFacade,
    AdsSyncQueueService,
  ],
  exports: [FacebookAdsService, MetaGraphApiService, AdConnectionFacade, AdsSyncQueueService],
})
export class FacebookAdsModule {}
