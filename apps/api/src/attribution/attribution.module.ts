import { Module } from '@nestjs/common';
import { AttributionController } from './attribution.controller';
import { AttributionService } from './attribution.service';
import { AttributionDashboardService } from './attribution-dashboard.service';
import { OfflineConversionService } from './offline-conversion.service';
import { AttributionHooksService } from './attribution-hooks.service';

@Module({
  controllers: [AttributionController],
  providers: [
    AttributionService,
    AttributionDashboardService,
    OfflineConversionService,
    AttributionHooksService,
  ],
  exports: [AttributionService, AttributionHooksService, OfflineConversionService, AttributionDashboardService],
})
export class AttributionModule {}
