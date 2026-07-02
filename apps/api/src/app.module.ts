import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { EmployeesModule } from './employees/employees.module';
import { CustomersModule } from './customers/customers.module';
import { LeadsModule } from './leads/leads.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { FinanceModule } from './finance/finance.module';
import { MarketingModule } from './marketing/marketing.module';
import { AutomationModule } from './automation/automation.module';
import { AuditModule } from './audit/audit.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { BusinessGoalsModule } from './business-goals/business-goals.module';
import { ChatbotCskhModule } from './chatbot-cskh/chatbot-cskh.module';
import { OpenAiModule } from './openai/openai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    OpenAiModule,
    AuditModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    HealthModule,
    AuthModule,
    EventsModule,
    OrganizationsModule,
    EmployeesModule,
    CustomersModule,
    LeadsModule,
    AppointmentsModule,
    FinanceModule,
    MarketingModule,
    AutomationModule,
    IntegrationsModule,
    BusinessGoalsModule,
    ChatbotCskhModule,
  ],
})
export class AppModule {}
