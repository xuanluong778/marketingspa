import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingMailService } from './billing-mail.service';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { SubscriptionEntitlementInterceptor } from './subscription-entitlement.interceptor';

@Module({
  imports: [AffiliateModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingMailService,
    {
      provide: APP_INTERCEPTOR,
      useClass: SubscriptionEntitlementInterceptor,
    },
  ],
  exports: [BillingService, BillingMailService],
})
export class BillingModule {}
