import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard, TenantGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get('current')
  getCurrent(@CurrentUser() user: AuthUser) {
    return this.service.getCurrent(user.organizationId);
  }

  @Patch('current')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateOrganizationDto) {
    return this.service.update(user.organizationId, dto);
  }

  @Get('branches')
  listBranches(@CurrentUser() user: AuthUser) {
    return this.service.listBranches(user.organizationId);
  }

  @Post('branches')
  createBranch(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    return this.service.createBranch(user.organizationId, dto);
  }

  @Patch('branches/:id')
  updateBranch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.service.updateBranch(user.organizationId, id, dto);
  }

  @Delete('branches/:id')
  deleteBranch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteBranch(user.organizationId, id);
  }
}
