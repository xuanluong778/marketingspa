import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController, ReadyController } from './health.controller';
import { HealthService } from './health.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Module({
  controllers: [HealthController, ReadyController],
  providers: [
    HealthService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [HealthService],
})
export class HealthModule {}
