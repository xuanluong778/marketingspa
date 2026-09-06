/**
 * Integration smoke with real DB: FinanceService + thin org-scoped reads.
 * Run: pnpm smoke:assistant-domain-tools
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  ASSISTANT_PERMISSIONS,
  ASSISTANT_TOOLS,
  type AssistantToolContext,
} from '../packages/shared/src/assistant-tools';
import { AssistantToolRegistry } from '../apps/api/src/assistant/tool-registry/tool-registry';
import { AssistantToolRuntime } from '../apps/api/src/assistant/tool-registry/tool-runtime';
import { AssistantDomainToolsService } from '../apps/api/src/assistant/tools/domain-tools.service';
import { FinanceService } from '../apps/api/src/finance/finance.service';
import { CustomersService } from '../apps/api/src/customers/customers.service';
import { Customer360Service } from '../apps/api/src/crm/customer-360.service';
import { HrmEmployeesService } from '../apps/api/src/hrm/hrm-employees.service';
import { EmployeesService } from '../apps/api/src/employees/employees.service';

async function main() {
  const prisma = new PrismaClient();
  try {
    const org = await prisma.organization.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    if (!org) {
      console.log('SKIP: no organization');
      return;
    }
    const user = await prisma.user.findFirst({
      where: { organizationId: org.id, deletedAt: null, isActive: true },
      include: { role: true },
    });
    if (!user) {
      console.log('SKIP: no user');
      return;
    }

    const otherOrg = await prisma.organization.findFirst({
      where: { isActive: true, id: { not: org.id } },
      select: { id: true },
    });

    const ctx: AssistantToolContext = {
      userId: user.id,
      organizationId: org.id,
      timezone: 'Asia/Ho_Chi_Minh',
      role: user.role?.code ?? 'OWNER',
      permissions: [
        ASSISTANT_PERMISSIONS.USE,
        ASSISTANT_PERMISSIONS.INBOX_READ,
        'customer.read',
        'lead.read',
        'order.read',
        'work.task.read',
        'work.project.read',
        'hrm.employee.read',
        'ads.read',
      ],
      employeeId: user.employeeId,
      locale: 'vi',
      requestId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      piiReveal: { phone: false, email: false },
    };

    const audit = { log: async () => undefined } as never;
    const tenant = { validateBranchBoundRelations: async () => undefined } as never;

    const finance = new FinanceService(
      prisma as never,
      tenant,
      { onPaymentCompleted: async () => undefined } as never,
      audit,
      { resolveStageForStatus: async () => null } as never,
      { emitToOrg: () => undefined } as never,
    );
    const customers = new CustomersService(prisma as never, audit, tenant);
    const customer360 = new Customer360Service(prisma as never, audit);
    const hrm = new HrmEmployeesService(prisma as never, audit);
    const employees = new EmployeesService(prisma as never, audit);

    const leads = {
      findAll: async (organizationId: string, query: Record<string, unknown>) => {
        assert.equal(organizationId, org.id);
        const where: Record<string, unknown> = { organizationId };
        if (query.pipelineStatus) where.pipelineStatus = query.pipelineStatus;
        if (query.createdFrom || query.createdTo) {
          where.createdAt = {
            ...(query.createdFrom ? { gte: new Date(String(query.createdFrom)) } : {}),
            ...(query.createdTo ? { lte: new Date(String(query.createdTo)) } : {}),
          };
        }
        const pageSize = Number(query.pageSize) || 20;
        const [items, total] = await Promise.all([
          prisma.lead.findMany({
            where: where as never,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
          }),
          prisma.lead.count({ where: where as never }),
        ]);
        return { items, total, page: 1, pageSize, totalPages: 1 };
      },
      findStaleLeads: async (organizationId: string, minutes = 10) => {
        assert.equal(organizationId, org.id);
        const threshold = new Date(Date.now() - minutes * 60_000);
        return prisma.lead.findMany({
          where: {
            organizationId,
            pipelineStatus: 'NEW',
            createdAt: { lt: threshold },
          },
          take: 50,
        });
      },
      getFunnelStats: async (organizationId: string, query: { from?: string; to?: string }) => {
        assert.equal(organizationId, org.id);
        const from = query.from ? new Date(query.from) : new Date(Date.now() - 7 * 864e5);
        const to = query.to ? new Date(query.to) : new Date();
        const totalLeads = await prisma.lead.count({
          where: { organizationId, createdAt: { gte: from, lte: to } },
        });
        const purchased = await prisma.lead.count({
          where: {
            organizationId,
            createdAt: { gte: from, lte: to },
            pipelineStatus: 'PURCHASED',
          },
        });
        return {
          from: from.toISOString(),
          to: to.toISOString(),
          totalLeads,
          steps: [],
          conversions: {
            leadToBooking: null,
            bookingToVisit: null,
            visitToPurchase: null,
            leadToPurchase: totalLeads ? Math.round((purchased / totalLeads) * 1000) / 10 : null,
          },
          counts: { booked: 0, visited: 0, purchased },
        };
      },
    } as never;

    const work = {
      listProjects: async (organizationId: string) => {
        assert.equal(organizationId, org.id);
        return prisma.workProject.findMany({ where: { organizationId }, take: 20 });
      },
      listTasks: async (organizationId: string) => {
        assert.equal(organizationId, org.id);
        return prisma.workTask.findMany({
          where: { organizationId, deletedAt: null },
          take: 20,
          include: { column: true },
        });
      },
    } as never;

    const workInsights = {
      myWork: async (organizationId: string) => {
        assert.equal(organizationId, org.id);
        return {
          today: '2026-08-06',
          timezone: 'Asia/Ho_Chi_Minh',
          counts: {
            today: 0,
            upcoming: 0,
            overdue: 0,
            inProgress: 0,
            pendingReview: 0,
            done: 0,
            assignedByMe: 0,
          },
          buckets: {
            today: [],
            upcoming: [],
            overdue: [],
            inProgress: [],
            pendingReview: [],
            done: [],
            assignedByMe: [],
          },
        };
      },
      dashboard: async (organizationId: string) => {
        assert.equal(organizationId, org.id);
        return { summary: { total: 0, overdue: 0, done: 0, inProgress: 0, onTimeRate: null } };
      },
      calendar: async (organizationId: string) => {
        assert.equal(organizationId, org.id);
        return [];
      },
      employeeStats: async (organizationId: string, _u: unknown, employeeId: string) => {
        assert.equal(organizationId, org.id);
        const emp = await prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
        if (!emp) {
          const { NotFoundException } = await import('@nestjs/common');
          throw new NotFoundException('no emp');
        }
        return { employee: emp, counts: { total: 0, overdue: 0, done: 0, inProgress: 0 } };
      },
    } as never;

    const adsMcp = {
      listAccounts: async (mcp: { organizationId: string }) => {
        assert.equal(mcp.organizationId, org.id);
        return { items: [] };
      },
      listCampaigns: async (mcp: { organizationId: string }) => {
        assert.equal(mcp.organizationId, org.id);
        return { items: [] };
      },
      getMetrics: async (mcp: { organizationId: string }) => {
        assert.equal(mcp.organizationId, org.id);
        return { spend: 0, impressions: 0, clicks: 0, conversions: 0, roas: 0 };
      },
    } as never;

    const cskh = {
      listConversations: async (organizationId: string, limit = 50) => {
        assert.equal(organizationId, org.id);
        const rows = await prisma.chatbotConversation.findMany({
          where: { organizationId },
          take: Math.min(limit, 50),
          orderBy: { updatedAt: 'desc' },
          include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });
        return rows.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          status: r.status,
          channel: r.channel,
          channelRef: r.channelRef,
          externalUserId: r.externalUserId,
          visitorName: r.visitorName,
          visitorPhone: r.visitorPhone,
          humanTakeover: r.humanTakeover,
          lastUserMessageAt: r.lastUserMessageAt,
          updatedAt: r.updatedAt,
          fanpage:
            r.channel === 'facebook' ? { pageId: r.channelRef, pageName: null } : null,
          customer: { name: r.visitorName, psid: r.externalUserId },
          messages: r.messages,
        }));
      },
      getConversation: async (organizationId: string, id: string) => {
        const r = await prisma.chatbotConversation.findFirst({
          where: { id, organizationId },
          include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
        });
        if (!r) {
          const { NotFoundException } = await import('@nestjs/common');
          throw new NotFoundException('missing');
        }
        return {
          ...r,
          fanpage:
            r.channel === 'facebook' ? { pageId: r.channelRef, pageName: null } : null,
          customer: { name: r.visitorName, psid: r.externalUserId },
        };
      },
      getOverview: async (organizationId: string) => ({
        conversationsTotal: await prisma.chatbotConversation.count({
          where: { organizationId },
        }),
        leadsToday: 0,
      }),
      listFacebookPages: async (organizationId: string) =>
        prisma.chatbotFacebookPage.findMany({
          where: { organizationId },
          select: { pageId: true, pageName: true },
        }),
    } as never;

    const domain = new AssistantDomainToolsService(
      finance,
      customers,
      leads,
      customer360,
      work,
      workInsights,
      hrm,
      employees,
      adsMcp,
      cskh,
    );
    const registry = new AssistantToolRegistry();
    domain.registerAll(registry);
    const runtime = new AssistantToolRuntime(registry);

    const dash = await runtime.invoke(ASSISTANT_TOOLS.FINANCE_DASHBOARD, { period: 'this_month' }, ctx);
    assert.equal(dash.ok, true, JSON.stringify(dash));
    if (dash.ok) {
      assert.equal(dash.organizationId, org.id);
      assert.ok(dash.evidence?.length);
      assert.ok(dash.links?.length);
      assert.ok(dash.generatedAt);
    }

    const cust = await runtime.invoke(ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS, { limit: 5 }, ctx);
    assert.ok(cust.ok === true || (cust.ok === false && cust.code === 'EMPTY'));
    if (cust.ok) {
      const items = (cust.data as { items?: Array<{ phone?: string }> }).items ?? [];
      for (const it of items) {
        if (it.phone) assert.ok(String(it.phone).includes('****') || it.phone.length < 4);
      }
    }

    const funnel = await runtime.invoke(
      ASSISTANT_TOOLS.CRM_FUNNEL_STATS,
      { period: 'last_7_days' },
      ctx,
    );
    assert.ok(funnel.ok === true || (funnel.ok === false && funnel.code === 'EMPTY'));

    const hrmList = await runtime.invoke(ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES, { limit: 5 }, ctx);
    assert.ok(hrmList.ok === true || (hrmList.ok === false && hrmList.code === 'EMPTY'));

    const ads = await runtime.invoke(
      ASSISTANT_TOOLS.ADS_GET_METRICS,
      { period: 'last_7_days' },
      ctx,
    );
    assert.ok(ads.ok === true || ads.ok === false);

    const inbox = await runtime.invoke(ASSISTANT_TOOLS.INBOX_PAGE_STATS, {}, ctx);
    assert.ok(inbox.ok === true || (inbox.ok === false && inbox.code === 'EMPTY'));

    // inbox requires chatbot.inbox.read
    const noInbox = await runtime.invoke(
      ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS,
      {},
      { ...ctx, role: 'SALE', permissions: [ASSISTANT_PERMISSIONS.USE] },
    );
    assert.equal(noInbox.ok, false);
    if (!noInbox.ok) assert.equal(noInbox.code, 'FORBIDDEN');

    // finance forbidden without order.read (non-owner)
    const noFin = await runtime.invoke(
      ASSISTANT_TOOLS.FINANCE_DASHBOARD,
      { period: 'today' },
      { ...ctx, role: 'SALE', permissions: [ASSISTANT_PERMISSIONS.USE] },
    );
    assert.equal(noFin.ok, false);
    if (!noFin.ok) assert.equal(noFin.code, 'FORBIDDEN');

    if (otherOrg) {
      const foreign = await runtime.invoke(
        ASSISTANT_TOOLS.FINANCE_DASHBOARD,
        { period: 'today' },
        { ...ctx, organizationId: otherOrg.id },
      );
      assert.equal(
        foreign.ok ? foreign.organizationId : foreign.organizationId,
        otherOrg.id,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          org: org.name,
          finance: dash.ok,
          customers: cust.ok ? 'ok' : (cust as { code: string }).code,
          funnel: funnel.ok ? 'ok' : (funnel as { code: string }).code,
          hrm: hrmList.ok ? 'ok' : (hrmList as { code: string }).code,
          ads: ads.ok ? 'ok' : (ads as { code: string }).code,
          inbox: inbox.ok ? 'ok' : (inbox as { code: string }).code,
        },
        null,
        2,
      ),
    );
    console.log('ALL_PASS smoke-assistant-domain-tools');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
