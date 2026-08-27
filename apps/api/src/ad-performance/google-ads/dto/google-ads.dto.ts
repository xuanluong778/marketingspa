import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SelectGoogleCustomerDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  /** MCC / manager account khi cần — không chứa token. Direct-access thì bỏ trống. */
  @IsOptional()
  @IsString()
  loginCustomerId?: string;
}

export class SelectGoogleAccountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SelectGoogleCustomerDto)
  accounts!: SelectGoogleCustomerDto[];

  @IsOptional()
  @IsBoolean()
  deselectOthers?: boolean;

  @IsOptional()
  @IsBoolean()
  keepPrimary?: boolean;
}

export class SyncGoogleAdsDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
