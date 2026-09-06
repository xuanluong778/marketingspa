import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkManagementController } from './work-management.controller';
import { WorkManagementService } from './work-management.service';
import { WorkCollabService } from './work-collab.service';
import { WorkInsightsService } from './work-insights.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [WorkManagementController],
  providers: [WorkManagementService, WorkCollabService, WorkInsightsService],
  exports: [WorkManagementService, WorkCollabService, WorkInsightsService],
})
export class WorkManagementModule {}
