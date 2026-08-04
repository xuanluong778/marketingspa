import { Body, Controller, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { MessagingEligibilityService } from './messaging-eligibility.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CheckMessagingEligibilityDto } from './dto/eligibility.dto';

@Controller('automation/eligibility')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class MessagingEligibilityController {
  constructor(private readonly eligibility: MessagingEligibilityService) {}

  @Post('check')
  @RequirePermissions('automation.campaign.send')
  check(@CurrentUser() user: AuthUser, @Body() dto: CheckMessagingEligibilityDto) {
    if (!dto.channel) throw new BadRequestException('Thiếu channel');
    if (!dto.campaignType) throw new BadRequestException('Thiếu campaignType');
    return this.eligibility.check({
      organizationId: user.organizationId,
      channel: dto.channel,
      campaignType: dto.campaignType,
      identityId: dto.identityId,
      externalUserId: dto.externalUserId,
      connectionId: dto.connectionId,
      accountRef: dto.accountRef,
      templateId: dto.templateId,
      flowId: dto.flowId,
      leadId: dto.leadId,
      customerId: dto.customerId,
      providerModeHint: dto.providerModeHint,
    });
  }
}
