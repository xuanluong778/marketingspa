import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { LeadsModule } from '../leads/leads.module';
import { CrmModule } from '../crm/crm.module';
import { WorkManagementModule } from '../work-management/work-management.module';
import { HrmModule } from '../hrm/hrm.module';
import { AdsMcpModule } from '../ads-mcp/ads-mcp.module';
import { ChatbotCskhModule } from '../chatbot-cskh/chatbot-cskh.module';
import { AttributionModule } from '../attribution/attribution.module';
import { EventsModule } from '../events/events.module';
import { RagKbModule } from '../rag-kb/rag-kb.module';
import { FinanceService } from '../finance/finance.service';
import { EmployeesService } from '../employees/employees.service';
import { AssistantController } from './assistant.controller';
import { AssistantSessionService } from './assistant.session.service';
import { AssistantAuditService } from './assistant.audit.service';
import { AssistantToolRegistry } from './tool-registry/tool-registry';
import { AssistantToolRuntime } from './tool-registry/tool-runtime';
import { AssistantOrchestratorService } from './assistant.orchestrator.service';
import { AssistantDomainToolsService } from './tools/domain-tools.service';
import { AssistantWriteExecuteService } from './write/write-execute.service';
import { AssistantPendingActionService } from './write/pending-action.service';
import { AssistantWriteToolsService } from './write/write-tools.service';

/**
 * Trợ lý Bạch Cốt Tinh — inject domain services/gateways currently exported.
 * FinanceService / EmployeesService are re-provided here (domain modules do not export them)
 * so assistant can call existing logic without editing CRM/Finance/HRM/Work/Ads/CSKH files.
 */
@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    LeadsModule,
    CrmModule,
    WorkManagementModule,
    HrmModule,
    AdsMcpModule,
    ChatbotCskhModule,
    AttributionModule,
    EventsModule,
    RagKbModule,
  ],
  controllers: [AssistantController],
  providers: [
    AssistantSessionService,
    AssistantAuditService,
    FinanceService,
    EmployeesService,
    AssistantDomainToolsService,
    AssistantWriteExecuteService,
    AssistantPendingActionService,
    AssistantWriteToolsService,
    {
      provide: AssistantToolRegistry,
      useFactory: (domain: AssistantDomainToolsService, write: AssistantWriteToolsService) => {
        const registry = new AssistantToolRegistry();
        domain.registerAll(registry);
        write.registerAll(registry);
        return registry;
      },
      inject: [AssistantDomainToolsService, AssistantWriteToolsService],
    },
    AssistantToolRuntime,
    AssistantOrchestratorService,
  ],
  exports: [
    AssistantSessionService,
    AssistantAuditService,
    AssistantToolRegistry,
    AssistantToolRuntime,
    AssistantOrchestratorService,
    AssistantPendingActionService,
  ],
})
export class AssistantModule {}
