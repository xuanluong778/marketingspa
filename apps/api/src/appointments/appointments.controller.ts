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
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
  AppointmentQueryDto,
  CalendarQueryDto,
} from './dto/appointment.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: AppointmentQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get('calendar')
  calendar(@CurrentUser() user: AuthUser, @Query() query: CalendarQueryDto) {
    return this.service.getCalendar(user.organizationId, query);
  }

  @Get('services')
  listServices(@CurrentUser() user: AuthUser) {
    return this.service.listServices(user.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.service.create(user.organizationId, dto, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.service.update(user.organizationId, id, dto, user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.service.updateStatus(user.organizationId, id, dto, user.id);
  }

  @Post(':id/remind')
  sendReminder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.sendReminder(user.organizationId, id, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}
