import { IsOptional, IsString } from 'class-validator';

export class SelectGoogleCustomerDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  /** MCC / manager account khi cần — không chứa token */
  @IsOptional()
  @IsString()
  loginCustomerId?: string;
}

export class SyncGoogleAdsDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
