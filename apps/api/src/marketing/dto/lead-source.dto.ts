import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateLeadSourceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class UpdateLeadSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class LeadSourceQueryDto extends PaginationDto {}
