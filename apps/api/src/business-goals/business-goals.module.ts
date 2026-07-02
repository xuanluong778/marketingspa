import { Module } from '@nestjs/common';
import { BusinessGoalsController } from './business-goals.controller';
import { BusinessGoalsService } from './business-goals.service';

@Module({
  controllers: [BusinessGoalsController],
  providers: [BusinessGoalsService],
})
export class BusinessGoalsModule {}
