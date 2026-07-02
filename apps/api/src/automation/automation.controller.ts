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
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
  CreateAutomationFlowDto,
  UpdateAutomationFlowDto,
  SimulateAutomationDto,
  TemplateQueryDto,
  LogQueryDto,
} from './dto/automation.dto';

@Controller('automation')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AutomationController {
  constructor(private readonly service: AutomationService) {}

  @Get('variables')
  listVariables() {
    return this.service.getVariableCatalog();
  }

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthUser, @Query() query: TemplateQueryDto) {
    return this.service.listTemplates(user.organizationId, query);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateMessageTemplateDto) {
    return this.service.createTemplate(user.organizationId, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMessageTemplateDto,
  ) {
    return this.service.updateTemplate(user.organizationId, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteTemplate(user.organizationId, id);
  }

  @Get('flows')
  listFlows(@CurrentUser() user: AuthUser) {
    return this.service.listFlows(user.organizationId);
  }

  @Post('flows')
  createFlow(@CurrentUser() user: AuthUser, @Body() dto: CreateAutomationFlowDto) {
    return this.service.createFlow(user.organizationId, dto);
  }

  @Patch('flows/:id')
  updateFlow(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationFlowDto,
  ) {
    return this.service.updateFlow(user.organizationId, id, dto);
  }

  @Delete('flows/:id')
  deleteFlow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteFlow(user.organizationId, id);
  }

  @Post('flows/:id/simulate')
  simulate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SimulateAutomationDto,
  ) {
    return this.service.simulate(user.organizationId, id, dto);
  }

  @Get('logs')
  listLogs(@CurrentUser() user: AuthUser, @Query() query: LogQueryDto) {
    return this.service.listLogs(user.organizationId, query);
  }
}
