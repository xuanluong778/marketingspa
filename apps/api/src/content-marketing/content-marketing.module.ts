import { Module } from '@nestjs/common';
import { ContentMarketingController } from './content-marketing.controller';
import { ContentMarketingService } from './content-marketing.service';
import { ContentIndustryService } from './content-industry.service';
import { OpinionVoiceProfileService } from './opinion-voice-profile.service';
import { TeleprompterSourceService } from './teleprompter-source.service';
import { AdUrlAnalyzeService } from './ad-url-analyze.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContentMarketingController],
  providers: [
    ContentMarketingService,
    ContentIndustryService,
    OpinionVoiceProfileService,
    TeleprompterSourceService,
    AdUrlAnalyzeService,
  ],
  exports: [ContentIndustryService, OpinionVoiceProfileService, TeleprompterSourceService],
})
export class ContentMarketingModule {}
