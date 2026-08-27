import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FunnelLeadCaptureService } from './funnel-lead-capture.service';
import { SubmitFunnelPublicLeadDto } from './dto/funnel-capture.dto';
import { FunnelPublicCtaDto } from './dto/funnel-scoring.dto';
import { LeadScoringService } from '../crm/lead-scoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { FunnelCanvasRuntimeService } from '../crm/funnel-canvas-runtime.service';

/** Public lead form — no JWT. UUID of recommendation is the form token. */
@Controller('funnel-builder/public')
export class FunnelPublicController {
  constructor(
    private readonly capture: FunnelLeadCaptureService,
    private readonly scoring: LeadScoringService,
    private readonly prisma: PrismaService,
    private readonly canvasRuntime: FunnelCanvasRuntimeService,
  ) {}

  @Get(':id/form')
  getForm(@Param('id') id: string) {
    return this.capture.getPublicForm(id);
  }

  @Post(':id/lead')
  submitLead(@Param('id') id: string, @Body() dto: SubmitFunnelPublicLeadDto) {
    return this.capture.submitPublicLead(id, dto);
  }

  @Post(':id/cta')
  async trackCta(@Param('id') id: string, @Body() dto: FunnelPublicCtaDto) {
    const rec = await this.prisma.funnelRecommendation.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { id: true, organizationId: true, status: true },
    });
    if (!rec || !dto.leadId) return { ok: false, skipped: true };
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.leadId,
        organizationId: rec.organizationId,
        funnelRecommendationId: rec.id,
      },
      select: { id: true },
    });
    if (!lead) return { ok: false, skipped: true };
    await this.scoring.applyEvent({
      organizationId: rec.organizationId,
      leadId: lead.id,
      eventType: 'CTA_CLICK',
      source: dto.ctaKey ?? 'public_cta',
    });
    void this.canvasRuntime.advance({
      organizationId: rec.organizationId,
      leadId: lead.id,
      event: 'CTA_CLICK',
      funnelId: rec.id,
    });
    return { ok: true };
  }
}
