import { Module } from '@nestjs/common';
import { CustomersController, ContactsLegacyController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController, ContactsLegacyController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
