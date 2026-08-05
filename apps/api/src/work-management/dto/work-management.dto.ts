import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

export class UpdateWorkProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class ChecklistItemInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateWorkTaskDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  columnId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsUUID()
  assignerId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  watcherIds?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  deadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  priority?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  labels?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemInputDto)
  @ArrayMaxSize(100)
  checklist?: ChecklistItemInputDto[];
}

export class UpdateWorkTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  assignerId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  watcherIds?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  deadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  priority?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemInputDto)
  checklist?: ChecklistItemInputDto[];
}

export class MoveWorkTaskDto {
  @IsUUID()
  columnId!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class WorkTaskQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeArchived?: boolean;
}

export class CreateWorkCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(30)
  mentionIds?: string[];
}

export class UpdateWorkCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(30)
  mentionIds?: string[];
}

export class SubmitReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}

export class ReviewDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}
