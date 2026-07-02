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
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateCustomerDto, UpdateCustomerDto, CustomerQueryDto } from './dto/customer.dto';
import { CreateCustomerNoteDto } from './dto/customer-note.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: CustomerQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get(':id/history')
  getHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getHistory(user.organizationId, id);
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateCustomerNoteDto,
  ) {
    return this.service.addNote(user.organizationId, id, user.id, dto.content);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.service.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.service.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}

/** Alias /contacts cho backward compatibility */
@Controller('contacts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ContactsLegacyController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAllLegacy(user.organizationId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.service.create(user.organizationId, dto);
  }
}
