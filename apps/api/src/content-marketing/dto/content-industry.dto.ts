import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContentIndustryDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  slug?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

export class UpdateContentIndustryDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  slug?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

export class ListIndustriesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}

export class UpsertIndustryPreferenceDto {
  @IsOptional()
  @IsString()
  customIndustry?: string;
  @IsOptional()
  @IsString()
  industryId?: string;
  @IsOptional()
  @IsString()
  industryName?: string;
  @IsOptional()
  @IsString()
  scope?: string;
}

