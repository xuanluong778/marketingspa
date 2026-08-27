import { Module } from '@nestjs/common';
import { CustomersController, ContactsLegacyController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerOutboxService } from './customer-outbox.service';

@Module({
  controllers: [CustomersController, ContactsLegacyController],
  providers: [CustomersService, CustomerOutboxService],
  exports: [CustomersService, CustomerOutboxService],
})
export class CustomersModule {}
