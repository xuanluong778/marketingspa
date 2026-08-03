import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ApproveAdsActionDto {
  @IsOptional()
  _unused?: never;
}

export class ProposeAdsActionDto {
  @IsOptional()
  _unused?: never;
}

export class RejectAdsActionDto {
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

