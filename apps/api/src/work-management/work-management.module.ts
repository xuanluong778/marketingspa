import { Module } from '@nestjs/common';
import { WorkManagementController } from './work-management.controller';
import { WorkManagementService } from './work-management.service';
import { WorkCollabService } from './work-collab.service';

@Module({
  controllers: [WorkManagementController],
  providers: [WorkManagementService, WorkCollabService],
  exports: [WorkManagementService, WorkCollabService],
})
export class WorkManagementModule {}
