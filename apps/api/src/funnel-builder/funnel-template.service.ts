import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import {
  DEFAULT_FUNNEL_TEMPLATES,
  parseFunnelTemplateDefinition,
  templateDefinitionToBlueprintDraft,
  type FunnelTemplateDefinition,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FunnelBuilderService } from './funnel-builder.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  ApplyFunnelTemplateDto,
  CloneFunnelTemplateDto,
  ListFunnelTemplatesQueryDto,
  UpdateFunnelTemplateDto,
} from './dto/funnel-template.dto';

@Injectable()
export class FunnelTemplateService implements OnModuleInit {
  private readonly logger = new Logger(FunnelTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly funnelBuilder: FunnelBuilderService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSystemTemplates();
    } catch (err) {
      this.logger.warn(`ensureSystemTemplates skipped: ${String(err)}`);
    }
  }

  /** Idempotent seed of 10 system templates from shared catalog */
  async ensureSystemTemplates() {
    for (const def of DEFAULT_FUNNEL_TEMPLATES) {
      const existing = await this.prisma.funnelTemplate.findFirst({
        where: { organizationId: null, isSystem: true, slug: def.slug },
      });
      const payload = this.toRowData(def, {
        organizationId: null,
        isSystem: true,
        sourceTemplateId: null,
      });
      if (existing) {
        await this.prisma.funnelTemplate.update({
          where: { id: existing.id },
          data: {
            ...payload,
            version: existing.version,
            updatedAt: new Date(),
          },
        });
      } else {
        await this.prisma.funnelTemplate.create({ data: payload });
      }
    }
    return { synced: DEFAULT_FUNNEL_TEMPLATES.length };
  }

  async list(organizationId: string, query: ListFunnelTemplatesQueryDto) {
    await this.ensureSystemTemplates();
    const includeSystem = query.orgOnly === true ? false : query.includeSystem !== false;

    const items = await this.prisma.funnelTemplate.findMany({
      where: {
        isActive: true,
        ...(query.category ? { category: query.category } : {}),
        OR: [
          ...(includeSystem ? [{ organizationId: null, isSystem: true }] : []),
          { organizationId },
        ],
      },
      orderBy: [{ isSystem: 'desc' }, { category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        organizationId: true,
        sourceTemplateId: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        goal: true,
        requiredInputs: true,
        isSystem: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { clones: true } },
      },
    });

    return { items };
  }

  async get(organizationId: string, idOrSlug: string) {
    await this.ensureSystemTemplates();
    const row = await this.prisma.funnelTemplate.findFirst({
      where: {
        OR: [
          { id: idOrSlug, organizationId: null, isSystem: true },
          { id: idOrSlug, organizationId },
          { slug: idOrSlug, organizationId: null, isSystem: true },
          { slug: idOrSlug, organizationId },
        ],
      },
    });
    if (!row) throw new NotFoundException('Funnel template not found');
    return this.serialize(row);
  }

  async clone(user: AuthUser, idOrSlug: string, dto: CloneFunnelTemplateDto) {
    const source = await this.getOwnedOrSystem(user.organizationId, idOrSlug);
    const def = parseFunnelTemplateDefinition(source.definition);
    const slugBase = (dto.slug ?? `${def.slug}-copy`).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const slug = await this.uniqueOrgSlug(user.organizationId, slugBase);
    const name = dto.name ?? `${def.name} (org)`;

    const customized = this.applyInputValues(def, dto.inputValues);
    const row = await this.prisma.funnelTemplate.create({
      data: this.toRowData(
        { ...customized, slug, name },
        {
          organizationId: user.organizationId,
          isSystem: false,
          sourceTemplateId: source.id,
          createdById: user.id,
        },
      ),
    });

    return this.serialize(row);
  }

  async update(user: AuthUser, id: string, dto: UpdateFunnelTemplateDto) {
    const existing = await this.prisma.funnelTemplate.findFirst({
      where: { id, organizationId: user.organizationId, isSystem: false },
    });
    if (!existing) {
      throw new NotFoundException('Chỉ chỉnh được template đã clone về tổ chức');
    }

    let definition = parseFunnelTemplateDefinition(existing.definition);
    if (dto.definition) {
      definition = parseFunnelTemplateDefinition({
        ...definition,
        ...dto.definition,
        slug: definition.slug,
      });
    } else {
      definition = parseFunnelTemplateDefinition({
        ...definition,
        name: dto.name ?? definition.name,
        description: dto.description ?? definition.description,
        category: dto.category ?? definition.category,
        tags: dto.tags ?? definition.tags,
        goal: dto.goal ?? definition.goal,
        requiredInputs: dto.requiredInputs ?? definition.requiredInputs,
        nodes: dto.nodes ?? definition.nodes,
        connections: dto.connections ?? definition.connections,
        recommendedAutomation:
          dto.recommendedAutomation ?? definition.recommendedAutomation,
      });
    }

    const updated = await this.prisma.funnelTemplate.update({
      where: { id },
      data: {
        name: definition.name,
        description: definition.description,
        category: definition.category,
        tags: definition.tags,
        goal: definition.goal as Prisma.InputJsonValue,
        requiredInputs: definition.requiredInputs as Prisma.InputJsonValue,
        nodes: definition.nodes as Prisma.InputJsonValue,
        connections: definition.connections as Prisma.InputJsonValue,
        recommendedAutomation: definition.recommendedAutomation as Prisma.InputJsonValue,
        definition: definition as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive ?? existing.isActive,
        version: existing.version + 1,
      },
    });

    return this.serialize(updated);
  }

  async discard(organizationId: string, id: string) {
    const existing = await this.prisma.funnelTemplate.findFirst({
      where: { id, organizationId, isSystem: false },
    });
    if (!existing) throw new NotFoundException('Org template not found');
    return this.prisma.funnelTemplate.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });
  }

  /**
   * Clone-if-needed → create blueprint from template → apply stages/flows via FunnelBuilderService
   */
  async apply(
    user: AuthUser,
    idOrSlug: string,
    dto: ApplyFunnelTemplateDto,
    canActivateFlows: boolean,
  ) {
    let template = await this.prisma.funnelTemplate.findFirst({
      where: {
        OR: [
          { id: idOrSlug, organizationId: user.organizationId },
          { slug: idOrSlug, organizationId: user.organizationId },
        ],
        isActive: true,
      },
    });

    if (!template) {
      // Auto-clone system template then apply
      const cloned = await this.clone(user, idOrSlug, {
        inputValues: dto.inputValues,
        name: dto.pipelineName,
      });
      template = await this.prisma.funnelTemplate.findFirstOrThrow({
        where: { id: cloned.id },
      });
    }

    const def = this.applyInputValues(
      parseFunnelTemplateDefinition(template.definition),
      dto.inputValues,
    );
    const draft = templateDefinitionToBlueprintDraft(def, {
      name: dto.pipelineName ?? def.name,
      includeAutomations: dto.applyFlows !== false,
    });

    const applied = await this.funnelBuilder.apply(
      user,
      {
        draft: draft as unknown as Record<string, unknown>,
        applyStages: dto.applyStages !== false,
        applyFlows: dto.applyFlows !== false,
        activateFlows: dto.activateFlows === true,
        deactivateMissingStages: dto.deactivateMissingStages === true,
      },
      canActivateFlows,
    );

    return {
      templateId: template.id,
      templateSlug: template.slug,
      ...applied,
    };
  }

  private async getOwnedOrSystem(organizationId: string, idOrSlug: string) {
    const row = await this.prisma.funnelTemplate.findFirst({
      where: {
        isActive: true,
        OR: [
          { id: idOrSlug, organizationId: null, isSystem: true },
          { id: idOrSlug, organizationId },
          { slug: idOrSlug, organizationId: null, isSystem: true },
          { slug: idOrSlug, organizationId },
        ],
      },
    });
    if (!row) throw new NotFoundException('Funnel template not found');
    return row;
  }

  private async uniqueOrgSlug(organizationId: string, base: string) {
    let slug = base.slice(0, 56) || 'template';
    let i = 0;
    while (true) {
      const candidate = i === 0 ? slug : `${slug}-${i}`;
      const hit = await this.prisma.funnelTemplate.findFirst({
        where: { organizationId, slug: candidate },
        select: { id: true },
      });
      if (!hit) return candidate;
      i += 1;
      if (i > 50) throw new BadRequestException('Không tạo được slug template');
    }
  }

  private applyInputValues(
    def: FunnelTemplateDefinition,
    values?: Record<string, unknown>,
  ): FunnelTemplateDefinition {
    if (!values || Object.keys(values).length === 0) return def;
    const filled = def.requiredInputs.map((input) => ({
      ...input,
      helpText:
        values[input.key] != null
          ? `Giá trị: ${String(values[input.key])}`
          : input.helpText,
    }));
    const summaryBits = def.requiredInputs
      .filter((i) => values[i.key] != null)
      .map((i) => `${i.label}: ${String(values[i.key])}`);
    return parseFunnelTemplateDefinition({
      ...def,
      requiredInputs: filled,
      description: [def.description, summaryBits.length ? summaryBits.join(' · ') : null]
        .filter(Boolean)
        .join(' — '),
    });
  }

  private toRowData(
    def: FunnelTemplateDefinition,
    meta: {
      organizationId: string | null;
      isSystem: boolean;
      sourceTemplateId: string | null;
      createdById?: string;
    },
  ) {
    return {
      organizationId: meta.organizationId,
      sourceTemplateId: meta.sourceTemplateId,
      createdById: meta.createdById,
      slug: def.slug,
      name: def.name,
      description: def.description,
      category: def.category,
      tags: def.tags ?? [],
      goal: def.goal as unknown as Prisma.InputJsonValue,
      requiredInputs: def.requiredInputs as unknown as Prisma.InputJsonValue,
      nodes: def.nodes as unknown as Prisma.InputJsonValue,
      connections: def.connections as unknown as Prisma.InputJsonValue,
      recommendedAutomation: def.recommendedAutomation as unknown as Prisma.InputJsonValue,
      definition: def as unknown as Prisma.InputJsonValue,
      isSystem: meta.isSystem,
      isActive: true,
    };
  }

  private serialize(row: {
    id: string;
    organizationId: string | null;
    sourceTemplateId: string | null;
    createdById?: string | null;
    slug: string;
    name: string;
    description: string | null;
    category: string | null;
    tags: string[];
    goal: Prisma.JsonValue;
    requiredInputs: Prisma.JsonValue;
    nodes: Prisma.JsonValue;
    connections: Prisma.JsonValue;
    recommendedAutomation: Prisma.JsonValue;
    definition: Prisma.JsonValue;
    isSystem: boolean;
    isActive: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      sourceTemplateId: row.sourceTemplateId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: row.tags,
      goal: row.goal,
      requiredInputs: row.requiredInputs,
      nodes: row.nodes,
      connections: row.connections,
      recommendedAutomation: row.recommendedAutomation,
      definition: row.definition,
      isSystem: row.isSystem,
      isActive: row.isActive,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      canEdit: !row.isSystem && !!row.organizationId,
    };
  }
}
