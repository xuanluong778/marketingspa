import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { FUNNEL_PUBLISH_STATUSES, type FunnelPublishStatus } from '@marketingspa/shared';

export class FunnelPublishDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;
}

export class FunnelRestoreVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  versionId?: string;
}

export class ListFunnelLifecycleQueryDto {
  @IsOptional()
  @IsIn(FUNNEL_PUBLISH_STATUSES)
  status?: FunnelPublishStatus;
}
