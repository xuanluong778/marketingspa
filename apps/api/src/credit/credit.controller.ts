import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../common/decorators/skip-subscription.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreditService } from './credit.service';
import { CreditHistoryQueryDto } from './dto/credit.dto';

@Controller('credits')
@UseGuards(JwtAuthGuard, TenantGuard)
@SkipSubscription()
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  @Get('balance')
  balance(@CurrentUser() user: AuthUser) {
    return this.credit.getBalance(user.organizationId);
  }

  @Get('packages')
  packages() {
    return this.credit.listPackages();
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query() query: CreditHistoryQueryDto) {
    return this.credit.listHistory(user.organizationId, {
      page: query.page,
      pageSize: query.pageSize,
      includeInternal: false,
    });
  }
}
