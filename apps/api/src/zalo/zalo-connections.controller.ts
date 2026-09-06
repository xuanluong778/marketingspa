import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ZaloConnectionsService } from './zalo-connections.service';
import { CreateZaloConnectionDto, SendZaloMessageDto } from './dto/zalo-connection.dto';

@Controller('zalo/connections')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ZaloConnectionsController {
  constructor(private readonly service: ZaloConnectionsService) {}

  @Get()
  @RequirePermissions('automation.view')
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId);
  }

  @Post()
  @RequirePermissions('automation.integration.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateZaloConnectionDto) {
    return this.service.create(user.organizationId, dto, user.id);
  }

  @Post(':id/test')
  @RequirePermissions('automation.integration.manage')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.test(user.organizationId, id, user.id);
  }

  @Post(':id/refresh-token')
  @RequirePermissions('automation.integration.manage')
  refreshToken(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.refreshToken(user.organizationId, id, user.id);
  }

  @Post(':id/messages')
  @RequirePermissions('automation.integration.manage')
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendZaloMessageDto,
  ) {
    return this.service.sendMessage(user.organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('automation.integration.manage')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id, user.id);
  }
}
