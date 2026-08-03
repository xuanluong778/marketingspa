import { Module } from '@nestjs/common';
import { GoogleAdsController } from './google-ads.controller';
import { GoogleAdsService } from './google-ads.service';
import { GoogleAdsApiService } from './google-ads-api.service';
import { AdConnectionFacade } from '../ad-connection.facade';
import { AdsNormalizedService } from '../ads-normalized.service';
import { AdsSyncQueueService } from '../ads-sync-queue.service';

@Module({
  controllers: [GoogleAdsController],
  providers: [
    GoogleAdsService,
    GoogleAdsApiService,
    AdConnectionFacade,
    AdsNormalizedService,
    AdsSyncQueueService,
  ],
  exports: [
    GoogleAdsService,
    GoogleAdsApiService,
    AdConnectionFacade,
    AdsNormalizedService,
    AdsSyncQueueService,
  ],
})
export class GoogleAdsModule {}
