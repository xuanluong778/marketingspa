import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatbotSuggestDto {
  @IsIn(['greeting', 'services'])
  type!: 'greeting' | 'services';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  botName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  consultationTone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mainServices?: string;
}

export class ChatbotOptionsQueryDto {
  @IsOptional()
  @IsString()
  industry?: string;
}
