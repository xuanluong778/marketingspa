import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { EventsModule } from '../events/events.module';
import { AttributionModule } from '../attribution/attribution.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [EventsModule, AttributionModule, CrmModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
