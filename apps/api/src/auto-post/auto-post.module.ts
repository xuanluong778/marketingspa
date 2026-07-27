import { Module } from '@nestjs/common';
import { AutoPostController } from './auto-post.controller';
import { AutoPostService } from './auto-post.service';
import { AutoPostFacebookService } from './auto-post-facebook.service';
import { AutoPostMetaService } from './auto-post-meta.service';
import { AutoPostMetaComplianceService } from './auto-post-meta-compliance.service';
import { MetaFanpageModule } from '../meta-fanpage/meta-fanpage.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MetaFanpageModule, MessagingModule],
  controllers: [AutoPostController],
  providers: [
    AutoPostService,
    AutoPostFacebookService,
    AutoPostMetaService,
    AutoPostMetaComplianceService,
  ],
  exports: [AutoPostService, AutoPostFacebookService, AutoPostMetaComplianceService],
})
export class AutoPostModule {}
