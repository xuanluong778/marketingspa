import { Module } from '@nestjs/common';
import { ContentMarketingController } from './content-marketing.controller';
import { ContentMarketingService } from './content-marketing.service';
import { ContentIndustryService } from './content-industry.service';
import { OpinionVoiceProfileService } from './opinion-voice-profile.service';
import { TeleprompterSourceService } from './teleprompter-source.service';
import { TeleprompterRecordingService } from './teleprompter-recording.service';
import { TeleprompterSignedDownloadController } from './teleprompter-signed-download.controller';
import { AdUrlAnalyzeService } from './ad-url-analyze.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RagKbModule } from '../rag-kb/rag-kb.module';

@Module({
  imports: [PrismaModule, RagKbModule],
  controllers: [ContentMarketingController, TeleprompterSignedDownloadController],
  providers: [
    ContentMarketingService,
    ContentIndustryService,
    OpinionVoiceProfileService,
    TeleprompterSourceService,
    TeleprompterRecordingService,
    AdUrlAnalyzeService,
  ],
  exports: [
    ContentIndustryService,
    OpinionVoiceProfileService,
    TeleprompterSourceService,
    TeleprompterRecordingService,
  ],
})
export class ContentMarketingModule {}
