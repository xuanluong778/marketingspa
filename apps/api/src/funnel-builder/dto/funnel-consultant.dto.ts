import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FUNNEL_CONSULTANT_INTENTS, type FunnelConsultantIntent } from '@marketingspa/shared';

export class FunnelConsultantProposeDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt?: string;

  @IsOptional()
  @IsIn(FUNNEL_CONSULTANT_INTENTS)
  intent?: FunnelConsultantIntent;

  @IsOptional()
  @IsBoolean()
  includeAnalytics?: boolean;
}

export class FunnelConsultantApplyDto {
  /** Must be true — never apply without explicit user confirmation */
  @IsBoolean()
  confirm!: boolean;

  @IsObject()
  complete!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  specHash?: string;
}
