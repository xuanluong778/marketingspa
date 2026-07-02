import {
  IsOptional,
  IsString,
  IsEmail,
  IsEnum,
  IsUUID,
  IsArray,
  IsDateString,
  MinLength,
} from 'class-validator';
import { Gender } from '@marketingspa/database';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Transform } from 'class-transformer';

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CustomerQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
