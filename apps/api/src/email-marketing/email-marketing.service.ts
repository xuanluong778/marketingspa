import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  EmailAutomationAction,
  EmailAutomationStatus,
  EmailAutomationTrigger,
  EmailCampaignStatus,
  EmailContactStatus,
  EmailDomainStatus,
  EmailEventType,
  EmailRecipientStatus,
  EmailSuppressionReason,
  LeadPipelineStatus,
  Prisma,
  type AutomationTriggerType,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { EmailMarketingQueueService } from './email-marketing-queue.service';
import { normalizeEmail, renderEmailMerge, type SegmentRules } from './email-marketing.util';
import { parseContactSpreadsheet, parseTagList } from './email-spreadsheet.util';
import { OpenAiService } from '../openai/openai.service';
import { CreditService } from '../credit/credit.service';
import { CREDIT_FEATURE_CODES } from '@marketingspa/shared';
import { createEmailProvider } from '@marketingspa/shared/dist/email-providers/create';
import {
  formatEmailSendError,
  getEmailProviderHealth,
  sesFromEmail,
  sesNotConfiguredMessage,
} from '@marketingspa/shared';
import {
  getSesDomainIdentity,
  provisionSesDomainIdentity,
  sesDkimCnameRecords,
} from '@marketingspa/shared/dist/email-providers/ses-identity';
import {
  buildDomainDnsRecords,
  checkDomainDns,
  fromEmailMatchesDomain,
  isValidSenderDomain,
  normalizeSenderDomain,
  type DkimCname,
} from './email-domain-dns.util';
import {
  isAllowedSnsSubscribeUrl,
  type ParsedSesEvent,
} from './ses-webhook.util';
import { authenticateSesWebhook } from './ses-webhook-security';
import type {
  AddListMemberDto,
  CampaignQueryDto,
  CampaignRecipientQueryDto,
  ContactQueryDto,
  CreateEmailAutomationDto,
  CreateEmailAutomationFromRecipeDto,
  CreateEmailCampaignDto,
  CreateEmailContactDto,
  CreateEmailListDto,
  CreateEmailSegmentDto,
  CreateEmailSuppressionDto,
  CreateEmailTemplateDto,
  CreateSenderDomainDto,
  EmailSearchQueryDto,
  ScheduleEmailCampaignDto,
  SendTestEmailDto,
  UpdateEmailAutomationDto,
  UpdateEmailCampaignDto,
  UpdateEmailContactDto,
  UpdateEmailTemplateDto,
  UpdateSenderDomainDto,
} from './dto/email-marketing.dto';
import { EMAIL_AUTOMATION_RECIPES, findEmailRecipe } from './email-automation-recipes';
import {
  compilePresetHtml,
  PRESET_EMAIL_TEMPLATES,
  presetCategoryKey,
  type PresetTemplateCategory,
} from './email-preset-templates';

const WELCOME_DEDUPE_TRIGGERS = new Set<EmailAutomationTrigger>([
  EmailAutomationTrigger.NEW_LEAD,
  EmailAutomationTrigger.FUNNEL_SIGNUP,
  EmailAutomationTrigger.NEW_CONTACT,
]);

type AutomationRow = {
  id: string;
  name: string;
  trigger: EmailAutomationTrigger;
  templateId: string | null;
  listId: string | null;
  delayMinutes: number;
  action: EmailAutomationAction;
  scoreDelta: number;
  targetStage: string | null;
  waitDays: number;
  recipeId: string | null;
};

const CONTACT_LIST_INCLUDE = {
  listMembers: { include: { list: { select: { id: true, name: true } } } },
} as const;

const CRM_STAGE_FALLBACK: Record<string, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Tiềm năng',
  BOOKED: 'Đã đặt lịch',
  CONFIRMED: 'Đã xác nhận',
  VISITED: 'Đã đến',
  PURCHASED: 'Đã mua',
  LOST: 'Mất',
};

type AudienceUpsert = {
  email: string;
  name?: string | null;
  phone?: string | null;
  source?: string | null;
  tags?: string[];
  crmStage?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  listId?: string | null;
  listName?: string | null;
};

function mergeTags(current: string[] | undefined, incoming: string[] | undefined): string[] {
  return [...new Set([...(current ?? []), ...(incoming ?? [])].map((t) => t.trim()).filter(Boolean))];
}

const EDITABLE_CAMPAIGN: EmailCampaignStatus[] = [
  EmailCampaignStatus.DRAFT,
  EmailCampaignStatus.PAUSED,
  EmailCampaignStatus.SCHEDULED,
];

@Injectable()
export class EmailMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: EmailMarketingQueueService,
    private readonly openAi: OpenAiService,
    private readonly credit: CreditService,
  ) {}

  private async scopedCampaign(organizationId: string, id: string) {
    const row = await this.prisma.emailCampaign.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy chiến dịch email');
    return row;
  }

  private async scopedTemplate(organizationId: string, id: string) {
    const row = await this.prisma.emailTemplate.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy mẫu email');
    return row;
  }

  private async scopedContact(organizationId: string, id: string) {
    const row = await this.prisma.emailContact.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy liên hệ email');
    return row;
  }

  async overview(organizationId: string) {
    const [
      contacts,
      subscribed,
      lists,
      templates,
      campaigns,
      running,
      suppressions,
      domains,
      sentAgg,
      openAgg,
      clickAgg,
    ] = await Promise.all([
      this.prisma.emailContact.count({ where: { organizationId } }),
      this.prisma.emailContact.count({
        where: { organizationId, status: EmailContactStatus.SUBSCRIBED },
      }),
      this.prisma.emailList.count({ where: { organizationId } }),
      this.prisma.emailTemplate.count({ where: { organizationId, isActive: true } }),
      this.prisma.emailCampaign.count({ where: { organizationId } }),
      this.prisma.emailCampaign.count({
        where: { organizationId, status: EmailCampaignStatus.RUNNING },
      }),
      this.prisma.emailSuppression.count({ where: { organizationId } }),
      this.prisma.emailSenderDomain.count({ where: { organizationId } }),
      this.prisma.emailCampaign.aggregate({
        where: { organizationId },
        _sum: { sentCount: true, openCount: true, clickCount: true },
      }),
      this.prisma.emailEvent.count({ where: { organizationId, type: EmailEventType.OPEN } }),
      this.prisma.emailEvent.count({ where: { organizationId, type: EmailEventType.CLICK } }),
    ]);

    const sent = sentAgg._sum.sentCount ?? 0;
    const opened = sentAgg._sum.openCount ?? 0;
    return {
      contacts,
      subscribed,
      lists,
      templates,
      campaigns,
      running,
      suppressions,
      domains,
      sent,
      opened,
      clicked: sentAgg._sum.clickCount ?? 0,
      openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
      clickRate: sent > 0 ? Math.round(((sentAgg._sum.clickCount ?? 0) / sent) * 1000) / 10 : 0,
      eventsOpen: openAgg,
      eventsClick: clickAgg,
    };
  }

  async reports(organizationId: string) {
    const campaigns = await this.prisma.emailCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        openCount: true,
        clickCount: true,
        bounceCount: true,
        failCount: true,
        unsubscribeCount: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });

    const eventGroups = await this.prisma.emailEvent.groupBy({
      by: ['type'],
      where: { organizationId },
      _count: { _all: true },
    });

    return {
      campaigns: campaigns.map((c) => withCampaignRates(c)),
      events: eventGroups.map((g) => ({ type: g.type, count: g._count._all })),
    };
  }

  // --- Templates ---
  async listTemplates(organizationId: string, query: EmailSearchQueryDto) {
    await this.ensurePresetTemplates(organizationId);
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailTemplateWhereInput = { organizationId };
    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }
    const [items, total] = await Promise.all([
      this.prisma.emailTemplate.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.prisma.emailTemplate.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createTemplate(organizationId: string, dto: CreateEmailTemplateDto, userId?: string) {
    return this.prisma.emailTemplate.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        subject: dto.subject.trim(),
        previewText: dto.previewText?.trim() || null,
        htmlBody: dto.htmlBody,
        textBody: dto.textBody ?? null,
        category: dto.category?.trim() || null,
        isActive: dto.isActive ?? true,
        createdByUserId: userId ?? null,
      },
    });
  }

  async updateTemplate(organizationId: string, id: string, dto: UpdateEmailTemplateDto) {
    await this.scopedTemplate(organizationId, id);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.subject != null ? { subject: dto.subject.trim() } : {}),
        ...(dto.previewText !== undefined ? { previewText: dto.previewText?.trim() || null } : {}),
        ...(dto.htmlBody != null ? { htmlBody: dto.htmlBody } : {}),
        ...(dto.textBody !== undefined ? { textBody: dto.textBody } : {}),
        ...(dto.category !== undefined ? { category: dto.category?.trim() || null } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteTemplate(organizationId: string, id: string) {
    await this.scopedTemplate(organizationId, id);
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // --- Contacts ---
  async listContacts(organizationId: string, query: ContactQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailContactWhereInput = { organizationId };
    if (query.status) where.status = query.status;
    if (query.source?.trim()) where.source = query.source.trim();
    if (query.crmStage?.trim()) where.crmStage = query.crmStage.trim();
    if (query.tag?.trim()) where.tags = { has: query.tag.trim() };
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { source: { contains: q, mode: 'insensitive' } },
        { crmStage: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ];
    }
    if (query.listId) {
      where.listMembers = { some: { listId: query.listId, organizationId } };
    }
    const [items, total] = await Promise.all([
      this.prisma.emailContact.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { ...CONTACT_LIST_INCLUDE, _count: { select: { listMembers: true } } },
      }),
      this.prisma.emailContact.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  async contactFacets(organizationId: string) {
    const [contacts, lists] = await Promise.all([
      this.prisma.emailContact.findMany({
        where: { organizationId },
        select: { tags: true, source: true, crmStage: true },
        take: 5000,
      }),
      this.prisma.emailList.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { members: true } } },
      }),
    ]);
    const tags = [...new Set(contacts.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'vi'));
    const sources = [...new Set(contacts.map((c) => c.source).filter((s): s is string => !!s))].sort((a, b) =>
      a.localeCompare(b, 'vi'),
    );
    const crmStages = [
      ...new Set(contacts.map((c) => c.crmStage).filter((s): s is string => !!s)),
    ].sort((a, b) => a.localeCompare(b, 'vi'));
    return { tags, sources, crmStages, lists };
  }

  async createContact(organizationId: string, dto: CreateEmailContactDto) {
    const contact = await this.upsertAudienceContact(
      organizationId,
      {
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        source: dto.source || 'Thêm tay',
        tags: parseTagList(dto.tags),
        crmStage: dto.crmStage,
        listId: dto.listId,
      },
      { failIfExists: true, fireAutomation: true },
    );
    if (!contact) throw new BadRequestException('Email không hợp lệ');
    return this.prisma.emailContact.findFirstOrThrow({
      where: { id: contact.id, organizationId },
      include: CONTACT_LIST_INCLUDE,
    });
  }

  async updateContact(organizationId: string, id: string, dto: UpdateEmailContactDto) {
    const current = await this.scopedContact(organizationId, id);
    const data: Prisma.EmailContactUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.source !== undefined) data.source = dto.source?.trim() || null;
    if (dto.crmStage !== undefined) data.crmStage = dto.crmStage?.trim() || null;
    if (dto.tags) data.tags = parseTagList(dto.tags);
    if (dto.status) {
      data.status = dto.status;
      data.unsubscribedAt = dto.status === EmailContactStatus.UNSUBSCRIBED ? new Date() : null;
    }
    if (dto.customFields) data.customFields = dto.customFields as Prisma.InputJsonValue;
    await this.prisma.emailContact.update({ where: { id: current.id }, data });
    if (dto.listId) {
      await this.addListMember(organizationId, dto.listId, { contactId: current.id });
    }
    return this.prisma.emailContact.findFirstOrThrow({
      where: { id: current.id, organizationId },
      include: CONTACT_LIST_INCLUDE,
    });
  }

  async deleteContact(organizationId: string, id: string) {
    await this.scopedContact(organizationId, id);
    await this.prisma.emailContact.delete({ where: { id } });
    return { ok: true };
  }

  async previewAudience(organizationId: string, listId?: string) {
    if (listId) {
      const list = await this.prisma.emailList.findFirst({ where: { id: listId, organizationId } });
      if (!list) throw new NotFoundException('Không tìm thấy nhóm');
    }
    const suppressed = await this.prisma.emailSuppression.findMany({
      where: { organizationId },
      select: { email: true },
    });
    const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));

    const contacts = listId
      ? (
          await this.prisma.emailListMember.findMany({
            where: { organizationId, listId },
            include: { contact: { select: { email: true, status: true } } },
          })
        ).map((m) => m.contact)
      : await this.prisma.emailContact.findMany({
          where: { organizationId },
          select: { email: true, status: true },
        });

    let eligible = 0;
    let skippedSuppressed = 0;
    let skippedUnsubscribed = 0;
    for (const c of contacts) {
      if (c.status !== EmailContactStatus.SUBSCRIBED) {
        skippedUnsubscribed += 1;
        continue;
      }
      if (suppressedSet.has(c.email.toLowerCase())) {
        skippedSuppressed += 1;
        continue;
      }
      eligible += 1;
    }
    return {
      eligible,
      skippedSuppressed,
      skippedUnsubscribed,
      total: contacts.length,
      listId: listId ?? null,
    };
  }

  async importFromCustomers(organizationId: string) {
    return this.syncFromCrm(organizationId);
  }

  async syncFromCrm(organizationId: string) {
    const [customers, leads] = await Promise.all([
      this.prisma.customer.findMany({
        where: { organizationId, isActive: true, email: { not: null } },
        select: { id: true, email: true, name: true, phone: true, tags: true, leadSource: { select: { name: true } } },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, email: { not: null } },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          tags: true,
          customerId: true,
          pipelineStatus: true,
          funnelRecommendationId: true,
          leadSource: { select: { name: true } },
          stage: { select: { name: true } },
        },
      }),
    ]);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const lead of leads) {
      const result = await this.upsertAudienceContact(organizationId, {
        email: lead.email || '',
        name: lead.name,
        phone: lead.phone,
        source: lead.leadSource?.name || (lead.funnelRecommendationId ? 'Funnel' : 'CRM'),
        tags: lead.tags,
        crmStage: lead.stage?.name || CRM_STAGE_FALLBACK[lead.pipelineStatus] || lead.pipelineStatus,
        leadId: lead.id,
        customerId: lead.customerId,
      });
      if (!result) {
        skipped += 1;
        continue;
      }
      if (result.created) imported += 1;
      else updated += 1;
    }

    for (const c of customers) {
      const result = await this.upsertAudienceContact(organizationId, {
        email: c.email || '',
        name: c.name,
        phone: c.phone,
        source: c.leadSource?.name || 'CRM',
        tags: c.tags,
        customerId: c.id,
      });
      if (!result) {
        skipped += 1;
        continue;
      }
      if (result.created) imported += 1;
      else updated += 1;
    }

    return {
      imported,
      updated,
      skipped,
      scanned: customers.length + leads.length,
    };
  }

  async importSpreadsheet(
    organizationId: string,
    file: Express.Multer.File | undefined,
    listId?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Hãy chọn file CSV hoặc Excel');
    let rows;
    try {
      rows = parseContactSpreadsheet(file);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Không đọc được file');
    }
    if (!rows.length) throw new BadRequestException('File không có dữ liệu (cần dòng tiêu đề + ít nhất 1 khách)');
    if (rows.length > 2000) throw new BadRequestException('Tối đa 2.000 dòng mỗi lần nhập');

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      const result = await this.upsertAudienceContact(organizationId, {
        email: row.email || '',
        name: row.name,
        phone: row.phone,
        source: row.source || 'Excel',
        tags: parseTagList(row.tags),
        listId,
        listName: row.listName,
      });
      if (!result) {
        skipped += 1;
        continue;
      }
      if (result.created) imported += 1;
      else updated += 1;
    }
    return { imported, updated, skipped, scanned: rows.length };
  }

  private async upsertAudienceContact(
    organizationId: string,
    row: AudienceUpsert,
    opts?: { failIfExists?: boolean; fireAutomation?: boolean },
  ): Promise<{ id: string; created: boolean } | null> {
    const email = normalizeEmail(row.email || '');
    if (!email || !email.includes('@')) return null;

    const existing = await this.prisma.emailContact.findFirst({
      where: { organizationId, email },
    });
    if (existing && opts?.failIfExists) {
      throw new BadRequestException('Email đã tồn tại trong danh bạ tổ chức này');
    }

    const tags = parseTagList(row.tags);
    let contactId: string;
    let created = false;
    if (existing) {
      contactId = existing.id;
      await this.prisma.emailContact.update({
        where: { id: existing.id },
        data: {
          name: row.name?.trim() || existing.name,
          phone: row.phone?.trim() || existing.phone,
          source: row.source?.trim() || existing.source,
          crmStage: row.crmStage?.trim() || existing.crmStage,
          tags: mergeTags(existing.tags, tags),
          customerId: row.customerId || existing.customerId,
          leadId: row.leadId || existing.leadId,
        },
      });
    } else {
      created = true;
      const createdRow = await this.prisma.emailContact.create({
        data: {
          organizationId,
          email,
          name: row.name?.trim() || null,
          phone: row.phone?.trim() || null,
          source: row.source?.trim() || null,
          crmStage: row.crmStage?.trim() || null,
          tags,
          customerId: row.customerId || null,
          leadId: row.leadId || null,
        },
      });
      contactId = createdRow.id;
      if (opts?.fireAutomation) {
        await this.fireAutomations(organizationId, EmailAutomationTrigger.NEW_CONTACT, contactId);
      }
    }

    let targetListId = row.listId || null;
    if (!targetListId && row.listName?.trim()) {
      const found = await this.prisma.emailList.findFirst({
        where: { organizationId, name: { equals: row.listName.trim(), mode: 'insensitive' } },
      });
      if (found) targetListId = found.id;
      else {
        const createdList = await this.prisma.emailList.create({
          data: { organizationId, name: row.listName.trim() },
        });
        targetListId = createdList.id;
      }
    }
    if (targetListId) {
      const list = await this.prisma.emailList.findFirst({
        where: { id: targetListId, organizationId },
      });
      if (list) {
        await this.prisma.emailListMember.upsert({
          where: { listId_contactId: { listId: list.id, contactId } },
          create: { organizationId, listId: list.id, contactId },
          update: {},
        });
      }
    }
    return { id: contactId, created };
  }

  // --- Lists ---
  async listLists(organizationId: string, query: EmailSearchQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailListWhereInput = { organizationId };
    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }
    const [items, total] = await Promise.all([
      this.prisma.emailList.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.emailList.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createList(organizationId: string, dto: CreateEmailListDto) {
    return this.prisma.emailList.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      },
    });
  }

  async updateList(organizationId: string, id: string, dto: CreateEmailListDto) {
    const row = await this.prisma.emailList.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy danh sách');
    return this.prisma.emailList.update({
      where: { id },
      data: { name: dto.name.trim(), description: dto.description?.trim() || null },
    });
  }

  async deleteList(organizationId: string, id: string) {
    const row = await this.prisma.emailList.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy danh sách');
    await this.prisma.emailList.delete({ where: { id } });
    return { ok: true };
  }

  async listMembers(organizationId: string, listId: string, query: EmailSearchQueryDto) {
    const list = await this.prisma.emailList.findFirst({ where: { id: listId, organizationId } });
    if (!list) throw new NotFoundException('Không tìm thấy danh sách');
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailListMemberWhereInput = { organizationId, listId };
    const [items, total] = await Promise.all([
      this.prisma.emailListMember.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { contact: true },
      }),
      this.prisma.emailListMember.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  async addListMember(organizationId: string, listId: string, dto: AddListMemberDto) {
    const list = await this.prisma.emailList.findFirst({ where: { id: listId, organizationId } });
    if (!list) throw new NotFoundException('Không tìm thấy danh sách');

    let contactId = dto.contactId;
    if (!contactId) {
      if (!dto.email) throw new BadRequestException('Cần contactId hoặc email');
      const email = normalizeEmail(dto.email);
      const contact = await this.prisma.emailContact.upsert({
        where: { organizationId_email: { organizationId, email } },
        create: { organizationId, email, name: dto.name?.trim() || null },
        update: dto.name ? { name: dto.name.trim() } : {},
      });
      contactId = contact.id;
    } else {
      await this.scopedContact(organizationId, contactId);
    }

    const member = await this.prisma.emailListMember.upsert({
      where: { listId_contactId: { listId, contactId } },
      create: { organizationId, listId, contactId },
      update: {},
      include: { contact: true },
    });
    await this.fireAutomations(organizationId, EmailAutomationTrigger.LIST_JOIN, contactId, listId);
    return member;
  }

  async removeListMember(organizationId: string, listId: string, contactId: string) {
    const member = await this.prisma.emailListMember.findFirst({
      where: { organizationId, listId, contactId },
    });
    if (!member) throw new NotFoundException('Không tìm thấy thành viên');
    await this.prisma.emailListMember.delete({ where: { id: member.id } });
    return { ok: true };
  }

  // --- Segments ---
  async listSegments(organizationId: string, query: EmailSearchQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailSegmentWhereInput = { organizationId };
    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }
    const [items, total] = await Promise.all([
      this.prisma.emailSegment.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.prisma.emailSegment.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createSegment(organizationId: string, dto: CreateEmailSegmentDto) {
    return this.prisma.emailSegment.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        rules: (dto.rules ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updateSegment(organizationId: string, id: string, dto: CreateEmailSegmentDto) {
    const row = await this.prisma.emailSegment.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy phân khúc');
    return this.prisma.emailSegment.update({
      where: { id },
      data: { name: dto.name.trim(), rules: (dto.rules ?? {}) as Prisma.InputJsonValue },
    });
  }

  async deleteSegment(organizationId: string, id: string) {
    const row = await this.prisma.emailSegment.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy phân khúc');
    await this.prisma.emailSegment.delete({ where: { id } });
    return { ok: true };
  }

  // --- Campaigns ---
  async listCampaigns(organizationId: string, query: CampaignQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailCampaignWhereInput = { organizationId };
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.emailCampaign.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { id: true, name: true } },
          list: { select: { id: true, name: true } },
          segment: { select: { id: true, name: true } },
          senderDomain: { select: { id: true, domain: true, fromEmail: true } },
        },
      }),
      this.prisma.emailCampaign.count({ where }),
    ]);
    return buildPaginatedResult(items.map((row) => withCampaignRates(row)), total, page, pageSize);
  }

  async getCampaign(organizationId: string, id: string) {
    const row = await this.prisma.emailCampaign.findFirst({
      where: { id, organizationId },
      include: {
        template: true,
        list: { select: { id: true, name: true } },
        segment: { select: { id: true, name: true } },
        senderDomain: true,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy chiến dịch email');
    return withCampaignRates(row);
  }

  async createCampaign(organizationId: string, dto: CreateEmailCampaignDto, userId?: string) {
    await this.assertAudience(organizationId, dto.templateId, dto.listId, dto.segmentId, dto.senderDomainId);
    return this.prisma.emailCampaign.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        subject: dto.subject?.trim() || null,
        templateId: dto.templateId ?? null,
        listId: dto.listId ?? null,
        segmentId: dto.segmentId ?? null,
        senderDomainId: dto.senderDomainId ?? null,
        createdByUserId: userId ?? null,
      },
    });
  }

  async updateCampaign(organizationId: string, id: string, dto: UpdateEmailCampaignDto) {
    const campaign = await this.scopedCampaign(organizationId, id);
    if (!EDITABLE_CAMPAIGN.includes(campaign.status)) {
      throw new BadRequestException('Chỉ sửa chiến dịch nháp, tạm dừng hoặc đã lên lịch');
    }
    await this.assertAudience(
      organizationId,
      dto.templateId ?? campaign.templateId,
      dto.listId ?? campaign.listId,
      dto.segmentId ?? campaign.segmentId,
      dto.senderDomainId ?? campaign.senderDomainId,
    );
    return this.prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject?.trim() || null } : {}),
        ...(dto.templateId !== undefined ? { templateId: dto.templateId } : {}),
        ...(dto.listId !== undefined ? { listId: dto.listId } : {}),
        ...(dto.segmentId !== undefined ? { segmentId: dto.segmentId } : {}),
        ...(dto.senderDomainId !== undefined ? { senderDomainId: dto.senderDomainId } : {}),
      },
    });
  }

  async deleteCampaign(organizationId: string, id: string) {
    const campaign = await this.scopedCampaign(organizationId, id);
    if (campaign.status === EmailCampaignStatus.RUNNING) {
      throw new BadRequestException('Không xóa chiến dịch đang chạy — hãy hủy trước');
    }
    await this.prisma.emailCampaign.delete({ where: { id } });
    return { ok: true };
  }

  async sendCampaign(organizationId: string, id: string) {
    const campaign = await this.scopedCampaign(organizationId, id);
    if (!EDITABLE_CAMPAIGN.includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch không thể gửi ở trạng thái hiện tại');
    }
    if (!campaign.templateId) throw new BadRequestException('Chiến dịch cần mẫu email');
    await this.prisma.emailCampaign.update({
      where: { id },
      data: { status: EmailCampaignStatus.RUNNING, startedAt: new Date(), scheduledAt: null },
    });
    await this.queue.enqueuePlan(organizationId, id);
    return this.getCampaign(organizationId, id);
  }

  async scheduleCampaign(organizationId: string, id: string, dto: ScheduleEmailCampaignDto) {
    const campaign = await this.scopedCampaign(organizationId, id);
    if (!EDITABLE_CAMPAIGN.includes(campaign.status)) {
      throw new BadRequestException('Không lên lịch được chiến dịch này');
    }
    const when = new Date(dto.scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new BadRequestException('Thời điểm gửi phải ở tương lai');
    }
    if (!campaign.templateId) throw new BadRequestException('Chiến dịch cần mẫu email');
    return this.prisma.emailCampaign.update({
      where: { id },
      data: { status: EmailCampaignStatus.SCHEDULED, scheduledAt: when },
    });
  }

  async pauseCampaign(organizationId: string, id: string) {
    const campaign = await this.scopedCampaign(organizationId, id);
    if (campaign.status !== EmailCampaignStatus.RUNNING) {
      throw new BadRequestException('Chỉ tạm dừng chiến dịch đang chạy');
    }
    return this.prisma.emailCampaign.update({
      where: { id },
      data: { status: EmailCampaignStatus.PAUSED },
    });
  }

  async cancelCampaign(organizationId: string, id: string) {
    const campaign = await this.scopedCampaign(organizationId, id);
    if (campaign.status === EmailCampaignStatus.COMPLETED) {
      throw new BadRequestException('Chiến dịch đã hoàn thành');
    }
    return this.prisma.emailCampaign.update({
      where: { id },
      data: { status: EmailCampaignStatus.CANCELLED, completedAt: new Date() },
    });
  }

  async listRecipients(organizationId: string, campaignId: string, query: CampaignRecipientQueryDto) {
    await this.scopedCampaign(organizationId, campaignId);
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailCampaignRecipientWhereInput = { organizationId, campaignId };
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { contact: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (query.metric === 'sent') where.sentAt = { not: null };
    else if (query.metric === 'delivered') where.deliveredAt = { not: null };
    else if (query.metric === 'opened') where.openedAt = { not: null };
    else if (query.metric === 'clicked') where.clickedAt = { not: null };
    else if (query.metric === 'bounced') where.status = EmailRecipientStatus.BOUNCED;
    else if (query.metric === 'unsubscribed') where.status = EmailRecipientStatus.UNSUBSCRIBED;

    const orderBy: Prisma.EmailCampaignRecipientOrderByWithRelationInput =
      query.metric === 'opened'
        ? { openedAt: 'desc' }
        : query.metric === 'clicked'
          ? { clickedAt: 'desc' }
          : query.metric === 'delivered'
            ? { deliveredAt: 'desc' }
            : query.metric === 'bounced'
              ? { bouncedAt: 'desc' }
              : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.emailCampaignRecipient.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { contact: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.emailCampaignRecipient.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  // --- Suppressions / domains / automations ---
  async listSuppressions(organizationId: string, query: EmailSearchQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.EmailSuppressionWhereInput = { organizationId };
    if (query.search?.trim()) {
      where.email = { contains: query.search.trim(), mode: 'insensitive' };
    }
    const [items, total] = await Promise.all([
      this.prisma.emailSuppression.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.emailSuppression.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createSuppression(organizationId: string, dto: CreateEmailSuppressionDto) {
    const email = normalizeEmail(dto.email);
    return this.prisma.emailSuppression.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: {
        organizationId,
        email,
        reason: dto.reason ?? EmailSuppressionReason.MANUAL,
        note: dto.note ?? null,
      },
      update: {
        reason: dto.reason ?? EmailSuppressionReason.MANUAL,
        note: dto.note ?? null,
      },
    });
  }

  async deleteSuppression(organizationId: string, id: string) {
    const row = await this.prisma.emailSuppression.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy suppression');
    await this.prisma.emailSuppression.delete({ where: { id } });
    return { ok: true };
  }

  async listDomains(organizationId: string) {
    const rows = await this.prisma.emailSenderDomain.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.presentSenderDomain(row));
  }

  async createDomain(organizationId: string, dto: CreateSenderDomainDto) {
    const domain = normalizeSenderDomain(dto.domain);
    if (!isValidSenderDomain(domain)) {
      throw new BadRequestException('Tên miền chưa đúng. Ví dụ: spaabc.com');
    }
    const fromName = dto.fromName.trim();
    const fromEmail = normalizeEmail(dto.fromEmail);
    if (!fromEmailMatchesDomain(fromEmail, domain)) {
      throw new BadRequestException(`Email gửi đi phải kết thúc bằng @${domain}`);
    }
    const replyTo = dto.replyTo ? normalizeEmail(dto.replyTo) : null;
    const existing = await this.prisma.emailSenderDomain.findFirst({
      where: { organizationId, domain },
    });
    if (existing) throw new BadRequestException('Tên miền này đã được thêm');

    const ses = await Promise.race([
      provisionSesDomainIdentity(domain).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
    const dkimCnames = sesDkimCnameRecords(domain, ses?.tokens ?? []);
    const spfValue = 'v=spf1 include:amazonses.com ~all';
    const dmarcValue = 'v=DMARC1; p=none;';

    try {
      const row = await this.prisma.emailSenderDomain.create({
        data: {
          organizationId,
          domain,
          fromName,
          fromEmail,
          replyTo,
          dkimHost: dkimCnames[0]?.host ? `${dkimCnames[0].host}.${domain}` : `mail._domainkey.${domain}`,
          dkimValue: dkimCnames[0]?.value ?? null,
          spfValue,
          dmarcHost: `_dmarc.${domain}`,
          dmarcValue,
          dkimRecords: dkimCnames as unknown as Prisma.InputJsonValue,
        },
      });
      return this.presentSenderDomain(row);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Tên miền này đã được thêm');
      }
      throw err;
    }
  }

  async updateDomain(organizationId: string, id: string, dto: UpdateSenderDomainDto) {
    const current = await this.prisma.emailSenderDomain.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Không tìm thấy tên miền gửi');
    const fromEmail = dto.fromEmail ? normalizeEmail(dto.fromEmail) : current.fromEmail;
    if (!fromEmailMatchesDomain(fromEmail, current.domain)) {
      throw new BadRequestException(`Email gửi đi phải kết thúc bằng @${current.domain}`);
    }
    const row = await this.prisma.emailSenderDomain.update({
      where: { id },
      data: {
        ...(dto.fromName != null ? { fromName: dto.fromName.trim() } : {}),
        ...(dto.fromEmail !== undefined ? { fromEmail } : {}),
        ...(dto.replyTo !== undefined ? { replyTo: dto.replyTo ? normalizeEmail(dto.replyTo) : null } : {}),
      },
    });
    return this.presentSenderDomain(row);
  }

  async verifyDomain(organizationId: string, id: string) {
    return this.checkDomain(organizationId, id);
  }

  async checkDomain(organizationId: string, id: string) {
    const row = await this.prisma.emailSenderDomain.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy tên miền gửi');
    const dkimRecords = parseDkimRecords(row.dkimRecords);
    const [dns, ses] = await Promise.all([
      checkDomainDns({ domain: row.domain, dkimRecords }),
      Promise.race([
        getSesDomainIdentity(row.domain).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ]),
    ]);
    const refreshed =
      !dkimRecords.length && ses?.tokens?.length ? sesDkimCnameRecords(row.domain, ses.tokens) : dkimRecords;
    const dkimVerified = dns.dkim || ses?.dkimStatus === 'SUCCESS';
    const sesVerified = ses?.verificationStatus === 'SUCCESS' || ses?.dkimStatus === 'SUCCESS';
    const allDns = dkimVerified && dns.spf && dns.dmarc;
    const domainVerified = sesVerified || (!ses && allDns);
    const failed = ses?.verificationStatus === 'FAILED' || ses?.dkimStatus === 'FAILED';
    const status = domainVerified
      ? EmailDomainStatus.VERIFIED
      : failed
        ? EmailDomainStatus.FAILED
        : EmailDomainStatus.PENDING;
    const updated = await this.prisma.emailSenderDomain.update({
      where: { id: row.id },
      data: {
        dkimRecords: refreshed as unknown as Prisma.InputJsonValue,
        dkimHost: refreshed[0]?.host ? `${refreshed[0].host}.${row.domain}` : row.dkimHost,
        dkimValue: refreshed[0]?.value ?? row.dkimValue,
        dkimVerified,
        spfVerified: dns.spf,
        dmarcVerified: dns.dmarc,
        lastCheckedAt: new Date(),
        status,
        verifiedAt: domainVerified ? row.verifiedAt ?? new Date() : row.verifiedAt,
      },
    });
    return this.presentSenderDomain(updated);
  }

  async deleteDomain(organizationId: string, id: string) {
    const row = await this.prisma.emailSenderDomain.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy tên miền gửi');
    await this.prisma.emailSenderDomain.delete({ where: { id } });
    return { ok: true };
  }

  private presentSenderDomain(row: {
    id: string;
    organizationId: string;
    domain: string;
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    status: EmailDomainStatus;
    dkimHost: string | null;
    dkimValue: string | null;
    spfValue: string | null;
    dmarcHost: string | null;
    dmarcValue: string | null;
    dkimRecords: Prisma.JsonValue;
    dkimVerified: boolean;
    spfVerified: boolean;
    dmarcVerified: boolean;
    lastCheckedAt: Date | null;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const dkimRecords = parseDkimRecords(row.dkimRecords);
    return {
      ...row,
      domainVerified: row.status === EmailDomainStatus.VERIFIED,
      dnsRecords: buildDomainDnsRecords({
        domain: row.domain,
        dkimRecords,
        spfValue: row.spfValue,
        dmarcValue: row.dmarcValue,
      }),
    };
  }

  async listAutomations(organizationId: string) {
    return this.prisma.emailAutomation.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      include: {
        template: { select: { id: true, name: true } },
        list: { select: { id: true, name: true } },
      },
    });
  }

  listAutomationRecipes(organizationId: string) {
    void organizationId;
    return EMAIL_AUTOMATION_RECIPES;
  }

  async listCrmStagesForAutomation(organizationId: string) {
    const stages = await this.prisma.funnelStage.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ pipelineId: 'asc' }, { position: 'asc' }],
      select: { id: true, name: true, code: true, legacyStatus: true },
    });
    if (stages.length) {
      return stages.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        legacyStatus: s.legacyStatus,
      }));
    }
    return (Object.keys(CRM_STAGE_FALLBACK) as LeadPipelineStatus[]).map((code) => ({
      id: code,
      code,
      name: CRM_STAGE_FALLBACK[code] ?? code,
      legacyStatus: code,
    }));
  }

  async createAutomationFromRecipe(
    organizationId: string,
    dto: CreateEmailAutomationFromRecipeDto,
  ) {
    const recipe = findEmailRecipe(dto.recipeId);
    if (!recipe) throw new BadRequestException('Không tìm thấy công thức tự động hóa');

    await this.ensurePresetTemplates(organizationId);

    let templateId = dto.templateId ?? null;
    if (recipe.needsTemplate && !templateId && recipe.defaultTemplateCategory) {
      templateId = await this.resolvePresetTemplateId(
        organizationId,
        recipe.defaultTemplateCategory,
      );
    }
    if (recipe.needsTemplate && !templateId) {
      throw new BadRequestException('Cần chọn mẫu email');
    }
    if (templateId) await this.scopedTemplate(organizationId, templateId);
    if (dto.listId) {
      const list = await this.prisma.emailList.findFirst({
        where: { id: dto.listId, organizationId },
      });
      if (!list) throw new NotFoundException('Không tìm thấy danh sách');
    }

    const data = {
      name: recipe.name,
      trigger: recipe.trigger as EmailAutomationTrigger,
      action: recipe.action as EmailAutomationAction,
      templateId,
      listId: dto.listId ?? null,
      waitDays: dto.waitDays ?? recipe.defaultWaitDays,
      scoreDelta: dto.scoreDelta ?? recipe.defaultScoreDelta,
      targetStage: dto.targetStage ?? recipe.defaultStage,
      recipeId: recipe.id,
      status:
        dto.activate === false
          ? EmailAutomationStatus.DRAFT
          : EmailAutomationStatus.ACTIVE,
    };

    const existing = await this.prisma.emailAutomation.findFirst({
      where: { organizationId, recipeId: recipe.id },
    });
    if (existing) {
      return this.prisma.emailAutomation.update({
        where: { id: existing.id },
        data,
        include: {
          template: { select: { id: true, name: true } },
          list: { select: { id: true, name: true } },
        },
      });
    }

    return this.prisma.emailAutomation.create({
      data: { organizationId, ...data },
      include: {
        template: { select: { id: true, name: true } },
        list: { select: { id: true, name: true } },
      },
    });
  }

  async createAutomation(organizationId: string, dto: CreateEmailAutomationDto) {
    if (dto.templateId) await this.scopedTemplate(organizationId, dto.templateId);
    if (dto.listId) {
      const list = await this.prisma.emailList.findFirst({
        where: { id: dto.listId, organizationId },
      });
      if (!list) throw new NotFoundException('Không tìm thấy danh sách');
    }
    return this.prisma.emailAutomation.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        trigger: dto.trigger,
        status: dto.status ?? EmailAutomationStatus.DRAFT,
        templateId: dto.templateId ?? null,
        listId: dto.listId ?? null,
        delayMinutes: dto.delayMinutes ?? 0,
        recipeId: dto.recipeId ?? null,
        action: dto.action ?? EmailAutomationAction.SEND_EMAIL,
        scoreDelta: dto.scoreDelta ?? 10,
        targetStage: dto.targetStage ?? null,
        waitDays: dto.waitDays ?? 2,
      },
    });
  }

  async updateAutomation(organizationId: string, id: string, dto: UpdateEmailAutomationDto) {
    const row = await this.prisma.emailAutomation.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy tự động hóa');
    return this.prisma.emailAutomation.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.trigger != null ? { trigger: dto.trigger } : {}),
        ...(dto.status != null ? { status: dto.status } : {}),
        ...(dto.templateId !== undefined ? { templateId: dto.templateId } : {}),
        ...(dto.listId !== undefined ? { listId: dto.listId } : {}),
        ...(dto.delayMinutes != null ? { delayMinutes: dto.delayMinutes } : {}),
        ...(dto.action != null ? { action: dto.action } : {}),
        ...(dto.scoreDelta != null ? { scoreDelta: dto.scoreDelta } : {}),
        ...(dto.targetStage !== undefined ? { targetStage: dto.targetStage } : {}),
        ...(dto.waitDays != null ? { waitDays: dto.waitDays } : {}),
      },
    });
  }

  async deleteAutomation(organizationId: string, id: string) {
    const row = await this.prisma.emailAutomation.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException('Không tìm thấy tự động hóa');
    await this.prisma.emailAutomation.delete({ where: { id } });
    return { ok: true };
  }

  async runAutomation(organizationId: string, id: string) {
    const automation = await this.prisma.emailAutomation.findFirst({
      where: { id, organizationId },
    });
    if (!automation) throw new NotFoundException('Không tìm thấy tự động hóa');
    if (!automation.templateId) throw new BadRequestException('Tự động hóa cần mẫu email');

    const contacts = automation.listId
      ? await this.prisma.emailContact.findMany({
          where: {
            organizationId,
            status: EmailContactStatus.SUBSCRIBED,
            listMembers: { some: { listId: automation.listId, organizationId } },
          },
        })
      : await this.prisma.emailContact.findMany({
          where: { organizationId, status: EmailContactStatus.SUBSCRIBED },
          take: 500,
        });

    let queued = 0;
    for (const contact of contacts) {
      await this.enqueueAutomationSend(organizationId, automation, contact.id, contact.email);
      queued += 1;
    }
    return { queued };
  }

  // --- Public tracking ---
  async unsubscribeByRecipient(recipientId: string) {
    if (!recipientId?.trim()) throw new NotFoundException('Liên kết hủy đăng ký không hợp lệ');
    const recipient = await this.prisma.emailCampaignRecipient.findFirst({
      where: { id: recipientId },
      include: { contact: true },
    });
    if (!recipient) throw new NotFoundException('Liên kết hủy đăng ký không hợp lệ');
    if (recipient.status === EmailRecipientStatus.UNSUBSCRIBED) {
      await this.upsertSuppression(
        recipient.organizationId,
        recipient.email,
        EmailSuppressionReason.UNSUBSCRIBE,
      );
      return { ok: true, email: recipient.email, already: true };
    }

    await this.prisma.emailContact.update({
      where: { id: recipient.contactId },
      data: { status: EmailContactStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    });
    await this.prisma.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: { status: EmailRecipientStatus.UNSUBSCRIBED },
    });
    await this.upsertSuppression(
      recipient.organizationId,
      recipient.email,
      EmailSuppressionReason.UNSUBSCRIBE,
    );
    const created = await this.ensureUniqueEvent(
      recipient,
      EmailEventType.UNSUBSCRIBE,
      { source: 'unsubscribe' },
    );
    if (created) {
      await this.prisma.emailCampaign.update({
        where: { id: recipient.campaignId },
        data: { unsubscribeCount: { increment: 1 } },
      });
    }
    return { ok: true, email: recipient.email };
  }

  async trackOpen(recipientId: string) {
    const recipient = await this.prisma.emailCampaignRecipient.findFirst({
      where: { id: recipientId },
    });
    if (!recipient) return false;
    if (recipient.openedAt) return false;
    if (
      recipient.status === EmailRecipientStatus.BOUNCED ||
      recipient.status === EmailRecipientStatus.FAILED ||
      recipient.status === EmailRecipientStatus.SKIPPED ||
      recipient.status === EmailRecipientStatus.UNSUBSCRIBED
    ) {
      return false;
    }
    await this.prisma.$transaction([
      this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          openedAt: new Date(),
          status:
            recipient.status === EmailRecipientStatus.CLICKED
              ? EmailRecipientStatus.CLICKED
              : EmailRecipientStatus.OPENED,
        },
      }),
      this.prisma.emailEvent.create({
        data: {
          organizationId: recipient.organizationId,
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          contactId: recipient.contactId,
          type: EmailEventType.OPEN,
        },
      }),
      this.prisma.emailCampaign.update({
        where: { id: recipient.campaignId },
        data: { openCount: { increment: 1 } },
      }),
    ]);
    void this.runEngagementAutomations(
      recipient.organizationId,
      EmailAutomationTrigger.EMAIL_OPENED,
      recipient.contactId,
    );
    return true;
  }

  async trackClick(recipientId: string, url?: string) {
    const recipient = await this.prisma.emailCampaignRecipient.findFirst({
      where: { id: recipientId },
    });
    if (!recipient) return url || '/';
    if (
      recipient.status === EmailRecipientStatus.BOUNCED ||
      recipient.status === EmailRecipientStatus.FAILED ||
      recipient.status === EmailRecipientStatus.UNSUBSCRIBED
    ) {
      return url || '/';
    }
    if (recipient.clickedAt) return url || '/';

    const implicitOpen = !recipient.openedAt;
    await this.prisma.$transaction([
      this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          clickedAt: new Date(),
          openedAt: recipient.openedAt ?? new Date(),
          status: EmailRecipientStatus.CLICKED,
        },
      }),
      this.prisma.emailEvent.create({
        data: {
          organizationId: recipient.organizationId,
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          contactId: recipient.contactId,
          type: EmailEventType.CLICK,
          metadata: { url: url ?? null } as Prisma.InputJsonValue,
        },
      }),
      ...(implicitOpen
        ? [
            this.prisma.emailEvent.create({
              data: {
                organizationId: recipient.organizationId,
                campaignId: recipient.campaignId,
                recipientId: recipient.id,
                contactId: recipient.contactId,
                type: EmailEventType.OPEN,
                metadata: { implicit: true } as Prisma.InputJsonValue,
              },
            }),
          ]
        : []),
      this.prisma.emailCampaign.update({
        where: { id: recipient.campaignId },
        data: {
          clickCount: { increment: 1 },
          ...(implicitOpen ? { openCount: { increment: 1 } } : {}),
        },
      }),
    ]);
    void this.runEngagementAutomations(
      recipient.organizationId,
      EmailAutomationTrigger.EMAIL_CLICKED,
      recipient.contactId,
    );
    if (implicitOpen) {
      void this.runEngagementAutomations(
        recipient.organizationId,
        EmailAutomationTrigger.EMAIL_OPENED,
        recipient.contactId,
      );
    }
    return url || '/';
  }

  async handleCrmTrigger(
    organizationId: string,
    triggerType: AutomationTriggerType,
    payload: {
      leadId?: string | null;
      customerId?: string | null;
      appointmentId?: string | null;
      context?: Record<string, string>;
    },
  ) {
    const emailTriggers = this.mapCrmToEmailTriggers(triggerType);
    if (!emailTriggers.length) return;

    let contactId: string | null = null;

    if (payload.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: payload.leadId, organizationId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          customerId: true,
          pipelineStatus: true,
          funnelRecommendationId: true,
          tags: true,
          leadSource: { select: { name: true } },
          stage: { select: { name: true } },
        },
      });
      if (!lead?.email?.trim()) return;

      const upserted = await this.upsertAudienceContact(organizationId, {
        email: lead.email,
        name: lead.name,
        phone: lead.phone,
        source: lead.leadSource?.name || (lead.funnelRecommendationId ? 'Funnel' : 'CRM'),
        tags: lead.tags,
        crmStage: lead.stage?.name || CRM_STAGE_FALLBACK[lead.pipelineStatus] || lead.pipelineStatus,
        leadId: lead.id,
        customerId: lead.customerId,
      });
      if (!upserted) return;
      contactId = upserted.id;

      for (const trigger of emailTriggers) {
        if (trigger === EmailAutomationTrigger.FUNNEL_SIGNUP && !lead.funnelRecommendationId) {
          continue;
        }
        await this.fireAutomations(organizationId, trigger, contactId);
      }
      return;
    }

    if (payload.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: payload.customerId, organizationId },
        select: { id: true, email: true, name: true, phone: true, tags: true, leadSource: { select: { name: true } } },
      });
      if (!customer?.email?.trim()) return;

      const upserted = await this.upsertAudienceContact(organizationId, {
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        source: customer.leadSource?.name || 'CRM',
        tags: customer.tags,
        customerId: customer.id,
      });
      if (!upserted) return;
      contactId = upserted.id;

      for (const trigger of emailTriggers) {
        await this.fireAutomations(organizationId, trigger, contactId);
      }
    }
  }

  private async assertAudience(
    organizationId: string,
    templateId?: string | null,
    listId?: string | null,
    segmentId?: string | null,
    senderDomainId?: string | null,
  ) {
    if (templateId) await this.scopedTemplate(organizationId, templateId);
    if (listId) {
      const list = await this.prisma.emailList.findFirst({ where: { id: listId, organizationId } });
      if (!list) throw new NotFoundException('Không tìm thấy danh sách');
    }
    if (segmentId) {
      const segment = await this.prisma.emailSegment.findFirst({
        where: { id: segmentId, organizationId },
      });
      if (!segment) throw new NotFoundException('Không tìm thấy phân khúc');
    }
    if (senderDomainId) {
      const domain = await this.prisma.emailSenderDomain.findFirst({
        where: { id: senderDomainId, organizationId },
      });
      if (!domain) throw new NotFoundException('Không tìm thấy tên miền gửi');
    }
  }

  private mapCrmToEmailTriggers(triggerType: AutomationTriggerType): EmailAutomationTrigger[] {
    switch (triggerType) {
      case 'LEAD_CREATED':
        return [EmailAutomationTrigger.NEW_LEAD, EmailAutomationTrigger.FUNNEL_SIGNUP];
      case 'BOOKING_CREATED':
      case 'APPOINTMENT_CREATED':
        return [EmailAutomationTrigger.BOOKING_CREATED];
      case 'PURCHASED':
      case 'ORDER_COMPLETED':
        return [EmailAutomationTrigger.PURCHASED];
      default:
        return [];
    }
  }

  private async ensurePresetTemplates(organizationId: string) {
    for (const preset of PRESET_EMAIL_TEMPLATES) {
      const category = presetCategoryKey(preset.category);
      const existing = await this.prisma.emailTemplate.findFirst({
        where: { organizationId, category },
      });
      if (existing) continue;
      await this.prisma.emailTemplate.create({
        data: {
          organizationId,
          name: preset.name,
          subject: preset.subject,
          previewText: preset.previewText,
          htmlBody: compilePresetHtml(preset),
          category,
          isActive: true,
        },
      });
    }
  }

  private async resolvePresetTemplateId(
    organizationId: string,
    category: PresetTemplateCategory,
  ): Promise<string | null> {
    await this.ensurePresetTemplates(organizationId);
    const row = await this.prisma.emailTemplate.findFirst({
      where: { organizationId, category: presetCategoryKey(category) },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async contactInList(organizationId: string, listId: string, contactId: string) {
    const member = await this.prisma.emailListMember.findFirst({
      where: { organizationId, listId, contactId },
    });
    return !!member;
  }

  private async ensureListMember(organizationId: string, listId: string, contactId: string) {
    await this.prisma.emailListMember.upsert({
      where: { listId_contactId: { listId, contactId } },
      create: { organizationId, listId, contactId },
      update: {},
    });
  }

  private async shouldSkipWelcomeSend(
    organizationId: string,
    automation: Pick<AutomationRow, 'trigger' | 'name'>,
    contactId: string,
  ) {
    if (!WELCOME_DEDUPE_TRIGGERS.has(automation.trigger)) return false;
    const campaignName = `[Tự động] ${automation.name}`;
    const existing = await this.prisma.emailCampaignRecipient.findFirst({
      where: {
        organizationId,
        contactId,
        campaign: { name: campaignName },
      },
      select: { id: true },
    });
    return !!existing;
  }

  private async resolveStageUpdate(organizationId: string, targetStage: string | null) {
    if (!targetStage?.trim()) return null;

    const byId = await this.prisma.funnelStage.findFirst({
      where: { id: targetStage, organizationId, isActive: true },
    });
    if (byId) {
      const pipelineStatus =
        byId.legacyStatus ??
        (Object.values(LeadPipelineStatus).includes(byId.code as LeadPipelineStatus)
          ? (byId.code as LeadPipelineStatus)
          : LeadPipelineStatus.CONTACTED);
      return {
        stageId: byId.id,
        pipelineStatus,
        crmStageLabel: byId.name,
      };
    }

    const code = targetStage as LeadPipelineStatus;
    if (Object.values(LeadPipelineStatus).includes(code)) {
      const stage = await this.prisma.funnelStage.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [{ legacyStatus: code }, { code: targetStage }],
        },
      });
      return {
        stageId: stage?.id ?? null,
        pipelineStatus: code,
        crmStageLabel: stage?.name ?? CRM_STAGE_FALLBACK[code] ?? code,
      };
    }

    return null;
  }

  private async applyLeadScore(organizationId: string, contactId: string, scoreDelta: number) {
    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, organizationId },
      select: { leadId: true },
    });
    if (!contact?.leadId) return;

    const lead = await this.prisma.lead.findFirst({
      where: { id: contact.leadId, organizationId },
      select: { score: true },
    });
    if (!lead) return;

    const nextScore = Math.max(0, Math.min(100, lead.score + scoreDelta));
    await this.prisma.lead.update({
      where: { id: contact.leadId },
      data: { score: nextScore },
    });
  }

  private async applyCrmStage(organizationId: string, contactId: string, targetStage: string | null) {
    const resolved = await this.resolveStageUpdate(organizationId, targetStage);
    if (!resolved) return;

    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, organizationId },
      select: { leadId: true },
    });

    if (contact?.leadId) {
      await this.prisma.lead.update({
        where: { id: contact.leadId },
        data: {
          pipelineStatus: resolved.pipelineStatus,
          ...(resolved.stageId ? { stageId: resolved.stageId } : {}),
        },
      });
    }

    await this.prisma.emailContact.update({
      where: { id: contactId },
      data: { crmStage: resolved.crmStageLabel },
    });
  }

  private async runEngagementAutomations(
    organizationId: string,
    trigger: EmailAutomationTrigger,
    contactId: string,
  ) {
    const automations = await this.prisma.emailAutomation.findMany({
      where: { organizationId, trigger, status: EmailAutomationStatus.ACTIVE },
    });
    if (!automations.length) return;

    for (const automation of automations) {
      if (automation.listId) {
        const inList = await this.contactInList(organizationId, automation.listId, contactId);
        if (!inList) continue;
      }
      if (automation.action === EmailAutomationAction.ADD_LEAD_SCORE) {
        await this.applyLeadScore(organizationId, contactId, automation.scoreDelta);
      } else if (automation.action === EmailAutomationAction.SET_CRM_STAGE) {
        await this.applyCrmStage(organizationId, contactId, automation.targetStage);
      }
    }
  }

  private async fireAutomations(
    organizationId: string,
    trigger: EmailAutomationTrigger,
    contactId: string,
    listId?: string,
  ) {
    const automations = await this.prisma.emailAutomation.findMany({
      where: {
        organizationId,
        trigger,
        status: EmailAutomationStatus.ACTIVE,
        ...(trigger === EmailAutomationTrigger.LIST_JOIN && listId ? { listId } : {}),
      },
    });
    if (!automations.length) return;

    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, organizationId },
    });
    if (!contact || contact.status !== EmailContactStatus.SUBSCRIBED) return;

    for (const automation of automations) {
      if (automation.action === EmailAutomationAction.SEND_EMAIL) {
        if (automation.listId) {
          await this.ensureListMember(organizationId, automation.listId, contactId);
        }
        if (await this.shouldSkipWelcomeSend(organizationId, automation, contactId)) continue;
        if (!automation.templateId) continue;
        await this.enqueueAutomationSend(organizationId, automation, contact.id, contact.email);
        continue;
      }

      if (automation.listId) {
        const inList = await this.contactInList(organizationId, automation.listId, contactId);
        if (!inList) continue;
      }

      if (automation.action === EmailAutomationAction.ADD_LEAD_SCORE) {
        await this.applyLeadScore(organizationId, contactId, automation.scoreDelta);
      } else if (automation.action === EmailAutomationAction.SET_CRM_STAGE) {
        await this.applyCrmStage(organizationId, contactId, automation.targetStage);
      }
    }
  }

  async scheduleNotOpenFollowups(organizationId: string, recipientId: string) {
    const automations = await this.prisma.emailAutomation.findMany({
      where: {
        organizationId,
        trigger: EmailAutomationTrigger.EMAIL_NOT_OPENED,
        status: EmailAutomationStatus.ACTIVE,
        action: EmailAutomationAction.SEND_EMAIL,
      },
    });
    if (!automations.length) return;

    for (const automation of automations) {
      if (!automation.templateId) continue;
      await this.queue.enqueueNotOpenFollowup(
        organizationId,
        automation.id,
        recipientId,
        automation.waitDays,
      );
    }
  }

  private async enqueueAutomationSend(
    organizationId: string,
    automation: Pick<AutomationRow, 'id' | 'name' | 'templateId' | 'delayMinutes'>,
    contactId: string,
    email: string,
  ) {
    if (!automation.templateId) return;
    const normalized = normalizeEmail(email);
    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, organizationId },
      select: { status: true },
    });
    if (contact && contact.status !== EmailContactStatus.SUBSCRIBED) return;
    const suppressed = await this.prisma.emailSuppression.findFirst({
      where: { organizationId, email: normalized },
    });
    if (suppressed) return;

    const campaign = await this.prisma.emailCampaign.create({
      data: {
        organizationId,
        name: `[Tự động] ${automation.name}`,
        templateId: automation.templateId,
        status: EmailCampaignStatus.RUNNING,
        startedAt: new Date(),
        totalRecipients: 1,
        queuedCount: 1,
      },
    });
    const recipient = await this.prisma.emailCampaignRecipient.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        contactId,
        email: normalized,
        status: EmailRecipientStatus.QUEUED,
        queuedAt: new Date(),
      },
    });
    await this.queue.enqueueSend(
      organizationId,
      campaign.id,
      recipient.id,
      Math.max(0, automation.delayMinutes) * 60_000,
    );
  }

  async generateEmailContent(organizationId: string, prompt: string) {
    if (!this.openAi.isConfigured()) {
      throw new ServiceUnavailableException('Chưa cấu hình AI. Liên hệ quản trị viên.');
    }
    return this.credit.runPaidFeature({
      organizationId,
      featureCode: CREDIT_FEATURE_CODES.EMAIL_AI_SUBJECT,
      referenceId: `email.ai:${organizationId}:${randomUUID()}`,
      reason: 'email AI generate',
      fn: async (ctx) => {
        ctx.markProviderStarted();
        const raw = await this.openAi.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `Bạn viết email marketing spa/clinic tiếng Việt, thân thiện, ngắn.
Chỉ trả JSON:
{"subject":"","previewText":"","heading":"","body":"","ctaLabel":"","ctaUrl":"","footer":""}
Quy tắc:
- subject tối đa 70 ký tự, previewText tối đa 90 ký tự.
- heading 1 câu, body 2-4 đoạn, có CTA rõ.
- Dùng {{firstName}}, {{email}}, {{company}} khi hợp lý (không bịa dữ liệu khách).
- ctaUrl luôn https://marketingautoaz.com trừ khi mô tả nêu link khác.
- footer 1-2 dòng, không spam.`,
        },
        { role: 'user', content: prompt.trim() },
      ],
      temperature: 0.6,
      maxTokens: 900,
      timeoutMs: 45_000,
    });
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const str = (key: string, fallback: string) => {
      const value = parsed[key];
      return typeof value === 'string' && value.trim() ? value.trim() : fallback;
    };
    return {
      subject: str('subject', `Ưu đãi dành cho bạn`).slice(0, 90),
      previewText: str('previewText', 'Mở email để xem ưu đãi trong tuần này.').slice(0, 120),
      heading: str('heading', 'Xin chào {{firstName}},'),
      body: str(
        'body',
        `Cảm ơn bạn đã quan tâm. Chúng tôi dành một ưu đãi ngắn cho {{firstName}} tại {{company}}.\n\n${prompt.trim()}`,
      ),
      ctaLabel: str('ctaLabel', 'Đặt lịch ngay'),
      ctaUrl: str('ctaUrl', 'https://marketingautoaz.com'),
      footer: str('footer', 'Bạn nhận email này vì đã để lại thông tin liên hệ.\n{{company}}'),
    };
      },
    });
  }

  async sendTestEmail(dto: SendTestEmailDto) {
    const to = normalizeEmail(dto.to);
    const health = getEmailProviderHealth();
    const provider = createEmailProvider();
    if (!provider.isConfigured()) {
      if (health.resolved === 'ses') {
        throw new BadRequestException(sesNotConfiguredMessage());
      }
      throw new BadRequestException('Chưa cấu hình SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    }
    const vars = {
      firstName: 'An',
      name: 'Nguyễn An',
      email: to,
      company: 'Spa An Nhiên',
    };
    const subject = renderEmailMerge(dto.subject, vars);
    const html = renderEmailMerge(dto.htmlBody, vars);
    const text =
      dto.previewText?.trim() ||
      `${subject}\n\nĐây là email thử. Biến mẫu: ${vars.firstName} / ${vars.email} / ${vars.company}`;
    const from =
      provider.name === 'ses'
        ? sesFromEmail()
        : (process.env.SMTP_FROM || '').trim() ||
          `MarketingAutoAZ <${(process.env.SMTP_USER || 'noreply@marketingautoaz.com').trim()}>`;
    try {
      await provider.send({
        to,
        from,
        subject: `[Thử] ${subject}`,
        html,
        text,
      });
    } catch (err) {
      throw new BadRequestException(formatEmailSendError(err, provider.name));
    }
    return { ok: true, to, provider: provider.name };
  }

  async handleSesEvent(
    input: unknown,
    opts?: { rawBody?: string; testSignatureHeader?: string },
  ) {
    const auth = await authenticateSesWebhook(input, opts);
    if (!auth.ok) {
      return { ok: false, reason: auth.reason, statusCode: auth.statusCode };
    }

    const event = auth.event;
    if (event.kind === 'sns_confirm') {
      if (event.subscribeUrl && isAllowedSnsSubscribeUrl(event.subscribeUrl)) {
        await fetch(event.subscribeUrl, { method: 'GET' });
        return { ok: true, subscribed: true };
      }
      return { ok: false, reason: 'invalid_subscribe_url', statusCode: 403 };
    }
    if (event.kind === 'ignored') return { ok: true, ignored: true, type: event.rawType };

    const recipients = await this.findRecipientsForSesEvent({
      messageId: event.messageId,
      recipientIds: event.recipientIds,
      campaignIds: event.campaignIds,
      emails: event.emails,
    });
    let updated = 0;
    for (const recipient of recipients) {
      const changed = await this.applySesEventToRecipient(recipient, event);
      if (changed) updated += 1;
    }

    const suppressKind =
      event.kind === 'bounce' || event.kind === 'complaint' || event.kind === 'unsubscribe'
        ? event.kind
        : null;
    let suppressed = 0;
    if (suppressKind) {
      suppressed = await this.suppressSesEmails(
        event.campaignIds,
        event.emails,
        recipients.map((r) => r.email),
        suppressKind,
      );
    }

    return { ok: true, type: event.kind, updated, suppressed };
  }

  private async applySesEventToRecipient(
    recipient: {
      id: string;
      organizationId: string;
      campaignId: string;
      contactId: string;
      email: string;
      status: EmailRecipientStatus;
      sentAt: Date | null;
      deliveredAt: Date | null;
      openedAt: Date | null;
      clickedAt: Date | null;
      providerMessageId: string | null;
    },
    event: ParsedSesEvent,
  ) {
    if (event.messageId && !recipient.providerMessageId) {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: { providerMessageId: event.messageId },
      });
    }

    if (event.kind === 'send') {
      return this.ensureUniqueEvent(recipient, EmailEventType.SENT, {
        source: 'ses',
        messageId: event.messageId ?? null,
      });
    }

    if (event.kind === 'delivery') {
      if (recipient.deliveredAt) return false;
      if (
        recipient.status === EmailRecipientStatus.BOUNCED ||
        recipient.status === EmailRecipientStatus.FAILED ||
        recipient.status === EmailRecipientStatus.UNSUBSCRIBED
      ) {
        return false;
      }
      await this.prisma.$transaction([
        this.prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            deliveredAt: new Date(),
            status:
              recipient.status === EmailRecipientStatus.OPENED ||
              recipient.status === EmailRecipientStatus.CLICKED
                ? recipient.status
                : EmailRecipientStatus.DELIVERED,
          },
        }),
        this.prisma.emailEvent.create({
          data: {
            organizationId: recipient.organizationId,
            campaignId: recipient.campaignId,
            recipientId: recipient.id,
            contactId: recipient.contactId,
            type: EmailEventType.DELIVERED,
            metadata: { messageId: event.messageId ?? null },
          },
        }),
        this.prisma.emailCampaign.update({
          where: { id: recipient.campaignId },
          data: { deliveredCount: { increment: 1 } },
        }),
      ]);
      return true;
    }

    if (event.kind === 'open') {
      return this.trackOpen(recipient.id);
    }
    if (event.kind === 'click') {
      const before = recipient.clickedAt;
      await this.trackClick(recipient.id, event.link);
      return !before;
    }
    if (event.kind === 'bounce' || event.kind === 'complaint') {
      return this.applyBounceOrComplaint(
        recipient,
        event.kind,
        event.messageId,
        event.permanent,
      );
    }
    if (event.kind === 'unsubscribe') {
      const result = await this.unsubscribeByRecipient(recipient.id);
      return !result.already;
    }
    return false;
  }

  private async applyBounceOrComplaint(
    recipient: {
      id: string;
      organizationId: string;
      campaignId: string;
      contactId: string;
      email: string;
      status: EmailRecipientStatus;
    },
    kind: 'bounce' | 'complaint',
    messageId?: string,
    permanent?: boolean,
  ) {
    const reason =
      kind === 'complaint' ? EmailSuppressionReason.COMPLAINT : EmailSuppressionReason.BOUNCE;
    await this.upsertSuppression(recipient.organizationId, recipient.email, reason);
    await this.markContactDoNotEmail(
      recipient.organizationId,
      recipient.contactId,
      kind === 'complaint' ? EmailContactStatus.UNSUBSCRIBED : EmailContactStatus.BOUNCED,
    );

    if (recipient.status === EmailRecipientStatus.BOUNCED && kind === 'bounce') return false;
    if (recipient.status === EmailRecipientStatus.UNSUBSCRIBED && kind === 'complaint') {
      await this.ensureUniqueEvent(recipient, EmailEventType.COMPLAINT, {
        messageId: messageId ?? null,
        permanent: true,
      });
      return false;
    }

    const alreadyBounced = recipient.status === EmailRecipientStatus.BOUNCED;
    if (!alreadyBounced) {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: EmailRecipientStatus.BOUNCED,
          bouncedAt: new Date(),
          lastError: kind === 'complaint' ? 'ses_complaint' : 'ses_bounce',
        },
      });
    }
    const created = await this.ensureUniqueEvent(
      recipient,
      kind === 'complaint' ? EmailEventType.COMPLAINT : EmailEventType.BOUNCE,
      { messageId: messageId ?? null, permanent: permanent ?? true },
    );
    if (created && !alreadyBounced) {
      await this.prisma.emailCampaign.update({
        where: { id: recipient.campaignId },
        data: { bounceCount: { increment: 1 } },
      });
    }
    return created || !alreadyBounced;
  }

  private async suppressSesEmails(
    campaignIds: string[] | undefined,
    emails: string[] | undefined,
    alreadyHandled: string[],
    kind: 'bounce' | 'complaint' | 'unsubscribe',
  ) {
    const remaining = (emails ?? []).filter(
      (email) => !alreadyHandled.map((e) => e.toLowerCase()).includes(email.toLowerCase()),
    );
    if (!remaining.length || !campaignIds?.length) return 0;
    const campaigns = await this.prisma.emailCampaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, organizationId: true },
    });
    if (!campaigns.length) return 0;

    const campaignOrgById = new Map(campaigns.map((c) => [c.id, c.organizationId]));

    const reason =
      kind === 'complaint'
        ? EmailSuppressionReason.COMPLAINT
        : kind === 'unsubscribe'
          ? EmailSuppressionReason.UNSUBSCRIBE
          : EmailSuppressionReason.BOUNCE;
    const contactStatus =
      kind === 'bounce' ? EmailContactStatus.BOUNCED : EmailContactStatus.UNSUBSCRIBED;

    let count = 0;
    for (const campaignId of campaignIds) {
      const organizationId = campaignOrgById.get(campaignId);
      if (!organizationId) continue;
      for (const email of remaining) {
        await this.upsertSuppression(organizationId, email, reason);
        const contact = await this.prisma.emailContact.findFirst({
          where: { organizationId, email },
          select: { id: true, status: true },
        });
        if (contact) {
          await this.markContactDoNotEmail(organizationId, contact.id, contactStatus);
        }
        count += 1;
      }
    }
    return count;
  }

  private async markContactDoNotEmail(
    organizationId: string,
    contactId: string,
    status: EmailContactStatus,
  ) {
    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, organizationId },
      select: { status: true },
    });
    if (!contact) return;
    if (contact.status === EmailContactStatus.UNSUBSCRIBED) return;
    await this.prisma.emailContact.update({
      where: { id: contactId },
      data: {
        status,
        unsubscribedAt: status === EmailContactStatus.UNSUBSCRIBED ? new Date() : undefined,
      },
    });
  }

  private async upsertSuppression(
    organizationId: string,
    email: string,
    reason: EmailSuppressionReason,
  ) {
    const normalized = normalizeEmail(email);
    const existing = await this.prisma.emailSuppression.findUnique({
      where: { organizationId_email: { organizationId, email: normalized } },
    });
    if (!existing) {
      await this.prisma.emailSuppression.create({
        data: { organizationId, email: normalized, reason },
      });
      return;
    }
    if (suppressionRank(reason) > suppressionRank(existing.reason)) {
      await this.prisma.emailSuppression.update({
        where: { id: existing.id },
        data: { reason },
      });
    }
  }

  private async ensureUniqueEvent(
    recipient: {
      id: string;
      organizationId: string;
      campaignId: string;
      contactId: string;
    },
    type: EmailEventType,
    metadata?: Prisma.InputJsonValue,
  ) {
    const exists = await this.prisma.emailEvent.findFirst({
      where: { recipientId: recipient.id, type },
      select: { id: true },
    });
    if (exists) return false;
    await this.prisma.emailEvent.create({
      data: {
        organizationId: recipient.organizationId,
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        contactId: recipient.contactId,
        type,
        metadata: metadata ?? {},
      },
    });
    return true;
  }

  private async findRecipientsForSesEvent(input: {
    messageId?: string;
    recipientIds?: string[];
    campaignIds?: string[];
    emails?: string[];
  }) {
    const tagCampaignIds = [...new Set((input.campaignIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const campaigns = tagCampaignIds.length
      ? await this.prisma.emailCampaign.findMany({
          where: { id: { in: tagCampaignIds } },
          select: { id: true, organizationId: true },
        })
      : [];
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));
    const validCampaignIds = campaigns.map((c) => c.id);
    const organizationIds = [...new Set(campaigns.map((c) => c.organizationId))];

    const tagRecipientIds = [...new Set((input.recipientIds ?? []).map((id) => id.trim()).filter(Boolean))];

    if (tagRecipientIds.length) {
      if (!validCampaignIds.length) return [];
      const rows = await this.prisma.emailCampaignRecipient.findMany({
        where: {
          id: { in: tagRecipientIds },
          campaignId: { in: validCampaignIds },
          organizationId: { in: organizationIds },
        },
      });
      return rows.filter((row) => {
        const campaign = campaignById.get(row.campaignId);
        if (!campaign) return false;
        if (row.organizationId !== campaign.organizationId) return false;
        if (tagCampaignIds.length && !tagCampaignIds.includes(row.campaignId)) return false;
        return true;
      });
    }

    if (input.messageId) {
      const where: Prisma.EmailCampaignRecipientWhereInput = {
        providerMessageId: input.messageId,
      };
      if (organizationIds.length === 1) {
        where.organizationId = organizationIds[0];
      } else if (organizationIds.length > 1) {
        where.organizationId = { in: organizationIds };
      }
      if (validCampaignIds.length) {
        where.campaignId = { in: validCampaignIds };
      }
      const byId = await this.prisma.emailCampaignRecipient.findMany({ where });
      if (byId.length) {
        return byId.filter((row) => {
          if (validCampaignIds.length && !validCampaignIds.includes(row.campaignId)) return false;
          const campaign = campaignById.get(row.campaignId);
          if (campaign && row.organizationId !== campaign.organizationId) return false;
          return true;
        });
      }
    }

    const cleaned = (input.emails || []).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (cleaned.length && validCampaignIds.length) {
      const rows = await this.prisma.emailCampaignRecipient.findMany({
        where: {
          campaignId: { in: validCampaignIds },
          organizationId: { in: organizationIds },
          email: { in: cleaned },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return rows.filter((row) => {
        const campaign = campaignById.get(row.campaignId);
        return campaign ? row.organizationId === campaign.organizationId : false;
      });
    }
    return [];
  }
}

/** Resolve contacts for a campaign list/segment (used by worker via duplicated query). */
export function segmentWhere(
  organizationId: string,
  rules: SegmentRules,
): Prisma.EmailContactWhereInput {
  const where: Prisma.EmailContactWhereInput = { organizationId };
  if (rules.status) where.status = rules.status;
  else where.status = EmailContactStatus.SUBSCRIBED;
  if (rules.listId) {
    where.listMembers = { some: { listId: rules.listId, organizationId } };
  }
  return where;
}

function parseDkimRecords(value: Prisma.JsonValue): DkimCname[] {
  if (!Array.isArray(value)) return [];
  const out: DkimCname[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const host = typeof (item as { host?: unknown }).host === 'string' ? (item as { host: string }).host : '';
    const recValue =
      typeof (item as { value?: unknown }).value === 'string' ? (item as { value: string }).value : '';
    if (host && recValue) out.push({ host, value: recValue });
  }
  return out;
}

function suppressionRank(reason: EmailSuppressionReason): number {
  if (reason === EmailSuppressionReason.COMPLAINT) return 3;
  if (reason === EmailSuppressionReason.UNSUBSCRIBE) return 2;
  if (reason === EmailSuppressionReason.BOUNCE) return 1;
  return 0;
}

function withCampaignRates<
  T extends {
    sentCount: number;
    openCount: number;
    clickCount: number;
    bounceCount: number;
    unsubscribeCount: number;
  },
>(row: T) {
  const sent = row.sentCount || 0;
  const pct = (n: number) => (sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0);
  return {
    ...row,
    openRate: pct(row.openCount),
    clickRate: pct(row.clickCount),
    bounceRate: pct(row.bounceCount),
    unsubscribeRate: pct(row.unsubscribeCount),
  };
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error('AI response is not JSON');
}
