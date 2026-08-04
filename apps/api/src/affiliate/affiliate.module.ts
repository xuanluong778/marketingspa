import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { AffiliateAdminController } from './affiliate-admin.controller';
import { AffiliateService } from './affiliate.service';
import { AffiliateAdminService } from './affiliate-admin.service';

@Module({
  controllers: [AffiliateController, AffiliateAdminController],
  providers: [AffiliateService, AffiliateAdminService],
  exports: [AffiliateService],
})
export class AffiliateModule {}
