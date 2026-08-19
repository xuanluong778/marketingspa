import { Module } from '@nestjs/common';
import { FunnelBuilderController } from './funnel-builder.controller';
import { FunnelPublicController } from './funnel-public.controller';
import { FunnelBuilderService } from './funnel-builder.service';
import { FunnelTemplateService } from './funnel-template.service';
import { FunnelGeneratorService } from './funnel-generator.service';
import { FunnelLeadCaptureService } from './funnel-lead-capture.service';
import { FunnelValidatorService } from './funnel-validator.service';
import { FunnelConsultantService } from './funnel-consultant.service';
import { FunnelLifecycleService } from './funnel-lifecycle.service';
import { CrmModule } from '../crm/crm.module';
import { AutomationModule } from '../automation/automation.module';
import { LeadsModule } from '../leads/leads.module';
import { ChatbotCskhModule } from '../chatbot-cskh/chatbot-cskh.module';

@Module({
  imports: [CrmModule, AutomationModule, LeadsModule, ChatbotCskhModule],
  controllers: [FunnelBuilderController, FunnelPublicController],
  providers: [
    FunnelBuilderService,
    FunnelTemplateService,
    FunnelGeneratorService,
    FunnelLeadCaptureService,
    FunnelValidatorService,
    FunnelConsultantService,
    FunnelLifecycleService,
  ],
  exports: [
    FunnelBuilderService,
    FunnelTemplateService,
    FunnelGeneratorService,
    FunnelLeadCaptureService,
    FunnelValidatorService,
    FunnelConsultantService,
    FunnelLifecycleService,
  ],
})
export class FunnelBuilderModule {}
