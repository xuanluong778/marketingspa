import { Module } from '@nestjs/common';
import { AutoPostModule } from '../../auto-post/auto-post.module';
import { FacebookAdsController } from './facebook-ads.controller';
import { FacebookAdsService } from './facebook-ads.service';
import { MetaGraphApiService } from './meta-graph-api.service';
import { AdConnectionFacade } from '../ad-connection.facade';
import { AdsNormalizedService } from '../ads-normalized.service';
import { AdsSyncQueueService } from '../ads-sync-queue.service';

@Module({
  imports: [AutoPostModule],
  controllers: [FacebookAdsController],
  providers: [
    FacebookAdsService,
    MetaGraphApiService,
    AdConnectionFacade,
    AdsNormalizedService,
    AdsSyncQueueService,
  ],
  exports: [
    FacebookAdsService,
    MetaGraphApiService,
    AdConnectionFacade,
    AdsNormalizedService,
    AdsSyncQueueService,
  ],
})
export class FacebookAdsModule {}
