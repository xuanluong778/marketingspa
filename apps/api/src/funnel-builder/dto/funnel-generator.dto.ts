import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GenerateFunnelRecommendationsDto {
  /** "Bạn muốn AI tạo phễu như thế nào?" */
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productService?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  price?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  budget?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  audience?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  channels?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** @deprecated use productService / structured brief */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industryHint?: string;

  /** @deprecated use region */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  regionHint?: string;

  /** @deprecated use budget */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  budgetHint?: string;
}

export class SelectFunnelRecommendationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  templateSlug!: string;
}

export class SaveFunnelCompleteDraftDto {
  /** Full funnel-complete.v1 JSON (draft). Server re-validates schema + graph. */
  @IsObject()
  complete!: Record<string, unknown>;
}
