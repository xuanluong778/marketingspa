import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GenerateFunnelBlueprintDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industryHint?: string;

  @IsOptional()
  @IsBoolean()
  includeAutomations?: boolean;
}

export class ApplyFunnelBlueprintDto {
  @IsOptional()
  @IsUUID()
  blueprintId?: string;

  /** Optional inline draft — used when applying without saving first */
  @IsOptional()
  @IsObject()
  draft?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  applyStages?: boolean;

  @IsOptional()
  @IsBoolean()
  applyFlows?: boolean;

  /** Soft-deactivate org stages whose code is not in the draft */
  @IsOptional()
  @IsBoolean()
  deactivateMissingStages?: boolean;

  /** Create flows as active (requires automation.campaign.approve / OWNER) */
  @IsOptional()
  @IsBoolean()
  activateFlows?: boolean;

  /** Gắn AutomationFlow.funnelId = FunnelRecommendation.id */
  @IsOptional()
  @IsUUID()
  funnelId?: string;
}

export class ListFunnelBlueprintsQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'APPLIED', 'DISCARDED'])
  status?: 'DRAFT' | 'APPLIED' | 'DISCARDED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;
}
