import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { AttributionModule } from '../attribution/attribution.module';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AttributionModule, CrmModule, EventsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
