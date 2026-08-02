import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChannelConnectionsService } from './channel-connections.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ConnectMessengerChannelDto,
  ConnectZaloChannelDto,
  ConnectZbsChannelDto,
  PauseChannelDto,
  ReconnectChannelDto,
} from './dto/channel-connection.dto';

@Controller('automation/channel-connections')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ChannelConnectionsController {
  constructor(private readonly service: ChannelConnectionsService) {}

  @Get()
  @RequirePermissions('automation.view')
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId);
  }

  @Post('messenger')
  @RequirePermissions('automation.integration.manage')
  connectMessenger(@CurrentUser() user: AuthUser, @Body() dto: ConnectMessengerChannelDto) {
    return this.service.connectMessenger(user.organizationId, dto, user.id);
  }

  @Post('zalo')
  @RequirePermissions('automation.integration.manage')
  connectZalo(@CurrentUser() user: AuthUser, @Body() dto: ConnectZaloChannelDto) {
    return this.service.connectZaloOa(user.organizationId, dto, user.id);
  }

  @Post('zbs')
  @RequirePermissions('automation.integration.manage')
  connectZbs(@CurrentUser() user: AuthUser, @Body() dto: ConnectZbsChannelDto) {
    return this.service.connectZbs(user.organizationId, dto, user.id);
  }

  @Post(':id/test')
  @RequirePermissions('automation.integration.manage')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.test(user.organizationId, id, user.id);
  }

  @Post(':id/reconnect')
  @RequirePermissions('automation.integration.manage')
  reconnect(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReconnectChannelDto,
  ) {
    return this.service.reconnect(user.organizationId, id, dto, user.id);
  }

  @Patch(':id/pause')
  @RequirePermissions('automation.integration.manage')
  pause(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PauseChannelDto,
  ) {
    return this.service.setPaused(user.organizationId, id, dto.isPaused ?? true, user.id);
  }

  @Delete(':id')
  @RequirePermissions('automation.integration.manage')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id, user.id);
  }
}
