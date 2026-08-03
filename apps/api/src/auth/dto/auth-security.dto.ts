import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;
  @IsOptional()
  @IsString()
  newPassword?: string;
}

export class ForgotPasswordDto {
  @IsOptional()
  @IsString()
  email?: string;
}

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  password?: string;
  @IsOptional()
  @IsString()
  token?: string;
}

export class VerifyEmailDto {
  @IsOptional()
  @IsString()
  token?: string;
}

