import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAdminOpsService } from './platform-admin-ops.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformAdminOpsService],
})
export class PlatformAdminModule {}
