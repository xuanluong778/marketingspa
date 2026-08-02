import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
// TenantGuard: tenant routes; PlatformAdminGuard: /admin/billing/*
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../common/decorators/skip-subscription.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { BillingService } from './billing.service';
import {
  ActivateTrialDto,
  AdminBillingTransactionsQueryDto,
  AdminManualReviewDto,
  AdminPaymentOrdersQueryDto,
  AdminReprocessTransactionDto,
  AdminUpdateTrialSettingsDto,
  CreatePaymentOrderDto,
} from './dto/billing.dto';
import { ClientIp } from '../common/decorators/client-ip.decorator';

@Controller()
@SkipSubscription()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public pricing table */
  @Get('billing/plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('billing/subscription')
  @UseGuards(JwtAuthGuard, TenantGuard)
  currentSubscription(@CurrentUser() user: AuthUser) {
    return this.billing.getCurrentSubscription(user.organizationId, {
      email: user.email,
      role: user.role,
    });
  }

  @Get('billing/trial/status')
  @UseGuards(JwtAuthGuard, TenantGuard)
  trialStatus(@CurrentUser() user: AuthUser) {
    return this.billing.getCurrentSubscription(user.organizationId, {
      email: user.email,
      role: user.role,
    });
  }

  /** User chủ động kích hoạt dùng thử 3 ngày */
  @Post('billing/trial/activate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, TenantGuard)
  activateTrial(
    @CurrentUser() user: AuthUser,
    @Body() dto: ActivateTrialDto,
    @ClientIp() ip?: string,
  ) {
    return this.billing.activateTrial(user, dto, { ip });
  }

  @Post('billing/orders')
  @UseGuards(JwtAuthGuard, TenantGuard)
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentOrderDto) {
    return this.billing.createOrder(user.organizationId, user.id, dto.planCode);
  }

  @Get('billing/orders')
  @UseGuards(JwtAuthGuard, TenantGuard)
  listOrders(@CurrentUser() user: AuthUser) {
    return this.billing.listMyOrders(user.organizationId);
  }

  @Get('billing/orders/:idOrCode')
  @UseGuards(JwtAuthGuard, TenantGuard)
  getOrder(@CurrentUser() user: AuthUser, @Param('idOrCode') idOrCode: string) {
    return this.billing.getOrder(user.organizationId, idOrCode);
  }

  @Post('billing/orders/:id/cancel')
  @UseGuards(JwtAuthGuard, TenantGuard)
  cancelOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billing.cancelOrder(user.organizationId, user.id, id);
  }

  /** SePay webhook — public, authenticated by API key / HMAC */
  @Post('payments/sepay/webhook')
  @HttpCode(200)
  sepayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
    return this.billing.handleSepayWebhook(raw, headers, body);
  }

  @Get('admin/billing/orders')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  adminOrders(@Query() query: AdminPaymentOrdersQueryDto) {
    return this.billing.adminListOrders(query);
  }

  @Get('admin/billing/transactions')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  adminTransactions(@Query() query: AdminBillingTransactionsQueryDto) {
    return this.billing.adminListTransactions(query);
  }

  @Post('admin/billing/transactions/:id/reprocess')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  adminReprocess(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminReprocessTransactionDto,
    @ClientIp() ip?: string,
  ) {
    return this.billing.adminReprocessTransaction(user, id, dto, ip);
  }

  @Get('admin/billing/subscriptions')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  adminSubscriptions(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.billing.adminListSubscriptions({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      organizationId: organizationId || undefined,
    });
  }

  @Post('admin/billing/orders/review')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  adminReview(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminManualReviewDto,
    @ClientIp() ip?: string,
  ) {
    return this.billing.adminMarkNeedsReview(
      user.id,
      user.organizationId,
      dto.orderId,
      dto.note,
      ip,
    );
  }

  @Get('admin/billing/trial-settings')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  adminGetTrialSettings() {
    return this.billing.getTrialSettings();
  }

  @Post('admin/billing/trial-settings')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  adminUpdateTrialSettings(@Body() dto: AdminUpdateTrialSettingsDto) {
    return this.billing.updateTrialSettings(dto);
  }
}
