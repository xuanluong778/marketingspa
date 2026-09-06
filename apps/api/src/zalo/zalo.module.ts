import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { ZaloConnectionsController } from './zalo-connections.controller';
import { ZaloConnectionsService } from './zalo-connections.service';
import { ZaloHealthController } from './zalo-health.controller';

@Module({
  imports: [MessagingModule],
  controllers: [ZaloConnectionsController, ZaloHealthController],
  providers: [ZaloConnectionsService],
  exports: [ZaloConnectionsService],
})
export class ZaloModule {}
