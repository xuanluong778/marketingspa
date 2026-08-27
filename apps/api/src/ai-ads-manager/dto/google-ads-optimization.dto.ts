import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GoogleAdsOptimizationAnalyzeDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetCpa?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetRoas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minClicks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gracePeriodHours?: number;
}

export class GoogleAdsOptimizationExplainDto {
  @IsString()
  analyzeResultJson!: string;
}
