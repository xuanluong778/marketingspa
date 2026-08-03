import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SYSTEM_ROLES } from '../../common/constants/roles';

const ROLE_CODES = Object.values(SYSTEM_ROLES);

export class CreateEmployeeAccountDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(ROLE_CODES)
  roleCode!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class ResetEmployeePasswordDto {
  @IsString()
  @MinLength(6)
  password!: string;
}
