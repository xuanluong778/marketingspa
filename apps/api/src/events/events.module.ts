import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { RealtimeBridgeService } from './realtime-bridge.service';

@Module({
  providers: [EventsGateway, RealtimeBridgeService],
  exports: [EventsGateway],
})
export class EventsModule {}
