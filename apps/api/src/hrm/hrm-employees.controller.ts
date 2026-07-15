import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmContractsService } from './hrm-contracts.service';
import { HrmDocumentsService } from './hrm-documents.service';
import {
  CreateHrmEmployeeDto,
  HrmEmployeeQueryDto,
  UpdateHrmEmployeeDto,
} from './dto/employee.dto';
import { CreateEmployeeAccountDto, ResetEmployeePasswordDto } from './dto/account.dto';
import { CreateEmploymentContractDto } from './dto/contract.dto';
import {
  CreateEmployeeDocumentDto,
  UploadEmployeeDocumentMetaDto,
} from './dto/document.dto';

@Controller('hrm/employees')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class HrmEmployeesController {
  constructor(
    private readonly employees: HrmEmployeesService,
    private readonly contracts: HrmContractsService,
    private readonly documents: HrmDocumentsService,
  ) {}

  @Get()
  @RequirePermissions('hrm.employee.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: HrmEmployeeQueryDto) {
    return this.employees.findAll(user.organizationId, query);
  }

  @Post()
  @RequirePermissions('hrm.employee.write')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHrmEmployeeDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.employees.create(user.organizationId, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions('hrm.employee.write')
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ClientIp() ipAddress?: string,
  ) {
    return this.employees.deactivate(user.organizationId, id, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post(':id/account')
  @RequirePermissions('hrm.account.manage')
  createAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeAccountDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.employees.createAccount(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post(':id/account/reset-password')
  @RequirePermissions('hrm.account.manage')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetEmployeePasswordDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.employees.resetPassword(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Get(':id/contracts')
  @RequirePermissions('hrm.contract.read')
  listContracts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contracts.listByEmployee(user.organizationId, id);
  }

  @Post(':id/contracts')
  @RequirePermissions('hrm.contract.write')
  createContract(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateEmploymentContractDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.contracts.create(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Get(':id/documents')
  @RequirePermissions('hrm.document.read')
  listDocuments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.listByEmployee(user.organizationId, id);
  }

  @Post(':id/documents/upload')
  @RequirePermissions('hrm.document.write')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile()
    file: {
      originalname?: string;
      mimetype?: string;
      size?: number;
      buffer?: Buffer;
      path?: string;
    },
    @Body() meta: UploadEmployeeDocumentMetaDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.documents.upload(user.organizationId, id, file, meta, {
      userId: user.id,
      ipAddress,
    });
  }

  @Post(':id/documents')
  @RequirePermissions('hrm.document.write')
  createDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeDocumentDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.documents.create(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Patch(':id')
  @RequirePermissions('hrm.employee.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateHrmEmployeeDto,
    @ClientIp() ipAddress?: string,
  ) {
    return this.employees.update(user.organizationId, id, dto, {
      userId: user.id,
      ipAddress,
    });
  }

  @Get(':id')
  @RequirePermissions('hrm.employee.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.employees.findOne(user.organizationId, id);
  }
}
