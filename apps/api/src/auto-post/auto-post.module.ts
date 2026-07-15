import { Module } from '@nestjs/common';
import { AutoPostController } from './auto-post.controller';
import { AutoPostService } from './auto-post.service';
import { AutoPostFacebookService } from './auto-post-facebook.service';
import { AutoPostMetaService } from './auto-post-meta.service';
import { MetaFanpageModule } from '../meta-fanpage/meta-fanpage.module';

@Module({
  imports: [MetaFanpageModule],
  controllers: [AutoPostController],
  providers: [AutoPostService, AutoPostFacebookService, AutoPostMetaService],
  exports: [AutoPostService],
})
export class AutoPostModule {}
