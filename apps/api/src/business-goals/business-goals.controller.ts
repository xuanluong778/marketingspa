import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessGoalsService } from './business-goals.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  BusinessGoalInputDto,
  BusinessGoalQueryDto,
  CreateBusinessGoalScenarioDto,
} from './dto/business-goal.dto';

@Controller('business-goals')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BusinessGoalsController {
  constructor(private readonly service: BusinessGoalsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: BusinessGoalQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Post('calculate')
  calculate(@Body() dto: BusinessGoalInputDto) {
    return this.service.calculate(dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBusinessGoalScenarioDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}
