import { Module, forwardRef } from '@nestjs/common';
import { MessagingIdentityController } from './messaging-identity.controller';
import { MessagingIdentityService } from './messaging-identity.service';
import { AuditModule } from '../audit/audit.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [AuditModule, forwardRef(() => MessagingModule)],
  controllers: [MessagingIdentityController],
  providers: [MessagingIdentityService],
  exports: [MessagingIdentityService],
})
export class MessagingIdentityModule {}
