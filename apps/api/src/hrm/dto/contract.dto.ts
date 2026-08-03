import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EmploymentContractStatus,
  EmploymentContractType,
} from '@marketingspa/database';

export class CreateEmploymentContractDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsEnum(EmploymentContractType)
  contractType!: EmploymentContractType;

  @IsOptional()
  @IsEnum(EmploymentContractStatus)
  status?: EmploymentContractStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salaryBase?: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateEmploymentContractDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsEnum(EmploymentContractType)
  contractType?: EmploymentContractType;

  @IsOptional()
  @IsEnum(EmploymentContractStatus)
  status?: EmploymentContractStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  salaryBase?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  fileUrl?: string | null;

  @IsOptional()
  @IsString()
  code?: string | null;

  @IsOptional()
  @IsString()
  currency?: string;
}
