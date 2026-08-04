import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagingIdentityService } from './messaging-identity.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  LinkIdentityDto,
  MergeIdentitiesDto,
  MessagingIdentityQueryDto,
  UpsertMessagingIdentityDto,
} from './dto/messaging-identity.dto';

@Controller('messaging-identities')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class MessagingIdentityController {
  constructor(private readonly service: MessagingIdentityService) {}

  @Get()
  @RequirePermissions('automation.view')
  list(@CurrentUser() user: AuthUser, @Query() query: MessagingIdentityQueryDto) {
    return this.service.list(user.organizationId, query);
  }

  @Get('merge-logs')
  @RequirePermissions('automation.view')
  listMergeLogs(
    @CurrentUser() user: AuthUser,
    @Query('primaryIdentityId') primaryIdentityId?: string,
  ) {
    return this.service.listMergeLogs(user.organizationId, primaryIdentityId);
  }

  @Get(':id')
  @RequirePermissions('automation.view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Get(':id/suggest-links')
  @RequirePermissions('automation.view')
  suggestLinks(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.suggestLinks(user.organizationId, id);
  }

  @Post('upsert')
  @RequirePermissions('automation.integration.manage')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertMessagingIdentityDto) {
    return this.service.upsert(user.organizationId, dto, user.id);
  }

  @Patch(':id/link')
  @RequirePermissions('automation.integration.manage')
  linkManual(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LinkIdentityDto,
  ) {
    return this.service.linkManual(user.organizationId, id, dto, user.id);
  }

  @Post(':id/link-verified-phone')
  @RequirePermissions('automation.integration.manage')
  linkByVerifiedPhone(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.linkByVerifiedPhone(user.organizationId, id, user.id);
  }

  @Post('merge')
  @RequirePermissions('automation.integration.manage')
  merge(@CurrentUser() user: AuthUser, @Body() dto: MergeIdentitiesDto) {
    return this.service.mergeIdentities(user.organizationId, dto, user.id);
  }

  @Post('merge-logs/:logId/undo')
  @RequirePermissions('automation.integration.manage')
  undoMerge(@CurrentUser() user: AuthUser, @Param('logId') logId: string) {
    return this.service.undoMerge(user.organizationId, logId, user.id);
  }
}
