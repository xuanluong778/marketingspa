import { Module } from '@nestjs/common';
import { ContentMarketingController } from './content-marketing.controller';
import { ContentMarketingService } from './content-marketing.service';

@Module({
  controllers: [ContentMarketingController],
  providers: [ContentMarketingService],
})
export class ContentMarketingModule {}
