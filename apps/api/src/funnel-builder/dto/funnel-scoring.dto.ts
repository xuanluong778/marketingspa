import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpsertFunnelScoringRuleDto {
  @IsString()
  @MaxLength(64)
  key!: string;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsString()
  @MaxLength(64)
  eventType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(-50)
  @Max(100)
  points!: number;

  @IsOptional()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpsertFunnelScoringDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  maxScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  mqlThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  sqlThreshold?: number;

  @IsOptional()
  @IsUUID()
  mqlStageId?: string;

  @IsOptional()
  @IsUUID()
  sqlStageId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertFunnelScoringRuleDto)
  rules?: UpsertFunnelScoringRuleDto[];
}

export class FunnelPublicCtaDto {
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ctaKey?: string;
}
