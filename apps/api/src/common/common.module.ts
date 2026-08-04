import { Global, Module } from '@nestjs/common';
import { TenantOwnershipService } from './services/tenant-ownership.service';
import { RateLimitService } from './services/rate-limit.service';
import { QueueEnqueueService } from './services/queue-enqueue.service';

@Global()
@Module({
  providers: [TenantOwnershipService, RateLimitService, QueueEnqueueService],
  exports: [TenantOwnershipService, RateLimitService, QueueEnqueueService],
})
export class CommonModule {}
