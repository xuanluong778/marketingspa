import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { EventsModule } from '../events/events.module';
import { AttributionModule } from '../attribution/attribution.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [EventsModule, AttributionModule, CrmModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
