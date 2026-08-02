import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AttributionDashboardService } from './attribution-dashboard.service';
import { AttributionService } from './attribution.service';
import { OfflineConversionService } from './offline-conversion.service';
import {
  AttributionDashboardQueryDto,
  AttributionInputDto,
} from './dto/attribution.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@Controller('attribution')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AttributionController {
  constructor(
    private readonly dashboard: AttributionDashboardService,
    private readonly attribution: AttributionService,
    private readonly offline: OfflineConversionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthUser, @Query() query: AttributionDashboardQueryDto) {
    return this.dashboard.getDashboard(user.organizationId, query);
  }

  @Get('leads/:leadId')
  async getLeadAttribution(@CurrentUser() user: AuthUser, @Param('leadId') leadId: string) {
    const row = await this.prisma.leadAttribution.findFirst({
      where: { organizationId: user.organizationId, leadId },
      include: {
        adCampaign: true,
        adSet: true,
        ad: true,
        lead: { select: { id: true, name: true, phone: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy attribution');
    return row;
  }

  @Post('leads/:leadId')
  async upsert(
    @CurrentUser() user: AuthUser,
    @Param('leadId') leadId: string,
    @Body() dto: AttributionInputDto,
  ) {
    return this.attribution.upsertLeadAttribution(user.organizationId, leadId, dto);
  }

  @Get('offline-jobs')
  listOfflineJobs(@CurrentUser() user: AuthUser) {
    return this.prisma.offlineConversionJob.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('offline-jobs/:id/retry')
  async retryOfflineJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const job = await this.prisma.offlineConversionJob.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!job) throw new NotFoundException('Job không tồn tại');
    await this.offline.enqueuePendingJobs(user.organizationId, [job.id]);
    return { message: 'Đã xếp hàng retry', jobId: job.id };
  }
}
