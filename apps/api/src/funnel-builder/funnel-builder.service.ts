import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AutomationTriggerType,
  FunnelBlueprintStatus,
  MessageChannel,
  Prisma,
} from '@marketingspa/database';
import {
  buildDefaultFunnelBlueprintDraft,
  normalizeFunnelBlueprintDraft,
  parseFunnelBlueprintDraft,
  validateFunnelBlueprintDraft,
  type FunnelBlueprintDraft,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { PipelineService } from '../crm/pipeline.service';
import { AutomationService } from '../automation/automation.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  ApplyFunnelBlueprintDto,
  GenerateFunnelBlueprintDto,
  ListFunnelBlueprintsQueryDto,
} from './dto/funnel-builder.dto';

@Injectable()
export class FunnelBuilderService {
  private readonly logger = new Logger(FunnelBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiService,
    private readonly pipeline: PipelineService,
    private readonly automation: AutomationService,
  ) {}

  listBlueprints(organizationId: string, query: ListFunnelBlueprintsQueryDto) {
    return this.prisma.funnelBlueprint.findMany({
      where: {
        organizationId,
        ...(query.status && { status: query.status as FunnelBlueprintStatus }),
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 20,
      select: {
        id: true,
        name: true,
        prompt: true,
        status: true,
        source: true,
        summary: true,
        createdAt: true,
        appliedAt: true,
      },
    });
  }

  async getBlueprint(organizationId: string, id: string) {
    const row = await this.prisma.funnelBlueprint.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Funnel blueprint not found');
    return row;
  }

  async generate(user: AuthUser, dto: GenerateFunnelBlueprintDto) {
    const includeAutomations = dto.includeAutomations !== false;
    let draft: FunnelBlueprintDraft;
    let source: 'ai' | 'fallback' = 'fallback';

    try {
      if (this.openAi.isConfigured()) {
        draft = await this.generateWithAi(dto.prompt, dto.industryHint, includeAutomations);
        source = 'ai';
      } else {
        draft = normalizeFunnelBlueprintDraft(
          buildDefaultFunnelBlueprintDraft(dto.prompt, {
            industryHint: dto.industryHint,
            flows: includeAutomations
              ? undefined
              : [],
          }),
        );
        if (!includeAutomations) {
          draft = { ...draft, flows: [] };
        }
      }
    } catch (err) {
      this.logger.warn(`AI funnel generate failed, using fallback: ${String(err)}`);
      draft = normalizeFunnelBlueprintDraft(
        buildDefaultFunnelBlueprintDraft(dto.prompt, {
          industryHint: dto.industryHint,
        }),
      );
      if (!includeAutomations) draft = { ...draft, flows: [] };
      source = 'fallback';
    }

    draft = normalizeFunnelBlueprintDraft(draft);

    const row = await this.prisma.funnelBlueprint.create({
      data: {
        organizationId: user.organizationId,
        createdById: user.id,
        name: draft.name,
        prompt: dto.prompt,
        draft: draft as unknown as Prisma.InputJsonValue,
        status: FunnelBlueprintStatus.DRAFT,
        source,
        summary: draft.summary,
      },
    });

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      source: row.source,
      summary: row.summary,
      draft,
      createdAt: row.createdAt,
    };
  }

  async apply(user: AuthUser, dto: ApplyFunnelBlueprintDto, canActivateFlows: boolean) {
    const applyStages = dto.applyStages !== false;
    const applyFlows = dto.applyFlows !== false;

    let blueprintId = dto.blueprintId;
    let draft: FunnelBlueprintDraft;

    if (dto.blueprintId) {
      const row = await this.getBlueprint(user.organizationId, dto.blueprintId);
      draft = normalizeFunnelBlueprintDraft(parseFunnelBlueprintDraft(row.draft));
      blueprintId = row.id;
    } else if (dto.draft) {
      draft = normalizeFunnelBlueprintDraft(parseFunnelBlueprintDraft(dto.draft));
      const created = await this.prisma.funnelBlueprint.create({
        data: {
          organizationId: user.organizationId,
          createdById: user.id,
          name: draft.name,
          prompt: draft.summary ?? draft.name,
          draft: draft as unknown as Prisma.InputJsonValue,
          status: FunnelBlueprintStatus.DRAFT,
          source: 'manual',
          summary: draft.summary,
        },
      });
      blueprintId = created.id;
    } else {
      throw new BadRequestException('Cần blueprintId hoặc draft');
    }

    if (dto.activateFlows === true && canActivateFlows) {
      const validation = validateFunnelBlueprintDraft(draft);
      if (!validation.canActivate) {
        throw new BadRequestException({
          message: 'Funnel chưa đạt điểm activate — chạy validator trước',
          score: validation.score,
          blocking: validation.blocking,
          warnings: validation.warnings,
        });
      }
    }

    const stageResult = applyStages
      ? await this.pipeline.applyStageProposals(
          user.organizationId,
          draft.stages.map((s) => ({
            name: s.name,
            code: s.code,
            position: s.position,
            color: s.color,
            category: s.category,
            probability: s.probability,
            slaMinutes: s.slaMinutes,
            isWon: s.isWon,
            isLost: s.isLost ?? s.isLostStage,
          })),
          { deactivateMissing: dto.deactivateMissingStages === true },
        )
      : { stages: [], pipeline: await this.pipeline.listStages(user.organizationId), pipelineId: undefined };

    const createdFlows: Array<{ id: string; name: string; triggerType: string }> = [];
    if (applyFlows && draft.flows.length > 0) {
      const activate = dto.activateFlows === true && canActivateFlows;
      for (const flow of draft.flows) {
        const created = await this.automation.createFlow(
          user.organizationId,
          {
            name: flow.name,
            triggerType: flow.triggerType as AutomationTriggerType,
            funnelId: dto.funnelId,
            delayMinutes: flow.delayMinutes ?? 0,
            channel: flow.channel as MessageChannel | undefined,
            actions: flow.actions as never[],
            isActive: activate,
            isPaused: false,
          },
          user.id,
          canActivateFlows,
        );
        createdFlows.push({
          id: created.id,
          name: created.name,
          triggerType: created.triggerType,
        });
      }
    }

    const appliedMeta = {
      stagesApplied: stageResult.stages.length,
      flowsCreated: createdFlows.length,
      activateFlows: dto.activateFlows === true && canActivateFlows,
    };

    await this.prisma.funnelBlueprint.update({
      where: { id: blueprintId },
      data: {
        status: FunnelBlueprintStatus.APPLIED,
        appliedAt: new Date(),
        appliedMeta: appliedMeta as Prisma.InputJsonValue,
        draft: draft as unknown as Prisma.InputJsonValue,
        name: draft.name,
        summary: draft.summary,
      },
    });

    return {
      blueprintId,
      draft,
      stages: stageResult.stages,
      pipeline: stageResult.pipeline,
      flows: createdFlows,
      meta: appliedMeta,
    };
  }

  async discard(organizationId: string, id: string) {
    await this.getBlueprint(organizationId, id);
    return this.prisma.funnelBlueprint.update({
      where: { id },
      data: { status: FunnelBlueprintStatus.DISCARDED },
      select: { id: true, status: true },
    });
  }

  private async generateWithAi(
    prompt: string,
    industryHint: string | undefined,
    includeAutomations: boolean,
  ): Promise<FunnelBlueprintDraft> {
    const system = `Bạn là kiến trúc sư phễu CRM cho SaaS spa/beauty multi-tenant.
Trả về ĐÚNG 1 JSON object (không markdown) theo schema:
{
  "name": string,
  "summary": string,
  "industryHint": string,
  "stages": [{ "name": string, "code": string, "category"?: "OPEN"|"IN_PROGRESS"|"QUALIFIED"|"BOOKING"|"WON"|"LOST"|"CUSTOM", "position": number, "color"?: "#hex", "probability"?: number, "slaMinutes"?: number, "isWon"?: boolean, "isLost"?: boolean }],
  "flows": [{ "name": string, "triggerType": "LEAD_CREATED"|"LEAD_UNTOUCHED"|"LEAD_BOOKED"|"APPOINTMENT_CREATED"|"APPOINTMENT_24H_BEFORE"|"APPOINTMENT_2H_BEFORE"|"NO_SHOW"|"ORDER_COMPLETED"|"MANUAL"|..., "delayMinutes"?: number, "channel"?: "SMS"|"ZALO"|"EMAIL"|"MESSENGER", "actions": [{ "type": "CREATE_TASK"|"CHANGE_STATUS"|"ADD_TAG"|"ASSIGN_EMPLOYEE"|"SEND_MESSAGE"|"SEND_EMAIL"|"CREATE_APPOINTMENT", ... }], "rationale"?: string }]
}
Quy tắc:
- Stage code tự do trong pipeline; với spa nên dùng NEW/CONTACTED/QUALIFIED/BOOKED/CONFIRMED/VISITED/PURCHASED/LOST để tương thích legacy.
- Mỗi code xuất hiện tối đa 1 lần.
- LOST → isLost=true, category=LOST; PURCHASED → isWon=true, category=WON.
- flows dùng action types đã liệt kê; CHANGE_STATUS có thể dùng pipelineStatus (code) hoặc stageId.
- ${includeAutomations ? 'Tạo 2–5 flows thực tế.' : 'flows phải là [].'}
- Ngôn ngữ tên stage/flow: tiếng Việt.`;

    const userMsg = [
      `Yêu cầu người dùng: ${prompt}`,
      industryHint ? `Ngành gợi ý: ${industryHint}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.openAi.chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.4,
      maxTokens: 2000,
      timeoutMs: 45_000,
    });

    const jsonText = extractJsonObject(raw);
    const parsed = parseFunnelBlueprintDraft(JSON.parse(jsonText));
    if (!includeAutomations) {
      return normalizeFunnelBlueprintDraft({ ...parsed, flows: [] });
    }
    return normalizeFunnelBlueprintDraft(parsed);
  }
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
