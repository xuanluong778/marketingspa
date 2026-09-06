import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SalesStockMovementType } from '@marketingspa/database';
import type { Response } from 'express';
import { SalesService } from './sales.service';
import { InventoryService } from './inventory.service';
import { StocktakeService } from './stocktake.service';
import { SalesPaymentService } from './payment.service';
import { SalesReturnService } from './return.service';
import { SalesPurchaseService } from './purchase.service';
import { SalesReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { SALES_PERMISSIONS } from './sales.rbac';
import {
  CreateCategoryDto,
  CreatePurchaseOrderDto,
  CreateSalesOrderDto,
  CreateSalesProductDto,
  CreateSalesReturnDto,
  CreateStocktakeDto,
  CreateSupplierDto,
  ProductLookupDto,
  PurchaseOrderQueryDto,
  ReceivePurchaseOrderDto,
  RecordSalesPaymentDto,
  ReconcileQueryDto,
  SalesOrderQueryDto,
  SalesProductQueryDto,
  SalesReportQueryDto,
  StockAdjustDto,
  StockBatchQueryDto,
  StockInboundDto,
  StockMovementQueryDto,
  StockOutboundDto,
  StocktakeQueryDto,
  SupplierQueryDto,
  UpdateSalesOrderDto,
  UpdateSalesOrderStatusDto,
  UpdateSalesProductDto,
  UpdateStocktakeLinesDto,
} from './dto/sales.dto';

@Controller('sales')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class SalesController {
  constructor(
    private readonly service: SalesService,
    private readonly inventory: InventoryService,
    private readonly stocktake: StocktakeService,
    private readonly payments: SalesPaymentService,
    private readonly returns: SalesReturnService,
    private readonly purchase: SalesPurchaseService,
    private readonly reports: SalesReportsService,
  ) {}

  @Get('reports/summary')
  @RequirePermissions(SALES_PERMISSIONS.read)
  reportSummary(@CurrentUser() user: AuthUser, @Query() query: SalesReportQueryDto) {
    return this.reports.summary(user.organizationId, query);
  }

  @Get('reports/export.csv')
  @RequirePermissions(SALES_PERMISSIONS.read)
  async reportCsv(
    @CurrentUser() user: AuthUser,
    @Query() query: SalesReportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reports.exportCsv(user.organizationId, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  }

  @Get('orders')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listOrders(@CurrentUser() user: AuthUser, @Query() query: SalesOrderQueryDto) {
    return this.service.listOrders(user.organizationId, query);
  }

  @Get('orders/:id')
  @RequirePermissions(SALES_PERMISSIONS.read)
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getOrder(user.organizationId, id);
  }

  @Post('orders')
  @RequirePermissions(SALES_PERMISSIONS.write)
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesOrderDto) {
    return this.service.createOrder(user.organizationId, dto, user.id);
  }

  @Patch('orders/:id')
  @RequirePermissions(SALES_PERMISSIONS.write)
  updateOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderDto,
  ) {
    return this.service.updateOrder(user.organizationId, id, dto, user.id);
  }

  @Post('orders/:id/status')
  @RequirePermissions(SALES_PERMISSIONS.write)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderStatusDto,
  ) {
    return this.service.updateStatus(user.organizationId, id, dto.status, user.id);
  }

  @Post('orders/:id/export')
  @RequirePermissions(SALES_PERMISSIONS.write)
  exportOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.exportOrder(user.organizationId, id, user.id);
  }

  @Get('orders/:id/payments')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listPayments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.list(user.organizationId, id);
  }

  @Post('orders/:id/payments')
  @RequirePermissions(SALES_PERMISSIONS.write)
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordSalesPaymentDto,
  ) {
    return this.payments.addPayment(user.organizationId, id, dto, user.id);
  }

  @Post('orders/:id/refunds')
  @RequirePermissions(SALES_PERMISSIONS.write)
  addRefund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordSalesPaymentDto,
  ) {
    return this.payments.addRefund(user.organizationId, id, dto, user.id);
  }

  @Post('returns')
  @RequirePermissions(SALES_PERMISSIONS.write)
  createReturn(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesReturnDto) {
    return this.returns.createAndConfirm(user.organizationId, dto, user.id);
  }

  @Get('returns')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listReturns(@CurrentUser() user: AuthUser, @Query('orderId') orderId?: string) {
    return this.returns.list(user.organizationId, orderId);
  }

  @Get('returns/:id')
  @RequirePermissions(SALES_PERMISSIONS.read)
  getReturn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.returns.get(user.organizationId, id);
  }

  @Get('products/lookup')
  @RequirePermissions(SALES_PERMISSIONS.read)
  lookupProduct(@CurrentUser() user: AuthUser, @Query() query: ProductLookupDto) {
    return this.inventory.lookupProduct(user.organizationId, query.q);
  }

  @Get('products')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listProducts(@CurrentUser() user: AuthUser, @Query() query: SalesProductQueryDto) {
    return this.service.listProducts(user.organizationId, query);
  }

  @Post('products')
  @RequirePermissions(SALES_PERMISSIONS.write)
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesProductDto) {
    return this.service.createProduct(user.organizationId, dto, user.id);
  }

  @Patch('products/:id')
  @RequirePermissions(SALES_PERMISSIONS.write)
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalesProductDto,
  ) {
    return this.service.updateProduct(user.organizationId, id, dto, user.id);
  }

  @Get('categories')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listCategories(@CurrentUser() user: AuthUser) {
    return this.service.listCategories(user.organizationId);
  }

  @Post('categories')
  @RequirePermissions(SALES_PERMISSIONS.write)
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.service.createCategory(user.organizationId, dto.name);
  }

  @Get('suppliers')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listSuppliers(@CurrentUser() user: AuthUser, @Query() query: SupplierQueryDto) {
    return this.purchase.listSuppliers(user.organizationId, query);
  }

  @Post('suppliers')
  @RequirePermissions(SALES_PERMISSIONS.write)
  createSupplier(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.purchase.createSupplier(user.organizationId, dto, user.id);
  }

  @Get('purchase-orders')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listPos(@CurrentUser() user: AuthUser, @Query() query: PurchaseOrderQueryDto) {
    return this.purchase.listPurchaseOrders(user.organizationId, query);
  }

  @Get('purchase-orders/:id')
  @RequirePermissions(SALES_PERMISSIONS.read)
  getPo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchase.getPurchaseOrder(user.organizationId, id);
  }

  @Post('purchase-orders')
  @RequirePermissions(SALES_PERMISSIONS.write)
  createPo(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchase.createPurchaseOrder(user.organizationId, dto, user.id);
  }

  @Post('purchase-orders/:id/receive')
  @RequirePermissions(SALES_PERMISSIONS.write)
  receivePo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchase.receiveGoods(user.organizationId, id, dto, user.id);
  }

  @Get('stock/batches')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listBatches(@CurrentUser() user: AuthUser, @Query() query: StockBatchQueryDto) {
    return this.inventory.listBatches(user.organizationId, query);
  }

  @Get('stock/movements')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listMovements(@CurrentUser() user: AuthUser, @Query() query: StockMovementQueryDto) {
    return this.inventory.listMovements(user.organizationId, {
      ...query,
      type: query.type as SalesStockMovementType | undefined,
    });
  }

  @Get('stock/alerts')
  @RequirePermissions(SALES_PERMISSIONS.read)
  alerts(@CurrentUser() user: AuthUser) {
    return this.inventory.getAlerts(user.organizationId);
  }

  @Get('stock/reconcile')
  @RequirePermissions(SALES_PERMISSIONS.read)
  reconcile(@CurrentUser() user: AuthUser, @Query() _query: ReconcileQueryDto) {
    return this.inventory.reconcile(user.organizationId, { fix: false });
  }

  @Post('stock/reconcile/fix')
  @RequirePermissions(SALES_PERMISSIONS.write)
  reconcileFix(@CurrentUser() user: AuthUser) {
    return this.inventory.reconcile(user.organizationId, {
      fix: true,
      performedById: user.id,
    });
  }

  @Post('stock/inbound')
  @RequirePermissions(SALES_PERMISSIONS.write)
  inbound(@CurrentUser() user: AuthUser, @Body() dto: StockInboundDto) {
    return this.inventory.inbound(user.organizationId, dto, user.id);
  }

  @Post('stock/outbound')
  @RequirePermissions(SALES_PERMISSIONS.write)
  outbound(@CurrentUser() user: AuthUser, @Body() dto: StockOutboundDto) {
    return this.inventory.outbound(user.organizationId, dto, user.id);
  }

  @Post('stock/adjust')
  @RequirePermissions(SALES_PERMISSIONS.write)
  adjust(@CurrentUser() user: AuthUser, @Body() dto: StockAdjustDto) {
    return this.inventory.adjust(user.organizationId, dto, user.id);
  }

  @Get('stocktakes')
  @RequirePermissions(SALES_PERMISSIONS.read)
  listStocktakes(@CurrentUser() user: AuthUser, @Query() query: StocktakeQueryDto) {
    return this.stocktake.list(user.organizationId, query);
  }

  @Get('stocktakes/:id')
  @RequirePermissions(SALES_PERMISSIONS.read)
  getStocktake(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stocktake.get(user.organizationId, id);
  }

  @Post('stocktakes')
  @RequirePermissions(SALES_PERMISSIONS.write)
  createStocktake(@CurrentUser() user: AuthUser, @Body() dto: CreateStocktakeDto) {
    return this.stocktake.create(user.organizationId, dto, user.id);
  }

  @Patch('stocktakes/:id/lines')
  @RequirePermissions(SALES_PERMISSIONS.write)
  updateStocktakeLines(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStocktakeLinesDto,
  ) {
    return this.stocktake.updateLines(user.organizationId, id, dto.lines, user.id);
  }

  @Post('stocktakes/:id/confirm')
  @RequirePermissions(SALES_PERMISSIONS.write)
  confirmStocktake(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stocktake.confirm(user.organizationId, id, user.id);
  }

  @Post('stocktakes/:id/cancel')
  @RequirePermissions(SALES_PERMISSIONS.write)
  cancelStocktake(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stocktake.cancel(user.organizationId, id, user.id);
  }
}
