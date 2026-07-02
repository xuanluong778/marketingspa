import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateOrderDto,
  CreatePaymentDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  FinanceQueryDto,
  DashboardQueryDto,
} from './dto/finance.dto';

@Controller('finance')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.service.getDashboard(user.organizationId, query);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: AuthUser, @Query() query: FinanceQueryDto) {
    return this.service.listOrders(user.organizationId, query);
  }

  @Post('orders')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.service.createOrder(user.organizationId, dto);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: AuthUser, @Query() query: FinanceQueryDto) {
    return this.service.listPayments(user.organizationId, query);
  }

  @Post('payments')
  createPayment(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.service.createPayment(user.organizationId, dto);
  }

  @Get('expenses')
  listExpenses(@CurrentUser() user: AuthUser, @Query() query: FinanceQueryDto) {
    return this.service.listExpenses(user.organizationId, query);
  }

  @Post('expenses')
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.service.createExpense(user.organizationId, dto);
  }

  @Patch('expenses/:id')
  updateExpense(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.service.updateExpense(user.organizationId, id, dto);
  }

  @Delete('expenses/:id')
  removeExpense(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeExpense(user.organizationId, id);
  }
}
