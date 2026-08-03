import { IsString, MinLength } from 'class-validator';

export class ResendRegistrationOtpDto {
  @IsString()
  @MinLength(1)
  registrationId!: string;
}

export class VerifyRegistrationOtpDto {
  @IsString()
  @MinLength(1)
  otp!: string;

  @IsString()
  @MinLength(1)
  registrationId!: string;
}
