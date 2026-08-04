import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAdminOpsService } from './platform-admin-ops.service';

@Module({
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformAdminOpsService],
})
export class PlatformAdminModule {}
