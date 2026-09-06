import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CloneFunnelTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string;

  /** Prefill required input values into definition.meta / blueprint summary */
  @IsOptional()
  @IsObject()
  inputValues?: Record<string, unknown>;
}

export class UpdateFunnelTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  goal?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  requiredInputs?: unknown[];

  @IsOptional()
  @IsArray()
  nodes?: unknown[];

  @IsOptional()
  @IsArray()
  connections?: unknown[];

  @IsOptional()
  @IsArray()
  recommendedAutomation?: unknown[];

  /** Full definition override (validated server-side) */
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ApplyFunnelTemplateDto {
  @IsOptional()
  @IsBoolean()
  applyStages?: boolean;

  @IsOptional()
  @IsBoolean()
  applyFlows?: boolean;

  @IsOptional()
  @IsBoolean()
  activateFlows?: boolean;

  @IsOptional()
  @IsBoolean()
  deactivateMissingStages?: boolean;

  @IsOptional()
  @IsObject()
  inputValues?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  pipelineName?: string;
}

export class ListFunnelTemplatesQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeSystem?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  orgOnly?: boolean;
}
