import { Module } from '@nestjs/common';
import { AdsActionController } from './ads-action.controller';
import { AdsActionService } from './ads-action.service';

@Module({
  controllers: [AdsActionController],
  providers: [AdsActionService],
  exports: [AdsActionService],
})
export class AdsActionsModule {}
