import { IsOptional, IsDateString } from 'class-validator';

export class EmployeePerformanceQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
