import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import { StocktakeService } from './stocktake.service';
import { SalesPaymentService } from './payment.service';
import { SalesReturnService } from './return.service';
import { SalesPurchaseService } from './purchase.service';
import { SalesReportsService } from './reports.service';

@Module({
  controllers: [SalesController],
  providers: [
    SalesService,
    InventoryService,
    StocktakeService,
    SalesPaymentService,
    SalesReturnService,
    SalesPurchaseService,
    SalesReportsService,
  ],
  exports: [
    SalesService,
    InventoryService,
    StocktakeService,
    SalesPaymentService,
    SalesReturnService,
    SalesPurchaseService,
    SalesReportsService,
  ],
})
export class SalesModule {}
