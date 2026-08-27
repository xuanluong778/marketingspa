import { Global, Module } from '@nestjs/common';
import { TenantOwnershipService } from './services/tenant-ownership.service';
import { RateLimitService } from './services/rate-limit.service';
import { QueueEnqueueService } from './services/queue-enqueue.service';
import { TenantKpiCacheService } from './services/tenant-kpi-cache.service';

@Global()
@Module({
  providers: [TenantOwnershipService, RateLimitService, QueueEnqueueService, TenantKpiCacheService],
  exports: [TenantOwnershipService, RateLimitService, QueueEnqueueService, TenantKpiCacheService],
})
export class CommonModule {}
