import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ResendRegistrationOtpDto {
  @IsOptional()
  @IsString()
  registrationId?: string;
}

export class VerifyRegistrationOtpDto {
  @IsOptional()
  @IsString()
  otp?: string;
  @IsOptional()
  @IsString()
  registrationId?: string;
}

