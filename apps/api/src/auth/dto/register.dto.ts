import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  organizationName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug chỉ chứa chữ thường, số và dấu gạch ngang' })
  organizationSlug?: string;
}
