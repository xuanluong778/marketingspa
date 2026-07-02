import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, PaymentMethod, PaymentStatus, ExpenseCategory } from '@marketingspa/database';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class OrderItemDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsString()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  unitPrice!: number;
}

export class CreateOrderDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @Type(() => Number)
  discount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @Type(() => Number)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreateExpenseDto {
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsString()
  description!: string;

  @Type(() => Number)
  amount!: number;

  @IsDateString()
  expenseDate!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  adCampaignId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  adCampaignId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class FinanceQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  expenseCategory?: ExpenseCategory;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  period?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
