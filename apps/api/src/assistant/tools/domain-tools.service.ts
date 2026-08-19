import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ASSISTANT_PERMISSIONS,
  ASSISTANT_TOOLS,
  assistantHasAllPermissions,
  assistantToolPermissionMap,
  listToolsForContext,
  maskSensitiveText,
  type AssistantLink,
  type AssistantToolContext,
  type AssistantToolName,
} from '@marketingspa/shared';
import { FinanceService } from '../../finance/finance.service';
import { CustomersService } from '../../customers/customers.service';
import { LeadsService } from '../../leads/leads.service';
import { Customer360Service } from '../../crm/customer-360.service';
import { WorkManagementService } from '../../work-management/work-management.service';
import { WorkInsightsService } from '../../work-management/work-insights.service';
import { HrmEmployeesService } from '../../hrm/hrm-employees.service';
import { EmployeesService } from '../../employees/employees.service';
import { AdsMcpGateway } from '../../ads-mcp/ads-mcp.gateway';
import { tenantFromAuthUser } from '../../ads-mcp/ads-mcp.context';
import { ChatbotCskhService } from '../../chatbot-cskh/chatbot-cskh.service';
import {
  emptyArgsSchema,
  looseObjectArgsSchema,
  type AssistantToolRegistry,
} from '../tool-registry/tool-registry';
import { authUserFromToolContext } from './auth-bridge';
import {
  rangeToServiceIso,
  resolveAssistantRange,
  previousAssistantRange,
  ymdInTimeZone,
} from './date-range';
import {
  clampLimit,
  decimalish,
  emptyTool,
  mapDomainError,
  okTool,
  validationTool,
} from './result-helpers';
import {
  assertNoDoubleCountRules,
  buildAdsMetrics,
  buildCrmMetrics,
  buildExecutiveNarrative,
  buildFinanceMetrics,
  buildIncompleteWorkLists,
  buildInboxMetrics,
  buildWorkMetrics,
  filterCompletedOnDay,
  formatAssigneeNames,
  matchFanpageByName,
  sectionsToEvidence,
  sectionsToLinks,
  type FanpageStatRow,
  type ReportSection,
  type WorkLiteTask,
} from './report-executive.logic';

function parsePeriodArgs(raw: Record<string, unknown>, ctx: AssistantToolContext, tool: string) {
  try {
    return resolveAssistantRange(
      {
        period: typeof raw.period === 'string' ? raw.period : undefined,
        dateFrom: typeof raw.dateFrom === 'string' ? raw.dateFrom : undefined,
        dateTo: typeof raw.dateTo === 'string' ? raw.dateTo : undefined,
      },
      ctx.timezone,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid_period';
    throw Object.assign(new Error(msg), { assistantValidation: true, tool });
  }
}

function stripEmployeePii(emp: Record<string, unknown>) {
  return {
    id: emp.id,
    code: emp.code,
    name: emp.name,
    position: emp.position,
    status: emp.status,
    isActive: emp.isActive,
    branchId: emp.branchId,
    departmentId: emp.departmentId,
    branch: emp.branch ? pickName(emp.branch as Record<string, unknown>) : null,
    department: emp.department ? pickName(emp.department as Record<string, unknown>) : null,
    phone: emp.phone ?? null,
    email: emp.email ?? null,
  };
}

function pickName(o: Record<string, unknown>) {
  return { id: o.id, name: o.name };
}

/**
 * Registers full read-only domain tools. Handlers call existing Nest services only
 * (no domain Prisma in this module for CRM/Finance/Work/HRM/Inbox domain).
 * Ads: AdsMcpGateway only (DB metrics, no Meta/Google HTTP on tools path).
 */
@Injectable()
export class AssistantDomainToolsService {
  constructor(
    private readonly finance: FinanceService,
    private readonly customers: CustomersService,
    private readonly leads: LeadsService,
    private readonly customer360: Customer360Service,
    private readonly work: WorkManagementService,
    private readonly workInsights: WorkInsightsService,
    private readonly hrmEmployees: HrmEmployeesService,
    private readonly employees: EmployeesService,
    private readonly adsMcp: AdsMcpGateway,
    private readonly cskh: ChatbotCskhService,
  ) {}

  registerAll(registry: AssistantToolRegistry): void {
    this.registerCapabilities(registry);
    this.registerReport(registry);
    this.registerCrm(registry);
    this.registerFinance(registry);
    this.registerWork(registry);
    this.registerHrm(registry);
    this.registerAds(registry);
    this.registerInbox(registry);
  }

  private registerCapabilities(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.LIST_CAPABILITIES,
      description: 'Liệt kê tool Trợ lý Bạch Cốt Tinh được phép theo RBAC JWT.',
      permissions: [ASSISTANT_PERMISSIONS.USE],
      mutates: false,
      argsSchema: emptyArgsSchema,
      handler: async (ctx) => {
        const tools = listToolsForContext(ctx);
        return okTool(
          ctx,
          ASSISTANT_TOOLS.LIST_CAPABILITIES,
          {
            tools: tools.map((t) => ({
              name: t.name,
              permissions: t.permissions,
              mutates: t.mutates,
            })),
            periods: ['today', 'yesterday', 'last_7_days', 'this_week', 'this_month', 'custom'],
          },
          {
            evidence: [{ label: 'tools_available', value: tools.length }],
            links: [
              {
                rel: 'list',
                label: 'Trợ lý Bạch Cốt Tinh',
                href: '/assistant',
                entityType: 'assistant',
                requiredPermission: ASSISTANT_PERMISSIONS.USE,
              },
            ],
          },
        );
      },
    });
  }

  /**
   * Báo cáo điều hành tổng hợp — read-only composition.
   * Compare kỳ trước chỉ khi compare=true và cả 2 cửa sổ tool ok.
   */
  private registerReport(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.REPORT_EXECUTIVE,
      description:
        'Báo cáo điều hành ngày/tuần/tháng: doanh thu, đơn, lead, khách chốt, ads, việc, inbox. So sánh kỳ trước chỉ khi đủ dữ liệu (compare=true). Args: period|dateFrom|dateTo|compare|pageId|pageName|fanpageName. mutates=false.',
      permissions: perms(ASSISTANT_TOOLS.REPORT_EXECUTIVE),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          return await this.buildExecutiveReport(ctx, args);
        } catch (e) {
          if ((e as { assistantValidation?: boolean }).assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.REPORT_EXECUTIVE, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.REPORT_EXECUTIVE);
        }
      },
    });
  }

  private async buildExecutiveReport(ctx: AssistantToolContext, args: Record<string, unknown>) {
    const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.REPORT_EXECUTIVE);
    const iso = rangeToServiceIso(range);
    const compareWanted =
      args.compare === true ||
      args.compare === 'true' ||
      args.compare === 1 ||
      String(args.compare ?? '').toLowerCase() === 'yes';
    const prevRange = compareWanted ? previousAssistantRange(range) : null;
    const prevIso = prevRange ? rangeToServiceIso(prevRange) : null;
    const user = authUserFromToolContext(ctx);
    const todayYmd = ymdInTimeZone(new Date(), ctx.timezone);
    const sections: ReportSection[] = [];

    // Finance
    if (assistantHasAllPermissions(ctx, [ASSISTANT_PERMISSIONS.USE, 'order.read'])) {
      try {
        const dash = await this.finance.getDashboard(ctx.organizationId, {
          from: iso.from,
          to: iso.to,
        } as never);
        let ordersTotal: number | null = null;
        try {
          const orders = await this.finance.listOrders(ctx.organizationId, {
            from: iso.from,
            to: iso.to,
            page: 1,
            pageSize: 1,
          } as never);
          ordersTotal = Number((orders as { total?: number }).total ?? 0);
        } catch {
          ordersTotal = null;
        }
        let prevFin: { revenue?: number | null; ordersTotal?: number | null } | null = null;
        if (prevIso) {
          try {
            const prevDash = await this.finance.getDashboard(ctx.organizationId, {
              from: prevIso.from,
              to: prevIso.to,
            } as never);
            let prevOrders: number | null = null;
            try {
              const po = await this.finance.listOrders(ctx.organizationId, {
                from: prevIso.from,
                to: prevIso.to,
                page: 1,
                pageSize: 1,
              } as never);
              prevOrders = Number((po as { total?: number }).total ?? 0);
            } catch {
              prevOrders = null;
            }
            prevFin = {
              revenue: decimalish((prevDash as { revenue?: unknown }).revenue),
              ordersTotal: prevOrders,
            };
          } catch {
            prevFin = null;
          }
        }
        sections.push({
          id: 'finance',
          title: 'Kinh doanh',
          status: 'ok',
          metrics: buildFinanceMetrics({
            revenue: decimalish((dash as { revenue?: unknown }).revenue),
            ordersTotal,
            paymentCount: Number((dash as { paymentCount?: number }).paymentCount ?? 0),
            expense: decimalish((dash as { expense?: unknown }).expense),
            profit: decimalish((dash as { profit?: unknown }).profit),
            prev: prevFin,
          }),
        });
      } catch (e) {
        sections.push({
          id: 'finance',
          title: 'Kinh doanh',
          status: e instanceof ForbiddenException ? 'forbidden' : 'error',
          message: e instanceof Error ? e.message : 'Lỗi finance',
          metrics: [],
        });
      }
    } else {
      sections.push({
        id: 'finance',
        title: 'Kinh doanh',
        status: 'forbidden',
        message: 'Thiếu quyền order.read',
        metrics: [],
      });
    }

    // CRM
    if (assistantHasAllPermissions(ctx, [ASSISTANT_PERMISSIONS.USE, 'lead.read'])) {
      try {
        const stats = await this.leads.getFunnelStats(ctx.organizationId, {
          from: iso.from,
          to: iso.to,
        } as never);
        let staleItems: Array<{ id?: string; name?: string }> = [];
        try {
          const rows = await this.leads.findStaleLeads(ctx.organizationId, 24 * 60);
          staleItems = (rows ?? []).slice(0, 20).map((l) => {
            const row = l as Record<string, unknown>;
            return { id: String(row.id ?? ''), name: String(row.name ?? 'Lead') };
          });
        } catch {
          staleItems = [];
        }
        sections.push({
          id: 'crm',
          title: 'Lead & khách chốt',
          status: 'ok',
          metrics: buildCrmMetrics({
            totalLeads: Number((stats as { totalLeads?: number }).totalLeads ?? 0),
            purchased: Number(
              (stats as { counts?: { purchased?: number } }).counts?.purchased ?? 0,
            ),
            staleLeads: staleItems.length,
          }),
          lists: staleItems.length
            ? [
                {
                  title: 'Lead cần chăm sóc',
                  items: staleItems.map((l) => l.name ?? 'Lead'),
                },
              ]
            : undefined,
        });
      } catch (e) {
        sections.push({
          id: 'crm',
          title: 'Lead & khách chốt',
          status: e instanceof ForbiddenException ? 'forbidden' : 'error',
          message: e instanceof Error ? e.message : 'Lỗi CRM',
          metrics: [],
        });
      }
    } else {
      sections.push({
        id: 'crm',
        title: 'Lead & khách chốt',
        status: 'forbidden',
        message: 'Thiếu quyền lead.read',
        metrics: [],
      });
    }

    // Work
    if (assistantHasAllPermissions(ctx, [ASSISTANT_PERMISSIONS.USE, 'work.task.read'])) {
      try {
        const data = await this.workInsights.myWork(ctx.organizationId, user);
        const counts = data.counts ?? {};
        const doneSamples = (data.buckets?.done ?? []) as WorkLiteTask[];
        const completedToday = filterCompletedOnDay(doneSamples, data.today ?? todayYmd);
        const incomplete = buildIncompleteWorkLists({
          overdue: (data.buckets?.overdue ?? []) as WorkLiteTask[],
          inProgress: (data.buckets?.inProgress ?? []) as WorkLiteTask[],
          pendingReview: (data.buckets?.pendingReview ?? []) as WorkLiteTask[],
        });
        sections.push({
          id: 'work',
          title: 'Công việc (assignee của tôi)',
          status: 'ok',
          metrics: buildWorkMetrics({
            dueToday: counts.today ?? 0,
            overdue: counts.overdue ?? 0,
            doneTotal: counts.done ?? 0,
            completedTodaySample: completedToday.length,
            sampleCapped: (counts.done ?? 0) > doneSamples.length || doneSamples.length >= 50,
          }),
          lists: [
            {
              title: 'Đã hoàn thành hôm nay (mẫu)',
              items: completedToday.map((t) => `${t.title ?? 'Task'} · ${formatAssigneeNames(t)}`),
            },
            { title: 'Quá hạn', items: incomplete.overdueTitles },
            { title: 'Chưa hoàn thành (unique mẫu)', items: incomplete.incompleteTitles },
          ],
        });
      } catch (e) {
        sections.push({
          id: 'work',
          title: 'Công việc',
          status: e instanceof ForbiddenException ? 'forbidden' : 'error',
          message: e instanceof Error ? e.message : 'Lỗi work',
          metrics: [],
        });
      }
    } else {
      sections.push({
        id: 'work',
        title: 'Công việc',
        status: 'forbidden',
        message: 'Thiếu quyền work.task.read',
        metrics: [],
      });
    }

    // Ads
    if (assistantHasAllPermissions(ctx, [ASSISTANT_PERMISSIONS.USE, 'ads.read'])) {
      try {
        const mcpCtx = tenantFromAuthUser(user);
        const metricsRaw = await this.adsMcp.getMetrics(mcpCtx, {
          dateFrom: iso.dateFrom,
          dateTo: iso.dateTo,
        });
        let prevAds: { spend?: number | null; roas?: number | null } | null = null;
        if (prevIso) {
          try {
            const pm = await this.adsMcp.getMetrics(mcpCtx, {
              dateFrom: prevIso.dateFrom,
              dateTo: prevIso.dateTo,
            });
            const p = pm as Record<string, unknown>;
            prevAds = {
              spend: numOrNull(p.spend ?? p.totalSpend),
              roas: numOrNull(p.roas),
            };
          } catch {
            prevAds = null;
          }
        }
        const m = metricsRaw as Record<string, unknown>;
        const adsMetrics = buildAdsMetrics({
          spend: numOrNull(m.spend ?? m.totalSpend),
          impressions: numOrNull(m.impressions),
          clicks: numOrNull(m.clicks),
          conversions: numOrNull(m.conversions),
          roas: numOrNull(m.roas),
          prev: prevAds,
        });
        sections.push({
          id: 'ads',
          title: 'Quảng cáo',
          status: adsMetrics.length ? 'ok' : 'empty',
          message: adsMetrics.length ? undefined : 'Ads không trả metric số',
          metrics: adsMetrics,
        });
      } catch (e) {
        sections.push({
          id: 'ads',
          title: 'Quảng cáo',
          status: e instanceof ForbiddenException ? 'forbidden' : 'error',
          message: e instanceof Error ? e.message : 'Lỗi ads',
          metrics: [],
        });
      }
    } else {
      sections.push({
        id: 'ads',
        title: 'Quảng cáo',
        status: 'forbidden',
        message: 'Thiếu quyền ads.read',
        metrics: [],
      });
    }

    // Inbox
    if (
      assistantHasAllPermissions(ctx, [ASSISTANT_PERMISSIONS.USE, ASSISTANT_PERMISSIONS.INBOX_READ])
    ) {
      try {
        const [overview, pages, conversationPage] = await Promise.all([
          this.cskh.getOverview(ctx.organizationId),
          this.cskh.listFacebookPages(ctx.organizationId),
          this.cskh.listConversations(ctx.organizationId, 200),
        ]);
        const conversations = conversationPage.items;
        const byPage = new Map<string, FanpageStatRow>();
        for (const p of pages as Array<Record<string, unknown>>) {
          const pageId = String(p.pageId ?? '');
          if (!pageId) continue;
          byPage.set(pageId, {
            pageId,
            pageName: (p.pageName as string) ?? null,
            conversations: 0,
            needsReply: 0,
            open: 0,
          });
        }
        for (const c of conversations) {
          const s = summarizeConversation(c as Record<string, unknown>);
          if (!s.fanpagePageId) continue;
          let row = byPage.get(s.fanpagePageId);
          if (!row) {
            row = {
              pageId: s.fanpagePageId,
              pageName: s.fanpageName,
              conversations: 0,
              needsReply: 0,
              open: 0,
            };
            byPage.set(s.fanpagePageId, row);
          }
          row.conversations += 1;
          if (s.needsReply) row.needsReply += 1;
          if (s.status === 'OPEN') row.open += 1;
          if (!row.pageName && s.fanpageName) row.pageName = s.fanpageName;
        }
        const pageStats = [...byPage.values()];
        const pageIdArg =
          typeof args.pageId === 'string'
            ? args.pageId
            : typeof args.fanpagePageId === 'string'
              ? args.fanpagePageId
              : '';
        const pageNameArg =
          typeof args.pageName === 'string'
            ? args.pageName
            : typeof args.fanpageName === 'string'
              ? args.fanpageName
              : '';
        let page: FanpageStatRow | null = null;
        if (pageIdArg) page = pageStats.find((p) => p.pageId === pageIdArg) ?? null;
        else if (pageNameArg) page = matchFanpageByName(pageStats, pageNameArg);

        const needsSample = pageStats.reduce((sum, p) => sum + p.needsReply, 0);
        const lists: Array<{ title: string; items: string[] }> = [];
        if (pageNameArg && !page) {
          lists.push({
            title: 'Fanpage',
            items: [
              `Không khớp “${pageNameArg}”. Các page: ${
                pageStats
                  .map((p) => p.pageName || p.pageId)
                  .slice(0, 8)
                  .join(', ') || '—'
              }`,
            ],
          });
        } else if (page) {
          lists.push({
            title: `Fanpage ${page.pageName ?? page.pageId}`,
            items: [
              `conversations_sample=${page.conversations}`,
              `needs_reply=${page.needsReply}`,
              `open=${page.open}`,
            ],
          });
        }

        sections.push({
          id: 'inbox',
          title: 'Inbox Fanpage',
          status: 'ok',
          metrics: buildInboxMetrics({
            conversationsTotal: Number(
              (overview as { conversationsTotal?: number }).conversationsTotal ?? 0,
            ),
            needsReplySample: needsSample,
            page,
          }),
          lists: lists.length ? lists : undefined,
        });
      } catch (e) {
        sections.push({
          id: 'inbox',
          title: 'Inbox Fanpage',
          status: e instanceof ForbiddenException ? 'forbidden' : 'error',
          message: e instanceof Error ? e.message : 'Lỗi inbox',
          metrics: [],
        });
      }
    } else {
      sections.push({
        id: 'inbox',
        title: 'Inbox Fanpage',
        status: 'forbidden',
        message: 'Thiếu quyền chatbot.inbox.read',
        metrics: [],
      });
    }

    const allMetrics = sections.flatMap((s) => s.metrics);
    const violations = assertNoDoubleCountRules(allMetrics);
    if (violations.length) {
      return validationTool(
        ctx,
        ASSISTANT_TOOLS.REPORT_EXECUTIVE,
        `double_count_blocked:${violations.join(',')}`,
      );
    }

    const compareEnabled =
      Boolean(prevRange) &&
      sections.some((s) => s.metrics.some((m) => m.comparable && m.previousValue != null));

    const narrative = buildExecutiveNarrative({
      periodLabel: range.label,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      compareEnabled,
      sections,
    });

    return okTool(
      ctx,
      ASSISTANT_TOOLS.REPORT_EXECUTIVE,
      {
        narrative,
        sections,
        compare: {
          requested: compareWanted,
          applied: compareEnabled,
          previous: prevRange
            ? {
                dateFrom: prevRange.dateFrom,
                dateTo: prevRange.dateTo,
                label: prevRange.label,
              }
            : null,
        },
        mutates: false,
      },
      {
        range,
        evidence: sectionsToEvidence(sections),
        links: sectionsToLinks(sections),
      },
    );
  }

  private registerCrm(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS,
      description: 'Tìm/danh sách khách hàng theo search, tag (read-only).',
      permissions: perms(ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const limit = clampLimit(args.limit);
          const page = Math.max(1, Number(args.page) || 1);
          const result = await this.customers.findAll(ctx.organizationId, {
            search: typeof args.search === 'string' ? args.search : undefined,
            tag: typeof args.tag === 'string' ? args.tag : undefined,
            branchId: typeof args.branchId === 'string' ? args.branchId : undefined,
            page,
            pageSize: limit,
          } as never);
          const items = (result.items ?? []).map((c) => {
            const row = c as Record<string, unknown>;
            return {
              id: row.id,
              name: row.name,
              phone: row.phone,
              email: row.email,
              tags: row.tags,
              isActive: row.isActive,
              source: row.source,
              createdAt: row.createdAt,
            };
          });
          if (!items.length) {
            return emptyTool(ctx, ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS, 'Không có khách hàng khớp');
          }
          const links: AssistantLink[] = [
            { rel: 'list', label: 'Danh sách KH', href: '/customers', entityType: 'customer' },
            ...items.slice(0, 10).map((c) => ({
              rel: 'customer' as const,
              label: String(c.name ?? c.id),
              href: `/customers/${c.id}`,
              entityType: 'customer',
              entityId: String(c.id),
              requiredPermission: 'customer.read',
            })),
          ];
          return okTool(
            ctx,
            ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS,
            { total: result.total, page: result.page, pageSize: result.pageSize, items },
            {
              evidence: [
                { label: 'customers_total', value: result.total ?? items.length },
                { label: 'page_size', value: items.length },
              ],
              links,
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.CRM_GET_CUSTOMER_360,
      description: 'Customer 360: lead, đơn, task OPEN, timeline (read-only).',
      permissions: perms(ASSISTANT_TOOLS.CRM_GET_CUSTOMER_360),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const customerId = String(args.customerId ?? args.id ?? '');
          if (!customerId) {
            return validationTool(ctx, ASSISTANT_TOOLS.CRM_GET_CUSTOMER_360, 'Thiếu customerId');
          }
          const raw = await this.customer360.get360(ctx.organizationId, customerId);
          const customer = raw.customer as Record<string, unknown>;
          const data = {
            customer: {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              tags: customer.tags,
              isActive: customer.isActive,
            },
            totalSpend: decimalish(raw.totalSpend),
            openTasks: (raw.tasks ?? []).slice(0, 20).map((t) => {
              const row = t as Record<string, unknown>;
              return {
                id: row.id,
                title: row.title,
                dueAt: row.dueAt,
                status: row.status,
              };
            }),
            leadsCount: Array.isArray(raw.leads) ? raw.leads.length : 0,
            ordersCount: Array.isArray(raw.orders) ? raw.orders.length : 0,
            conversationsCount: Array.isArray(raw.conversations) ? raw.conversations.length : 0,
          };
          return okTool(ctx, ASSISTANT_TOOLS.CRM_GET_CUSTOMER_360, data, {
            evidence: [
              { label: 'total_spend', value: data.totalSpend, unit: 'VND' },
              { label: 'open_tasks', value: data.openTasks.length },
              { label: 'leads', value: data.leadsCount },
            ],
            links: [
              {
                rel: 'customer',
                label: String(customer.name ?? customerId),
                href: `/customers/${customerId}`,
                entityType: 'customer',
                entityId: customerId,
                requiredPermission: 'customer.read',
              },
            ],
          });
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.CRM_GET_CUSTOMER_360);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.CRM_LIST_LEADS,
      description:
        'Danh sách lead. pipelineStatus: NEW|…|PURCHASED|LOST (khách đã chốt = PURCHASED). Hỗ trợ period.',
      permissions: perms(ASSISTANT_TOOLS.CRM_LIST_LEADS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.CRM_LIST_LEADS);
          const iso = rangeToServiceIso(range);
          const limit = clampLimit(args.limit);
          const pipelineStatus =
            typeof args.pipelineStatus === 'string' ? args.pipelineStatus : undefined;
          const result = await this.leads.findAll(ctx.organizationId, {
            search: typeof args.search === 'string' ? args.search : undefined,
            pipelineStatus: pipelineStatus as never,
            createdFrom: iso.from,
            createdTo: iso.to,
            page: 1,
            pageSize: limit,
          } as never);
          const items = (result.items ?? []).map((l) => {
            const row = l as Record<string, unknown>;
            return {
              id: row.id,
              name: row.name,
              phone: row.phone,
              email: row.email,
              pipelineStatus: row.pipelineStatus,
              isStale: row.isStale,
              createdAt: row.createdAt,
              assignedTo: row.assignedTo
                ? pickName(row.assignedTo as Record<string, unknown>)
                : null,
            };
          });
          if (!items.length) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.CRM_LIST_LEADS,
              `Không có lead trong ${range.label} (${range.dateFrom} → ${range.dateTo})`,
            );
          }
          const purchased = items.filter((i) => i.pipelineStatus === 'PURCHASED').length;
          return okTool(
            ctx,
            ASSISTANT_TOOLS.CRM_LIST_LEADS,
            { total: result.total, items, pipelineStatus: pipelineStatus ?? null },
            {
              range,
              evidence: [
                { label: 'leads_total', value: result.total ?? items.length },
                { label: 'purchased_in_page', value: purchased },
              ],
              links: [
                { rel: 'list', label: 'Leads', href: '/leads', entityType: 'lead' },
                ...items.slice(0, 8).map((l) => ({
                  rel: 'lead' as const,
                  label: String(l.name ?? l.id),
                  href: `/leads?id=${l.id}`,
                  entityType: 'lead',
                  entityId: String(l.id),
                  requiredPermission: 'lead.read',
                })),
              ],
            },
          );
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.CRM_LIST_LEADS, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.CRM_LIST_LEADS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS,
      description: 'Lead cần chăm sóc (NEW quá hạn phản hồi).',
      permissions: perms(ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const minutes = Math.min(24 * 60, Math.max(5, Number(args.minutes) || 10));
          const rows = await this.leads.findStaleLeads(ctx.organizationId, minutes);
          const items = (rows ?? []).slice(0, clampLimit(args.limit)).map((l) => {
            const row = l as Record<string, unknown>;
            return {
              id: row.id,
              name: row.name,
              phone: row.phone,
              email: row.email,
              pipelineStatus: row.pipelineStatus,
              createdAt: row.createdAt,
            };
          });
          if (!items.length) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS,
              `Không có lead NEW quá ${minutes} phút chưa phản hồi`,
            );
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS,
            { minutes, items },
            {
              evidence: [{ label: 'stale_leads', value: items.length }],
              links: [
                { rel: 'list', label: 'Leads', href: '/leads', entityType: 'lead' },
                ...items.slice(0, 8).map((l) => ({
                  rel: 'lead' as const,
                  label: String(l.name ?? l.id),
                  href: `/leads?id=${l.id}`,
                  entityType: 'lead',
                  entityId: String(l.id),
                })),
              ],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.CRM_FUNNEL_STATS,
      description: 'Funnel + tỷ lệ chuyển đổi lead→booking→visit→purchase theo period.',
      permissions: perms(ASSISTANT_TOOLS.CRM_FUNNEL_STATS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.CRM_FUNNEL_STATS);
          const iso = rangeToServiceIso(range);
          const stats = await this.leads.getFunnelStats(ctx.organizationId, {
            from: iso.from,
            to: iso.to,
            leadSourceId: typeof args.leadSourceId === 'string' ? args.leadSourceId : undefined,
            assignedToId: typeof args.assignedToId === 'string' ? args.assignedToId : undefined,
            branchId: typeof args.branchId === 'string' ? args.branchId : undefined,
          } as never);
          if (!stats.totalLeads) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.CRM_FUNNEL_STATS,
              `Không có lead trong ${range.label}`,
            );
          }
          const c = stats.conversions as Record<string, number | null>;
          return okTool(ctx, ASSISTANT_TOOLS.CRM_FUNNEL_STATS, stats, {
            range,
            evidence: [
              { label: 'total_leads', value: stats.totalLeads },
              { label: 'purchased', value: stats.counts?.purchased ?? 0 },
              {
                label: 'lead_to_purchase_pct',
                value: c?.leadToPurchase ?? null,
                unit: '%',
              },
              {
                label: 'lead_to_booking_pct',
                value: c?.leadToBooking ?? null,
                unit: '%',
              },
            ],
            links: [
              { rel: 'report', label: 'Funnel', href: '/funnel', entityType: 'report' },
              { rel: 'list', label: 'Leads', href: '/leads', entityType: 'lead' },
            ],
          });
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.CRM_FUNNEL_STATS, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.CRM_FUNNEL_STATS);
        }
      },
    });
  }

  private registerFinance(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.FINANCE_DASHBOARD,
      description: 'Doanh thu, chi phí, lợi nhuận, margin theo period (payments COMPLETED).',
      permissions: perms(ASSISTANT_TOOLS.FINANCE_DASHBOARD),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.FINANCE_DASHBOARD);
          const iso = rangeToServiceIso(range);
          const dash = await this.finance.getDashboard(ctx.organizationId, {
            from: iso.from,
            to: iso.to,
            branchId: typeof args.branchId === 'string' ? args.branchId : undefined,
          } as never);
          return okTool(
            ctx,
            ASSISTANT_TOOLS.FINANCE_DASHBOARD,
            {
              revenue: decimalish(dash.revenue),
              expense: decimalish(dash.expense),
              profit: decimalish(dash.profit),
              margin: dash.margin,
              adSpend: decimalish(dash.adSpend),
              salarySpend: decimalish(dash.salarySpend),
              paymentCount: dash.paymentCount,
              expenseCount: dash.expenseCount,
            },
            {
              range,
              evidence: [
                { label: 'revenue', value: decimalish(dash.revenue), unit: 'VND' },
                { label: 'expense', value: decimalish(dash.expense), unit: 'VND' },
                { label: 'profit', value: decimalish(dash.profit), unit: 'VND' },
                { label: 'margin', value: Number(dash.margin), unit: '%' },
                { label: 'payments', value: dash.paymentCount },
              ],
              links: [
                { rel: 'report', label: 'Tài chính', href: '/finance', entityType: 'report' },
              ],
            },
          );
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.FINANCE_DASHBOARD, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.FINANCE_DASHBOARD);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.FINANCE_LIST_ORDERS,
      description: 'Đơn hàng theo period (orderedAt).',
      permissions: perms(ASSISTANT_TOOLS.FINANCE_LIST_ORDERS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.FINANCE_LIST_ORDERS);
          const iso = rangeToServiceIso(range);
          const limit = clampLimit(args.limit);
          const result = await this.finance.listOrders(ctx.organizationId, {
            from: iso.from,
            to: iso.to,
            orderStatus: typeof args.orderStatus === 'string' ? args.orderStatus : undefined,
            page: 1,
            pageSize: limit,
          } as never);
          const items = (result.items ?? []).map((o) => {
            const row = o as Record<string, unknown>;
            const customer = row.customer as Record<string, unknown> | undefined;
            return {
              id: row.id,
              orderNumber: row.orderNumber,
              status: row.status,
              total: decimalish(row.total),
              orderedAt: row.orderedAt,
              customer: customer
                ? { id: customer.id, name: customer.name, phone: customer.phone }
                : null,
            };
          });
          if (!items.length) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.FINANCE_LIST_ORDERS,
              `Không có đơn trong ${range.label}`,
            );
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.FINANCE_LIST_ORDERS,
            { total: result.total, items },
            {
              range,
              evidence: [
                { label: 'orders_total', value: result.total ?? items.length },
                {
                  label: 'orders_sum_page',
                  value: items.reduce((s, i) => s + i.total, 0),
                  unit: 'VND',
                },
              ],
              links: [
                { rel: 'list', label: 'Đơn hàng', href: '/finance', entityType: 'order' },
                ...items.slice(0, 8).map((o) => ({
                  rel: 'order' as const,
                  label: String(o.orderNumber ?? o.id),
                  href: `/finance?orderId=${o.id}`,
                  entityType: 'order',
                  entityId: String(o.id),
                })),
              ],
            },
          );
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.FINANCE_LIST_ORDERS, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.FINANCE_LIST_ORDERS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS,
      description: 'Thanh toán theo period (paidAt).',
      permissions: perms(ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS);
          const iso = rangeToServiceIso(range);
          const limit = clampLimit(args.limit);
          const result = await this.finance.listPayments(ctx.organizationId, {
            from: iso.from,
            to: iso.to,
            paymentStatus: typeof args.paymentStatus === 'string' ? args.paymentStatus : undefined,
            page: 1,
            pageSize: limit,
          } as never);
          const items = (result.items ?? []).map((p) => {
            const row = p as Record<string, unknown>;
            return {
              id: row.id,
              orderId: row.orderId,
              amount: decimalish(row.amount),
              method: row.method,
              status: row.status,
              paidAt: row.paidAt,
            };
          });
          if (!items.length) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS,
              `Không có thanh toán trong ${range.label}`,
            );
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS,
            { total: result.total, items },
            {
              range,
              evidence: [
                { label: 'payments_total', value: result.total ?? items.length },
                {
                  label: 'payments_sum_page',
                  value: items.reduce((s, i) => s + i.amount, 0),
                  unit: 'VND',
                },
              ],
              links: [{ rel: 'list', label: 'Thanh toán', href: '/finance', entityType: 'order' }],
            },
          );
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.FINANCE_LIST_PAYMENTS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES,
      description: 'Chi phí theo period (expenseDate).',
      permissions: perms(ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES);
          const iso = rangeToServiceIso(range);
          const limit = clampLimit(args.limit);
          const result = await this.finance.listExpenses(ctx.organizationId, {
            from: iso.from,
            to: iso.to,
            expenseCategory:
              typeof args.expenseCategory === 'string' ? args.expenseCategory : undefined,
            page: 1,
            pageSize: limit,
          } as never);
          const items = (result.items ?? []).map((e) => {
            const row = e as Record<string, unknown>;
            return {
              id: row.id,
              category: row.category,
              description: row.description,
              amount: decimalish(row.amount),
              expenseDate: row.expenseDate,
            };
          });
          if (!items.length) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES,
              `Không có chi phí trong ${range.label}`,
            );
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES,
            { total: result.total, items },
            {
              range,
              evidence: [
                { label: 'expenses_total', value: result.total ?? items.length },
                {
                  label: 'expenses_sum_page',
                  value: items.reduce((s, i) => s + i.amount, 0),
                  unit: 'VND',
                },
              ],
              links: [{ rel: 'list', label: 'Chi phí', href: '/finance', entityType: 'report' }],
            },
          );
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.FINANCE_LIST_EXPENSES);
        }
      },
    });
  }

  private registerWork(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.WORK_MY_WORK,
      description:
        'Việc của tôi: done / overdue / inProgress / pendingReview / today (bucket từ WorkInsights).',
      permissions: perms(ASSISTANT_TOOLS.WORK_MY_WORK),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx) => {
        try {
          const user = authUserFromToolContext(ctx);
          const data = await this.workInsights.myWork(ctx.organizationId, user);
          const counts = data.counts ?? {};
          const doneSamples = (data.buckets?.done ?? []) as WorkLiteTask[];
          const completedToday = filterCompletedOnDay(doneSamples, data.today ?? '');
          const totalOpen =
            (counts.overdue ?? 0) +
            (counts.inProgress ?? 0) +
            (counts.pendingReview ?? 0) +
            (counts.today ?? 0);
          if (totalOpen === 0 && (counts.done ?? 0) === 0) {
            return emptyTool(ctx, ASSISTANT_TOOLS.WORK_MY_WORK, 'Không có công việc gán cho bạn');
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.WORK_MY_WORK,
            {
              today: data.today,
              workTimezone: data.timezone,
              counts: data.counts,
              // Independent buckets (do not sum as "open total" for narrative)
              dueToday: (data.buckets?.today ?? []).slice(0, 15),
              overdue: (data.buckets?.overdue ?? []).slice(0, 15),
              inProgress: (data.buckets?.inProgress ?? []).slice(0, 15),
              done: doneSamples.slice(0, 15),
              completedTodaySample: completedToday.slice(0, 15),
              pendingReview: (data.buckets?.pendingReview ?? []).slice(0, 10),
            },
            {
              evidence: [
                { label: 'due_today', value: counts.today ?? 0 },
                { label: 'overdue', value: counts.overdue ?? 0 },
                { label: 'in_progress', value: counts.inProgress ?? 0 },
                { label: 'done', value: counts.done ?? 0 },
                { label: 'completed_today_sample', value: completedToday.length },
                { label: 'pending_review', value: counts.pendingReview ?? 0 },
              ],
              links: [
                {
                  rel: 'list',
                  label: 'Mở công việc',
                  href: '/work-management',
                  entityType: 'task',
                  requiredPermission: 'work.task.read',
                },
              ],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.WORK_MY_WORK);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.WORK_DASHBOARD,
      description: 'Tổng quan work: overdue/done/inProgress theo project|department|employee.',
      permissions: perms(ASSISTANT_TOOLS.WORK_DASHBOARD),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const user = authUserFromToolContext(ctx);
          const groupBy =
            args.groupBy === 'department' || args.groupBy === 'employee' ? args.groupBy : 'project';
          const data = await this.workInsights.dashboard(ctx.organizationId, user, groupBy);
          const summary = (data as { summary?: Record<string, number> }).summary ?? {};
          return okTool(ctx, ASSISTANT_TOOLS.WORK_DASHBOARD, data, {
            evidence: [
              { label: 'total', value: summary.total ?? 0 },
              { label: 'overdue', value: summary.overdue ?? 0 },
              { label: 'done', value: summary.done ?? 0 },
              { label: 'in_progress', value: summary.inProgress ?? 0 },
              { label: 'on_time_rate', value: summary.onTimeRate ?? null, unit: '%' },
            ],
            links: [
              {
                rel: 'report',
                label: 'Work dashboard',
                href: '/work-management',
                entityType: 'report',
              },
            ],
          });
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.WORK_DASHBOARD);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.WORK_LIST_PROJECTS,
      description: 'Danh sách dự án (phạm vi theo RBAC work).',
      permissions: perms(ASSISTANT_TOOLS.WORK_LIST_PROJECTS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const user = authUserFromToolContext(ctx);
          const projects = await this.work.listProjects(
            ctx.organizationId,
            user,
            Boolean(args.includeArchived),
          );
          const items = (Array.isArray(projects) ? projects : []).slice(0, clampLimit(args.limit));
          if (!items.length) {
            return emptyTool(ctx, ASSISTANT_TOOLS.WORK_LIST_PROJECTS, 'Không có dự án');
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.WORK_LIST_PROJECTS,
            {
              items: items.map((p) => {
                const row = p as Record<string, unknown>;
                return {
                  id: row.id,
                  name: row.name,
                  isArchived: row.isArchived,
                  createdAt: row.createdAt,
                };
              }),
            },
            {
              evidence: [{ label: 'projects', value: items.length }],
              links: [
                {
                  rel: 'list',
                  label: 'Dự án',
                  href: '/work-management',
                  entityType: 'project',
                },
                ...items.slice(0, 8).map((p) => {
                  const row = p as Record<string, unknown>;
                  return {
                    rel: 'project' as const,
                    label: String(row.name ?? row.id),
                    href: `/work-management?projectId=${row.id}`,
                    entityType: 'project',
                    entityId: String(row.id),
                  };
                }),
              ],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.WORK_LIST_PROJECTS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.WORK_LIST_TASKS,
      description: 'Danh sách task (filter projectId, q, assignee).',
      permissions: perms(ASSISTANT_TOOLS.WORK_LIST_TASKS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const user = authUserFromToolContext(ctx);
          const result = await this.work.listTasks(ctx.organizationId, user, {
            projectId: typeof args.projectId === 'string' ? args.projectId : undefined,
            q: typeof args.q === 'string' ? args.q : undefined,
            assigneeId: typeof args.assigneeId === 'string' ? args.assigneeId : undefined,
            includeArchived: Boolean(args.includeArchived),
          } as never);
          const rawItems = Array.isArray(result)
            ? result
            : ((result as { items?: unknown[] })?.items ?? []);
          const items = rawItems.slice(0, clampLimit(args.limit)).map((t) => {
            const row = t as Record<string, unknown>;
            const column = row.column as Record<string, unknown> | undefined;
            return {
              id: row.id,
              title: row.title,
              deadline: row.deadline,
              priority: row.priority,
              columnKey: column?.key ?? row.columnKey,
              projectId: row.projectId,
            };
          });
          if (!items.length) {
            return emptyTool(ctx, ASSISTANT_TOOLS.WORK_LIST_TASKS, 'Không có công việc khớp');
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.WORK_LIST_TASKS,
            { items },
            {
              evidence: [{ label: 'tasks', value: items.length }],
              links: [
                {
                  rel: 'list',
                  label: 'Task board',
                  href: '/work-management',
                  entityType: 'task',
                },
              ],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.WORK_LIST_TASKS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.WORK_CALENDAR,
      description: 'Lịch task theo period (from/to YYYY-MM-DD theo timezone context).',
      permissions: perms(ASSISTANT_TOOLS.WORK_CALENDAR),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.WORK_CALENDAR);
          const user = authUserFromToolContext(ctx);
          const data = await this.workInsights.calendar(ctx.organizationId, user, {
            from: range.dateFrom,
            to: range.dateTo,
          });
          const events = Array.isArray(data)
            ? data
            : ((data as { events?: unknown[] })?.events ??
              (data as { items?: unknown[] })?.items ??
              []);
          if (!events.length && data && typeof data === 'object') {
            // return as-is if non-array structure with content
            const keys = Object.keys(data as object);
            if (!keys.length) {
              return emptyTool(ctx, ASSISTANT_TOOLS.WORK_CALENDAR, 'Lịch trống trong khoảng');
            }
          }
          if (Array.isArray(events) && !events.length) {
            return emptyTool(ctx, ASSISTANT_TOOLS.WORK_CALENDAR, 'Lịch trống trong khoảng');
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.WORK_CALENDAR,
            { calendar: data },
            {
              range,
              evidence: [
                {
                  label: 'events',
                  value: Array.isArray(events) ? events.length : 1,
                },
              ],
              links: [
                {
                  rel: 'list',
                  label: 'Lịch work',
                  href: '/work-management',
                  entityType: 'task',
                },
              ],
            },
          );
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.WORK_CALENDAR, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.WORK_CALENDAR);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS,
      description: 'Hoạt động / workload NV theo work scope (overdue, done, inProgress).',
      permissions: perms(ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const employeeId = String(args.employeeId ?? '');
          if (!employeeId) {
            return validationTool(ctx, ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS, 'Thiếu employeeId');
          }
          const user = authUserFromToolContext(ctx);
          const data = await this.workInsights.employeeStats(ctx.organizationId, user, employeeId);
          const counts = (data as { counts?: Record<string, number> }).counts ?? {};
          return okTool(ctx, ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS, data, {
            evidence: [
              { label: 'in_progress', value: counts.inProgress ?? 0 },
              { label: 'overdue', value: counts.overdue ?? 0 },
              { label: 'done', value: counts.done ?? 0 },
              { label: 'total', value: counts.total ?? 0 },
            ],
            links: [
              {
                rel: 'employee',
                label: 'Hồ sơ work NV',
                href: `/work-management?employeeId=${employeeId}`,
                entityType: 'employee',
                entityId: employeeId,
              },
            ],
          });
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS);
        }
      },
    });
  }

  private registerHrm(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES,
      description: 'Danh sách nhân viên (HrmEmployeesService).',
      permissions: perms(ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const limit = clampLimit(args.limit);
          const result = await this.hrmEmployees.findAll(ctx.organizationId, {
            q: typeof args.search === 'string' ? args.search : undefined,
            branchId: typeof args.branchId === 'string' ? args.branchId : undefined,
            departmentId: typeof args.departmentId === 'string' ? args.departmentId : undefined,
            isActive: args.isActive === false ? false : true,
            page: 1,
            pageSize: limit,
          } as never);
          const items = (result.items ?? []).map((e) =>
            stripEmployeePii(e as unknown as Record<string, unknown>),
          );
          if (!items.length) {
            return emptyTool(ctx, ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES, 'Không có nhân viên');
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES,
            { total: result.total, items },
            {
              evidence: [{ label: 'employees_total', value: result.total ?? items.length }],
              links: [
                {
                  rel: 'list',
                  label: 'Nhân viên',
                  href: '/hrm/employees',
                  entityType: 'employee',
                },
              ],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.HRM_LIST_EMPLOYEES);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY,
      description: 'Tổng hợp NV: profile HR + (nếu đủ quyền) work stats + sales KPI theo period.',
      permissions: perms(ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const employeeId = String(args.employeeId ?? args.id ?? '');
          if (!employeeId) {
            return validationTool(
              ctx,
              ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY,
              'Thiếu employeeId',
            );
          }
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY);
          const iso = rangeToServiceIso(range);
          const profile = await this.hrmEmployees.findOne(ctx.organizationId, employeeId);
          const out: Record<string, unknown> = {
            profile: stripEmployeePii(profile as unknown as Record<string, unknown>),
          };

          const user = authUserFromToolContext(ctx);
          if (assistantHasAllPermissions(ctx, [ASSISTANT_PERMISSIONS.USE, 'work.task.read'])) {
            try {
              out.work = await this.workInsights.employeeStats(
                ctx.organizationId,
                user,
                employeeId,
              );
            } catch {
              out.work = null;
              out.workNote = 'Không đọc được work stats (scope/permission).';
            }
          }

          if (assistantHasAllPermissions(ctx, [ASSISTANT_PERMISSIONS.USE, 'lead.read'])) {
            try {
              out.sales = await this.employees.getPerformance(ctx.organizationId, employeeId, {
                from: iso.from,
                to: iso.to,
              });
            } catch {
              out.sales = null;
            }
          }

          return okTool(ctx, ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY, out, {
            range,
            evidence: [
              {
                label: 'has_work_block',
                value: out.work ? 1 : 0,
              },
              {
                label: 'has_sales_block',
                value: out.sales ? 1 : 0,
              },
            ],
            links: [
              {
                rel: 'employee',
                label: String((profile as { name?: string }).name ?? employeeId),
                href: `/hrm/employees/${employeeId}`,
                entityType: 'employee',
                entityId: employeeId,
                requiredPermission: 'hrm.employee.read',
              },
            ],
          });
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(
              ctx,
              ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY,
              (e as Error).message,
            );
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.HRM_GET_EMPLOYEE_SUMMARY);
        }
      },
    });
  }

  private registerAds(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.ADS_LIST_ACCOUNTS,
      description: 'Tài khoản Ads đã kết nối (AdsMcpGateway, DB only).',
      permissions: perms(ASSISTANT_TOOLS.ADS_LIST_ACCOUNTS),
      mutates: false,
      argsSchema: emptyArgsSchema,
      handler: async (ctx) => {
        try {
          const mcpCtx = tenantFromAuthUser(authUserFromToolContext(ctx));
          const result = await this.adsMcp.listAccounts(mcpCtx);
          const accounts = Array.isArray(result)
            ? result
            : ((result as { accounts?: unknown[] })?.accounts ??
              (result as { items?: unknown[] })?.items ??
              []);
          if (!accounts.length) {
            return emptyTool(ctx, ASSISTANT_TOOLS.ADS_LIST_ACCOUNTS, 'Chưa có tài khoản ads');
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.ADS_LIST_ACCOUNTS,
            { accounts },
            {
              source: 'AdsMcpGateway',
              evidence: [{ label: 'accounts', value: accounts.length }],
              links: [{ rel: 'list', label: 'Ads', href: '/ads', entityType: 'ads_campaign' }],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.ADS_LIST_ACCOUNTS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS,
      description: 'Chiến dịch FB/Google theo period (AdsMcpGateway.listCampaigns).',
      permissions: perms(ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS);
          const mcpCtx = tenantFromAuthUser(authUserFromToolContext(ctx));
          const result = await this.adsMcp.listCampaigns(mcpCtx, {
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            platform: typeof args.platform === 'string' ? args.platform : undefined,
            limit: clampLimit(args.limit),
          });
          const campaigns = Array.isArray(result)
            ? result
            : ((result as { campaigns?: unknown[] })?.campaigns ??
              (result as { items?: unknown[] })?.items ??
              []);
          if (!campaigns.length) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS,
              `Không có campaign trong ${range.label}`,
            );
          }
          return okTool(
            ctx,
            ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS,
            { campaigns },
            {
              range,
              source: 'AdsMcpGateway',
              evidence: [{ label: 'campaigns', value: campaigns.length }],
              links: [{ rel: 'list', label: 'Ads', href: '/ads', entityType: 'ads_campaign' }],
            },
          );
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.ADS_GET_METRICS,
      description: 'Tổng metrics Ads (spend, clicks, ROAS…) theo period — DB, không gọi Meta.',
      permissions: perms(ASSISTANT_TOOLS.ADS_GET_METRICS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const range = parsePeriodArgs(args, ctx, ASSISTANT_TOOLS.ADS_GET_METRICS);
          const mcpCtx = tenantFromAuthUser(authUserFromToolContext(ctx));
          const metrics = await this.adsMcp.getMetrics(mcpCtx, {
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            platform: typeof args.platform === 'string' ? args.platform : undefined,
          });
          const m = metrics as Record<string, unknown>;
          return okTool(ctx, ASSISTANT_TOOLS.ADS_GET_METRICS, metrics, {
            range,
            source: 'AdsMcpGateway',
            evidence: [
              { label: 'spend', value: decimalish(m.spend ?? m.totalSpend), unit: 'VND' },
              { label: 'impressions', value: decimalish(m.impressions) },
              { label: 'clicks', value: decimalish(m.clicks) },
              { label: 'conversions', value: decimalish(m.conversions) },
              { label: 'roas', value: decimalish(m.roas) },
            ],
            links: [{ rel: 'report', label: 'Ads metrics', href: '/ads', entityType: 'report' }],
          });
        } catch (e) {
          if ((e as { assistantValidation?: boolean })?.assistantValidation) {
            return validationTool(ctx, ASSISTANT_TOOLS.ADS_GET_METRICS, (e as Error).message);
          }
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.ADS_GET_METRICS);
        }
      },
    });
  }

  private registerInbox(registry: AssistantToolRegistry) {
    registry.register({
      name: ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS,
      description:
        'Hội thoại Fanpage/web. Phân biệt fanpage (pageId/pageName) + khách (psid/name). unreadOnly? pageId?',
      permissions: perms(ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const limit = clampLimit(args.limit, 50);
          const page = await this.cskh.listConversations(ctx.organizationId, limit);
          const rows = page.items;
          const pageId =
            typeof args.pageId === 'string'
              ? args.pageId
              : typeof args.fanpagePageId === 'string'
                ? args.fanpagePageId
                : undefined;
          const unreadOnly = Boolean(args.unreadOnly);

          let items = rows.map((c) => summarizeConversation(c as Record<string, unknown>));
          if (pageId) {
            items = items.filter((c) => c.fanpagePageId === pageId);
          }
          if (unreadOnly) {
            items = items.filter((c) => c.needsReply);
          }

          if (!items.length) {
            return emptyTool(
              ctx,
              ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS,
              unreadOnly
                ? 'Không có hội thoại chưa trả lời'
                : pageId
                  ? `Không có hội thoại Fanpage ${pageId}`
                  : 'Không có hội thoại',
            );
          }

          return okTool(
            ctx,
            ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS,
            {
              total: items.length,
              items,
              note: 'Mỗi item gắn fanpage.pageId/pageName + customer.psid — không trộn chéo Fanpage.',
            },
            {
              evidence: [
                { label: 'conversations', value: items.length },
                {
                  label: 'needs_reply',
                  value: items.filter((i) => i.needsReply).length,
                },
              ],
              links: [
                {
                  rel: 'list',
                  label: 'Inbox CSKH',
                  href: '/chatbot-cskh?tab=inbox',
                  entityType: 'conversation',
                },
                ...items.slice(0, 8).map((c) => ({
                  rel: 'conversation' as const,
                  label: `${c.customerName} · ${c.fanpageName ?? c.fanpagePageId ?? 'web'}`,
                  href: `/chatbot-cskh?tab=inbox&conversationId=${c.id}`,
                  entityType: 'conversation',
                  entityId: c.id,
                  requiredPermission: ASSISTANT_PERMISSIONS.INBOX_READ,
                })),
              ],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.INBOX_GET_CONVERSATION,
      description: 'Chi tiết hội thoại + preview tin nhắn (mask PII). Gắn đúng Fanpage.',
      permissions: perms(ASSISTANT_TOOLS.INBOX_GET_CONVERSATION),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx, args) => {
        try {
          const id = String(args.conversationId ?? args.id ?? '');
          if (!id) {
            return validationTool(
              ctx,
              ASSISTANT_TOOLS.INBOX_GET_CONVERSATION,
              'Thiếu conversationId',
            );
          }
          const conv = (await this.cskh.getConversation(ctx.organizationId, id)) as Record<
            string,
            unknown
          >;
          // Tenant hard check
          if (conv.organizationId && conv.organizationId !== ctx.organizationId) {
            throw new ForbiddenException('assistant_tenant_mismatch');
          }
          const messages = Array.isArray(conv.messages) ? conv.messages : [];
          const preview = messages.slice(-20).map((m) => {
            const row = m as Record<string, unknown>;
            return {
              id: row.id,
              role: row.role,
              direction: row.direction,
              senderType: row.senderType,
              createdAt: row.createdAt,
              messagePreview: maskSensitiveText(String(row.message ?? ''), 160),
            };
          });
          const fanpage = conv.fanpage as Record<string, unknown> | null;
          const customer = conv.customer as Record<string, unknown> | null;
          const data = {
            id: conv.id,
            status: conv.status,
            channel: conv.channel,
            humanTakeover: conv.humanTakeover,
            fanpage: fanpage
              ? {
                  pageId: fanpage.pageId ?? conv.channelRef,
                  pageName: fanpage.pageName ?? null,
                }
              : null,
            customer: {
              name: customer?.name ?? conv.visitorName,
              psid: customer?.psid ?? conv.externalUserId,
              phone: conv.visitorPhone,
            },
            messageCount: messages.length,
            messages: preview,
          };
          return okTool(ctx, ASSISTANT_TOOLS.INBOX_GET_CONVERSATION, data, {
            evidence: [
              { label: 'messages', value: messages.length },
              {
                label: 'fanpage_bound',
                value: fanpage?.pageId || conv.channelRef ? 1 : 0,
              },
            ],
            links: [
              {
                rel: 'conversation',
                label: 'Mở hội thoại',
                href: `/chatbot-cskh?tab=inbox&conversationId=${id}`,
                entityType: 'conversation',
                entityId: id,
                requiredPermission: ASSISTANT_PERMISSIONS.INBOX_READ,
              },
            ],
          });
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.INBOX_GET_CONVERSATION);
        }
      },
    });

    registry.register({
      name: ASSISTANT_TOOLS.INBOX_PAGE_STATS,
      description: 'Thống kê hội thoại theo từng Fanpage (pageId) + overview org.',
      permissions: perms(ASSISTANT_TOOLS.INBOX_PAGE_STATS),
      mutates: false,
      argsSchema: looseObjectArgsSchema,
      handler: async (ctx) => {
        try {
          const [overview, pages, conversationPage] = await Promise.all([
            this.cskh.getOverview(ctx.organizationId),
            this.cskh.listFacebookPages(ctx.organizationId),
            this.cskh.listConversations(ctx.organizationId, 200),
          ]);
          const conversations = conversationPage.items;

          const byPage = new Map<
            string,
            {
              pageId: string;
              pageName: string | null;
              conversations: number;
              needsReply: number;
              open: number;
            }
          >();

          for (const p of pages as Array<Record<string, unknown>>) {
            const pageId = String(p.pageId ?? '');
            if (!pageId) continue;
            byPage.set(pageId, {
              pageId,
              pageName: (p.pageName as string) ?? null,
              conversations: 0,
              needsReply: 0,
              open: 0,
            });
          }

          for (const c of conversations) {
            const s = summarizeConversation(c as Record<string, unknown>);
            if (!s.fanpagePageId) continue;
            let row = byPage.get(s.fanpagePageId);
            if (!row) {
              row = {
                pageId: s.fanpagePageId,
                pageName: s.fanpageName,
                conversations: 0,
                needsReply: 0,
                open: 0,
              };
              byPage.set(s.fanpagePageId, row);
            }
            row.conversations += 1;
            if (s.needsReply) row.needsReply += 1;
            if (s.status === 'OPEN') row.open += 1;
            if (!row.pageName && s.fanpageName) row.pageName = s.fanpageName;
          }

          const pageStats = [...byPage.values()].sort((a, b) => b.conversations - a.conversations);
          if (
            !pageStats.length &&
            !(overview as { conversationsTotal?: number }).conversationsTotal
          ) {
            return emptyTool(ctx, ASSISTANT_TOOLS.INBOX_PAGE_STATS, 'Chưa có hội thoại Fanpage');
          }

          return okTool(
            ctx,
            ASSISTANT_TOOLS.INBOX_PAGE_STATS,
            {
              overview: {
                conversationsTotal: (overview as { conversationsTotal?: number })
                  .conversationsTotal,
                leadsToday: (overview as { leadsToday?: number }).leadsToday,
              },
              byFanpage: pageStats,
            },
            {
              evidence: [
                {
                  label: 'fanpages',
                  value: pageStats.length,
                },
                {
                  label: 'conversations_total',
                  value: (overview as { conversationsTotal?: number }).conversationsTotal ?? 0,
                },
                {
                  label: 'needs_reply_total',
                  value: pageStats.reduce((s, p) => s + p.needsReply, 0),
                },
              ],
              links: [
                {
                  rel: 'list',
                  label: 'Inbox',
                  href: '/chatbot-cskh?tab=inbox',
                  entityType: 'conversation',
                },
              ],
            },
          );
        } catch (e) {
          return mapDomainError(e, ctx, ASSISTANT_TOOLS.INBOX_PAGE_STATS);
        }
      },
    });
  }
}

function perms(name: AssistantToolName): readonly string[] {
  return assistantToolPermissionMap[name] ?? [ASSISTANT_PERMISSIONS.USE];
}

function summarizeConversation(c: Record<string, unknown>) {
  const fanpage = c.fanpage as Record<string, unknown> | null | undefined;
  const customer = c.customer as Record<string, unknown> | null | undefined;
  const messages = Array.isArray(c.messages) ? c.messages : [];
  const last = (messages[0] ?? messages[messages.length - 1]) as
    Record<string, unknown> | undefined;
  const lastRole = last?.role as string | undefined;
  const lastDirection = last?.direction as string | undefined;
  const lastSender = last?.senderType as string | undefined;
  const needsReply =
    c.status === 'OPEN' &&
    (lastDirection === 'INBOUND' ||
      lastRole === 'user' ||
      lastSender === 'CUSTOMER' ||
      Boolean(c.lastUserMessageAt && !c.humanTakeover));

  const lastPreview = last?.message != null ? maskSensitiveText(String(last.message), 120) : null;

  return {
    id: String(c.id),
    status: c.status as string,
    channel: c.channel as string,
    humanTakeover: Boolean(c.humanTakeover),
    updatedAt: c.updatedAt,
    lastUserMessageAt: c.lastUserMessageAt,
    fanpagePageId: (fanpage?.pageId as string) || (c.channelRef as string) || null,
    fanpageName: (fanpage?.pageName as string) || null,
    customerName: (customer?.name as string) || (c.visitorName as string) || null,
    customerPsid: (customer?.psid as string) || (c.externalUserId as string) || null,
    visitorPhone: c.visitorPhone ?? null,
    lastMessagePreview: lastPreview,
    needsReply,
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
