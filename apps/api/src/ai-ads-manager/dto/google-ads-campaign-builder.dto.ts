import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GoogleAdsCampaignBriefDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  product!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  landingPage!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  objective!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  location!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  audience!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dailyBudget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyBudget?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class CreateGoogleAdsCampaignDraftDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  loginCustomerId?: string;

  @ValidateNested()
  @Type(() => GoogleAdsCampaignBriefDto)
  brief!: GoogleAdsCampaignBriefDto;
}

export class ApproveGoogleAdsCampaignDraftDto {
  @IsBoolean()
  confirm!: boolean;
}
