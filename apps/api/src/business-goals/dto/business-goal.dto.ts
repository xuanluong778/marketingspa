import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class BusinessGoalInputDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  averageRevenuePerTransaction!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentTransactionCount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  variableCostRate!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedCost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  leadConversionRate!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetProfit!: number;
}

export class CreateBusinessGoalScenarioDto extends BusinessGoalInputDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class BusinessGoalQueryDto extends PaginationDto {}
